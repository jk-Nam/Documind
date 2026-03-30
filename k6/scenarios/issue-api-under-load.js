import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';
import { group } from 'k6';

// 커스텀 메트릭
const issueListLatency = new Trend('issue_list_latency');
const issueDetailLatency = new Trend('issue_detail_latency');
const logCollectionLatency = new Trend('log_collection_latency');
const concurrentOperations = new Counter('concurrent_operations');

const API_BASE_URL = __ENV.API_BASE_URL || 'http://localhost:8080';
const PROJECT_ID = __ENV.PROJECT_ID;
const API_KEY = __ENV.API_KEY;

export const options = {
    scenarios: {
        // 시나리오 1: 로그 수집 부하 (백그라운드)
        log_collection_load: {
            executor: 'ramping-vus',
            exec: 'logCollection',
            startVUs: 10,
            stages: [
                { duration: '1m', target: 50 },
                { duration: '5m', target: 100 },
                { duration: '2m', target: 150 },
                { duration: '2m', target: 100 },
            ],
            gracefulStop: '30s',
        },

        // 시나리오 2: 이슈 조회 API (동시 실행)
        issue_query_load: {
            executor: 'ramping-vus',
            exec: 'issueQuery',
            startVUs: 5,
            stages: [
                { duration: '1m', target: 20 },
                { duration: '5m', target: 50 },
                { duration: '2m', target: 80 },
                { duration: '2m', target: 50 },
            ],
            gracefulStop: '30s',
        },
    },
    thresholds: {
        'issue_list_latency': ['p(95)<1000'],    // 로그 수집 중에도 1초 이내
        'issue_detail_latency': ['p(95)<800'],
        'log_collection_latency': ['p(95)<500'],
    },
};

// ==========================================
// 시나리오 1: 로그 수집 부하
// ==========================================
export function logCollection() {
    const logData = {
        level: 'ERROR',
        message: `Concurrent test log ${Date.now()}`,
        timestamp: new Date().toISOString(),
        logger: 'kr.java.documind.concurrent.Test',
        thread: 'main',
        exception: {
            type: 'ConcurrentTestException',
            message: 'Testing under load',
            stackTrace: [
                'at kr.java.documind.concurrent.Test.run(Test.java:42)'
            ]
        },
        metadata: {
            scenario: 'log-collection-load'
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
        'log collection success': (r) => r.status === 200
    });

    logCollectionLatency.add(duration);
    concurrentOperations.add(1);

    sleep(0.1);
}

// ==========================================
// 시나리오 2: 이슈 조회 API
// ==========================================
export function issueQuery() {
    group('Issue List Query', () => {
        const startTime = new Date().getTime();
        const res = http.get(
            `${API_BASE_URL}/api/issues?projectId=${PROJECT_ID}&status=TODO&page=0&size=20`,
            {
                headers: {
                    'X-API-Key': API_KEY
                }
            }
        );
        const duration = new Date().getTime() - startTime;

        check(res, {
            'issue list success': (r) => r.status === 200,
            'has issues': (r) => {
                try {
                    const body = JSON.parse(r.body);
                    return body.success && body.data && Array.isArray(body.data.content);
                } catch (e) {
                    return false;
                }
            }
        });

        issueListLatency.add(duration);
        concurrentOperations.add(1);
    });

    sleep(0.3);

    // 상세 조회 (50% 확률)
    if (Math.random() < 0.5) {
        group('Issue Detail Query', () => {
            // 임의의 이슈 ID 조회 (1~100 범위)
            const issueId = Math.floor(Math.random() * 100) + 1;

            const startTime = new Date().getTime();
            const res = http.get(
                `${API_BASE_URL}/api/issues/${issueId}?projectId=${PROJECT_ID}`,
                {
                    headers: {
                        'X-API-Key': API_KEY
                    }
                }
            );
            const duration = new Date().getTime() - startTime;

            check(res, {
                'issue detail retrieved': (r) => r.status === 200 || r.status === 404
            });

            if (res.status === 200) {
                issueDetailLatency.add(duration);
            }

            concurrentOperations.add(1);
        });
    }

    sleep(0.5);
}

export function handleSummary(data) {
    const hasListData = data.metrics.issue_list_latency && data.metrics.issue_list_latency.values.count > 0;
    const hasDetailData = data.metrics.issue_detail_latency && data.metrics.issue_detail_latency.values.count > 0;
    const hasLogData = data.metrics.log_collection_latency && data.metrics.log_collection_latency.values.count > 0;

    return {
        'issue-api-under-load-summary.json': JSON.stringify(data, null, 2),
        stdout: `
========================================
로그 수집 중 이슈 API 성능 테스트 결과
========================================

테스트 시나리오:
  - 로그 수집 부하 (최대 150 VUs)
  - 이슈 조회 API (최대 80 VUs)
  → 동시 실행

총 동시 작업 수: ${data.metrics.concurrent_operations ? data.metrics.concurrent_operations.values.count : 0}

1. 이슈 목록 조회 (동시 부하 중)
   - 요청 수: ${hasListData ? data.metrics.issue_list_latency.values.count : 0}
   - p50: ${hasListData ? data.metrics.issue_list_latency.values['p(50)'].toFixed(2) : 'N/A'}ms
   - p95: ${hasListData ? data.metrics.issue_list_latency.values['p(95)'].toFixed(2) : 'N/A'}ms
   - p99: ${hasListData ? data.metrics.issue_list_latency.values['p(99)'].toFixed(2) : 'N/A'}ms

2. 이슈 상세 조회 (동시 부하 중)
   - 요청 수: ${hasDetailData ? data.metrics.issue_detail_latency.values.count : 0}
   - p50: ${hasDetailData ? data.metrics.issue_detail_latency.values['p(50)'].toFixed(2) : 'N/A'}ms
   - p95: ${hasDetailData ? data.metrics.issue_detail_latency.values['p(95)'].toFixed(2) : 'N/A'}ms
   - p99: ${hasDetailData ? data.metrics.issue_detail_latency.values['p(99)'].toFixed(2) : 'N/A'}ms

3. 로그 수집 성능 (동시 부하 중)
   - 요청 수: ${hasLogData ? data.metrics.log_collection_latency.values.count : 0}
   - p95: ${hasLogData ? data.metrics.log_collection_latency.values['p(95)'].toFixed(2) : 'N/A'}ms

평가:
${hasListData && data.metrics.issue_list_latency.values['p(95)'] < 1000 ? '✅' : '❌'} 이슈 목록 p95 < 1s (로그 수집 중)
${hasDetailData && data.metrics.issue_detail_latency.values['p(95)'] < 800 ? '✅' : '❌'} 이슈 상세 p95 < 800ms (로그 수집 중)
${hasLogData && data.metrics.log_collection_latency.values['p(95)'] < 500 ? '✅' : '❌'} 로그 수집 p95 < 500ms (조회 API 동시 실행 중)

💡 이 테스트는 로그 수집 부하가 이슈 조회 API에 영향을 주지 않는지 확인합니다.
   (리소스 격리성 검증)

========================================
`
    };
}
