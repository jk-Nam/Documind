import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Gauge } from 'k6/metrics';

// 커스텀 메트릭
const pipelineLatency = new Gauge('pipeline_latency');
const redisLag = new Gauge('redis_lag');
const dbInsertCount = new Counter('db_insert_count');

const API_BASE_URL = __ENV.API_BASE_URL || 'http://localhost:8080';
const PROJECT_ID = __ENV.PROJECT_ID;
const API_KEY = __ENV.API_KEY;

export const options = {
    stages: [
        { duration: '1m', target: 20 },   // Warm-up
        { duration: '5m', target: 100 },  // Load Test
        { duration: '3m', target: 300 },  // Stress Test
        { duration: '1m', target: 20 },   // Cool-down
    ],
    thresholds: {
        'pipeline_latency': ['value<3000'],  // 파이프라인 지연 3초 이내
        'redis_lag': ['value<1000'],         // Redis Lag 1000 이하
    },
};

// 고유 ID 생성기 (중복 방지)
let logIdCounter = 0;

function generateTrackedLog() {
    const logId = `k6-test-${Date.now()}-${__VU}-${logIdCounter++}`;

    return {
        logId: logId,
        level: 'ERROR',
        message: `Pipeline test log ${logId}`,
        timestamp: new Date().toISOString(),
        logger: 'kr.java.documind.pipeline.Test',
        thread: 'main',
        exception: {
            type: 'TestException',
            message: 'Pipeline verification test',
            stackTrace: [
                'at kr.java.documind.pipeline.Test.run(Test.java:42)'
            ]
        },
        metadata: {
            testId: logId,
            stage: 'pipeline-test'
        }
    };
}

export default function () {
    const logData = generateTrackedLog();
    const logId = logData.logId;

    // 1단계: 로그 전송
    const sendTime = new Date().getTime();
    const sendRes = http.post(
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

    check(sendRes, {
        'log sent successfully': (r) => r.status === 200
    });

    // 2단계: Redis → Worker → DB 처리 대기
    sleep(2); // Worker 처리 시간 고려

    // 3단계: DB 조회로 파이프라인 완료 확인
    const verifyRes = http.get(
        `${API_BASE_URL}/api/logs/verify?logId=${logId}&projectId=${PROJECT_ID}`,
        {
            headers: {
                'X-API-Key': API_KEY
            }
        }
    );

    const verifyTime = new Date().getTime();
    const latency = verifyTime - sendTime;

    const verified = check(verifyRes, {
        'log found in DB': (r) => {
            try {
                const body = JSON.parse(r.body);
                return body.success === true && body.data.found === true;
            } catch (e) {
                return false;
            }
        }
    });

    if (verified) {
        pipelineLatency.add(latency);
        dbInsertCount.add(1);
    }

    // 4단계: Redis Lag 모니터링
    const lagRes = http.get(
        `${API_BASE_URL}/api/monitoring/redis-lag?projectId=${PROJECT_ID}`,
        {
            headers: {
                'X-API-Key': API_KEY
            }
        }
    );

    check(lagRes, {
        'lag metrics available': (r) => r.status === 200
    });

    try {
        const lagData = JSON.parse(lagRes.body);
        if (lagData.success && lagData.data.lag !== undefined) {
            redisLag.add(lagData.data.lag);
        }
    } catch (e) {
        console.error('Failed to parse lag metrics:', e);
    }

    sleep(1);
}

export function handleSummary(data) {
    const totalLogs = data.metrics.http_reqs.values.count / 3; // 각 VU가 3개 요청 (send, verify, lag)
    const successfulPipeline = data.metrics.db_insert_count.values.count;
    const successRate = (successfulPipeline / totalLogs * 100).toFixed(2);

    return {
        'redis-pipeline-test-summary.json': JSON.stringify(data, null, 2),
        stdout: `
========================================
Redis Stream 파이프라인 테스트 결과
========================================

총 로그 전송: ${totalLogs}
DB 저장 성공: ${successfulPipeline}
파이프라인 성공률: ${successRate}%

파이프라인 지연 시간:
  - avg: ${data.metrics.pipeline_latency.values.avg.toFixed(2)}ms
  - p95: ${data.metrics.pipeline_latency.values['p(95)'].toFixed(2)}ms
  - max: ${data.metrics.pipeline_latency.values.max.toFixed(2)}ms

Redis Lag:
  - avg: ${data.metrics.redis_lag.values.avg.toFixed(0)}
  - max: ${data.metrics.redis_lag.values.max.toFixed(0)}

평가:
${data.metrics.pipeline_latency.values['p(95)'] < 3000 ? '✅' : '❌'} 파이프라인 p95 < 3s
${data.metrics.redis_lag.values.max < 1000 ? '✅' : '⚠️'} Redis Lag < 1000
${successRate >= 99 ? '✅' : '❌'} 성공률 >= 99%

========================================
`
    };
}
