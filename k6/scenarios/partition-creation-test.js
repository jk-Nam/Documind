import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';

// 커스텀 메트릭
const queryDuringCreation = new Trend('query_during_creation');
const insertDuringCreation = new Trend('insert_during_creation');
const partitionCreationTime = new Trend('partition_creation_time');
const partitionsCreated = new Counter('partitions_created');

const API_BASE_URL = __ENV.API_BASE_URL || 'http://localhost:8080';
const PROJECT_ID = __ENV.PROJECT_ID;
const API_KEY = __ENV.API_KEY;

export const options = {
    scenarios: {
        // 시나리오 1: 파티션 생성 트리거 (단일 VU)
        partition_creator: {
            executor: 'constant-vus',
            exec: 'createPartition',
            vus: 1,
            duration: '10m',
        },

        // 시나리오 2: 쿼리 부하 (파티션 생성 중에도 실행)
        query_load: {
            executor: 'ramping-vus',
            exec: 'queryLoad',
            startVUs: 10,
            stages: [
                { duration: '1m', target: 30 },
                { duration: '5m', target: 50 },
                { duration: '3m', target: 80 },
                { duration: '1m', target: 30 },
            ],
        },

        // 시나리오 3: 로그 삽입 부하
        insert_load: {
            executor: 'ramping-vus',
            exec: 'insertLoad',
            startVUs: 5,
            stages: [
                { duration: '1m', target: 20 },
                { duration: '5m', target: 40 },
                { duration: '3m', target: 60 },
                { duration: '1m', target: 20 },
            ],
        },
    },
    thresholds: {
        'query_during_creation': ['p(95)<1000'],   // 파티션 생성 중에도 조회 성능 유지
        'insert_during_creation': ['p(95)<500'],   // 파티션 생성 중에도 삽입 성능 유지
    },
};

// ==========================================
// 시나리오 1: 새 주차 파티션 생성
// ==========================================
export function createPartition() {
    // 매주 월요일 00:00에 실행된다고 가정
    // 수동 트리거 API 호출 (관리자 전용)
    const startTime = new Date().getTime();

    const res = http.post(
        `${API_BASE_URL}/api/admin/partitions/create-next-week`,
        null,
        {
            headers: {
                'X-API-Key': API_KEY,
                'X-Admin-Key': __ENV.ADMIN_KEY || 'admin-key'
            }
        }
    );

    const duration = new Date().getTime() - startTime;

    const success = check(res, {
        'partition created': (r) => r.status === 200 || r.status === 409, // 409 = 이미 존재
        'no errors': (r) => {
            try {
                const body = JSON.parse(r.body);
                return body.success || r.status === 409;
            } catch (e) {
                return r.status === 409;
            }
        }
    });

    if (success && res.status === 200) {
        partitionCreationTime.add(duration);
        partitionsCreated.add(1);
    }

    sleep(60); // 1분마다 재시도 (실제로는 이미 생성되어 있으면 스킵)
}

// ==========================================
// 시나리오 2: 조회 부하
// ==========================================
export function queryLoad() {
    const { startDate, endDate } = getRecentWeekRange();

    const startTime = new Date().getTime();
    const res = http.get(
        `${API_BASE_URL}/api/logs?projectId=${PROJECT_ID}&startDate=${startDate}&endDate=${endDate}&page=0&size=50`,
        {
            headers: {
                'X-API-Key': API_KEY
            }
        }
    );
    const duration = new Date().getTime() - startTime;

    check(res, {
        'query success during creation': (r) => r.status === 200
    });

    queryDuringCreation.add(duration);

    sleep(0.5);
}

// ==========================================
// 시나리오 3: 삽입 부하
// ==========================================
export function insertLoad() {
    const logData = {
        level: 'INFO',
        message: `Partition creation test log ${Date.now()}`,
        timestamp: new Date().toISOString(),
        logger: 'kr.java.documind.partition.Test',
        thread: 'main',
        metadata: {
            scenario: 'partition-creation-test'
        }
    };

    const startTime = new Date().getTime();
    const res = http.post(
        `${API_BASE_URL}/api/logs/collect`,
        JSON.stringify(logData),
        {
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': API_KEY,
                'X-Project-Id': PROJECT_ID
            }
        }
    );
    const duration = new Date().getTime() - startTime;

    check(res, {
        'insert success during creation': (r) => r.status === 200
    });

    insertDuringCreation.add(duration);

    sleep(0.2);
}

// ==========================================
// Helper Functions
// ==========================================
function getRecentWeekRange() {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 7);

    return {
        startDate: start.toISOString(),
        endDate: end.toISOString()
    };
}

export function handleSummary(data) {
    const hasQueryData = data.metrics.query_during_creation && data.metrics.query_during_creation.values.count > 0;
    const hasInsertData = data.metrics.insert_during_creation && data.metrics.insert_during_creation.values.count > 0;
    const hasCreationData = data.metrics.partition_creation_time && data.metrics.partition_creation_time.values.count > 0;
    const createdCount = data.metrics.partitions_created ? data.metrics.partitions_created.values.count : 0;

    return {
        'partition-creation-test-summary.json': JSON.stringify(data, null, 2),
        stdout: `
========================================
파티션 생성 중 성능 테스트 결과
========================================

테스트 시나리오:
  - 새 주차 파티션 생성 (백그라운드)
  - 동시 조회/삽입 부하 실행
  → 무중단 운영 검증

1. 파티션 생성
   - 생성된 파티션 수: ${createdCount}
   - 생성 시간: ${hasCreationData ? data.metrics.partition_creation_time.values.avg.toFixed(2) : 'N/A'}ms

2. 조회 성능 (파티션 생성 중)
   - 요청 수: ${hasQueryData ? data.metrics.query_during_creation.values.count : 0}
   - p50: ${hasQueryData ? data.metrics.query_during_creation.values['p(50)'].toFixed(2) : 'N/A'}ms
   - p95: ${hasQueryData ? data.metrics.query_during_creation.values['p(95)'].toFixed(2) : 'N/A'}ms
   - p99: ${hasQueryData ? data.metrics.query_during_creation.values['p(99)'].toFixed(2) : 'N/A'}ms

3. 삽입 성능 (파티션 생성 중)
   - 요청 수: ${hasInsertData ? data.metrics.insert_during_creation.values.count : 0}
   - p50: ${hasInsertData ? data.metrics.insert_during_creation.values['p(50)'].toFixed(2) : 'N/A'}ms
   - p95: ${hasInsertData ? data.metrics.insert_during_creation.values['p(95)'].toFixed(2) : 'N/A'}ms
   - p99: ${hasInsertData ? data.metrics.insert_during_creation.values['p(99)'].toFixed(2) : 'N/A'}ms

평가:
${hasQueryData && data.metrics.query_during_creation.values['p(95)'] < 1000 ? '✅' : '❌'} 조회 p95 < 1s (파티션 생성 중)
${hasInsertData && data.metrics.insert_during_creation.values['p(95)'] < 500 ? '✅' : '❌'} 삽입 p95 < 500ms (파티션 생성 중)
${createdCount > 0 ? '✅' : '⚠️'} 파티션 생성 성공

💡 이 테스트는 새 주차 파티션 생성 시 기존 작업에 영향이 없는지 확인합니다.
   (무중단 운영 검증)

========================================
`
    };
}
