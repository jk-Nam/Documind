import http from 'k6/http';
<parameter name="check, sleep } from 'k6';
import { Trend, Gauge, Rate } from 'k6/metrics';

// 커스텀 메트릭
const redisLag = new Gauge('redis_lag');
const backpressureTriggered = new Gauge('backpressure_triggered');
const rejectedRequests = new Rate('rejected_requests');
const acceptedLatency = new Trend('accepted_latency');

const API_BASE_URL = __ENV.API_BASE_URL || 'http://localhost:8080';
const PROJECT_ID = __ENV.PROJECT_ID;
const API_KEY = __ENV.API_KEY;

// 백프레셔 임계값 (환경 변수로 설정 가능)
const BACKPRESSURE_THRESHOLD = parseInt(__ENV.BACKPRESSURE_THRESHOLD || '10000');

export const options = {
    scenarios: {
        // 시나리오 1: 급격한 부하 증가 (백프레셔 트리거)
        spike_load: {
            executor: 'ramping-arrival-rate',
            exec: 'sendLogs',
            startRate: 100,
            timeUnit: '1s',
            stages: [
                { duration: '30s', target: 100 },   // Warm-up
                { duration: '1m', target: 500 },    // 급증
                { duration: '2m', target: 2000 },   // 한계 돌파
                { duration: '1m', target: 1000 },   // 감소
                { duration: '1m', target: 100 },    // 정상화
            ],
            preAllocatedVUs: 200,
            maxVUs: 500,
        },

        // 시나리오 2: 백프레셔 모니터링 (백그라운드)
        monitor_backpressure: {
            executor: 'constant-vus',
            exec: 'monitorBackpressure',
            vus: 1,
            duration: '5m30s',
        },
    },
    thresholds: {
        'rejected_requests': ['rate<0.1'],  // 거부율 10% 이하 (백프레셔 정상 작동)
    },
};

// ==========================================
// 시나리오 1: 로그 전송 (백프레셔 대상)
// ==========================================
export function sendLogs() {
    const logData = {
        level: 'ERROR',
        message: `Backpressure test log ${Date.now()}-${Math.random()}`,
        timestamp: new Date().toISOString(),
        logger: 'kr.java.documind.backpressure.Test',
        thread: 'main',
        exception: {
            type: 'BackpressureTestException',
            message: 'Testing system limits',
            stackTrace: [
                'at kr.java.documind.backpressure.Test.run(Test.java:42)'
            ]
        },
        metadata: {
            scenario: 'backpressure-test',
            timestamp: Date.now()
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
            },
            timeout: '5s'
        }
    );
    const duration = new Date().getTime() - startTime;

    // 백프레셔 응답 확인
    if (res.status === 429 || res.status === 503) {
        // 429 Too Many Requests / 503 Service Unavailable
        rejectedRequests.add(1);
    } else if (res.status === 200) {
        rejectedRequests.add(0);
        acceptedLatency.add(duration);
    }

    check(res, {
        'backpressure or success': (r) => r.status === 200 || r.status === 429 || r.status === 503
    });

    // 백프레셔 발생 시 클라이언트 측 재시도 대기
    if (res.status === 429 || res.status === 503) {
        sleep(1);
    }
}

// ==========================================
// 시나리오 2: 백프레셔 모니터링
// ==========================================
export function monitorBackpressure() {
    const res = http.get(
        `${API_BASE_URL}/api/monitoring/redis-lag?projectId=${PROJECT_ID}`,
        {
            headers: {
                'X-API-Key': API_KEY
            }
        }
    );

    if (res.status === 200) {
        try {
            const body = JSON.parse(res.body);
            if (body.success && body.data) {
                const currentLag = body.data.lag || 0;
                const isBackpressureActive = body.data.backpressureActive || false;

                redisLag.add(currentLag);
                backpressureTriggered.add(isBackpressureActive ? 1 : 0);

                // 로그 출력 (임계값 초과 시)
                if (currentLag > BACKPRESSURE_THRESHOLD) {
                    console.log(`⚠️  Redis Lag exceeded threshold: ${currentLag} > ${BACKPRESSURE_THRESHOLD}`);
                }

                if (isBackpressureActive) {
                    console.log(`🔴 Backpressure ACTIVE - lag: ${currentLag}`);
                }
            }
        } catch (e) {
            console.error('Failed to parse monitoring response:', e);
        }
    }

    sleep(5); // 5초마다 모니터링
}

export function handleSummary(data) {
    const totalRequests = data.metrics.http_reqs.values.count;
    const rejectedCount = data.metrics.rejected_requests
        ? Math.round(data.metrics.rejected_requests.values.rate * totalRequests)
        : 0;
    const rejectedRate = data.metrics.rejected_requests
        ? (data.metrics.rejected_requests.values.rate * 100).toFixed(2)
        : '0.00';

    const maxLag = data.metrics.redis_lag ? data.metrics.redis_lag.values.max : 0;
    const backpressureActive = data.metrics.backpressure_triggered
        ? data.metrics.backpressure_triggered.values.value > 0
        : false;

    const hasLatencyData = data.metrics.accepted_latency && data.metrics.accepted_latency.values.count > 0;

    return {
        'backpressure-test-summary.json': JSON.stringify(data, null, 2),
        stdout: `
========================================
백프레셔 임계값 테스트 결과
========================================

테스트 설정:
  - 백프레셔 임계값: ${BACKPRESSURE_THRESHOLD}
  - 최대 부하: 2000 RPS

결과:
  총 요청 수: ${totalRequests}
  거부된 요청: ${rejectedCount}
  거부율: ${rejectedRate}%

Redis Stream Lag:
  - 최대 Lag: ${maxLag.toFixed(0)}
  - 백프레셔 발동 여부: ${backpressureActive ? '✅ 발동됨' : '❌ 미발동'}

수락된 요청 응답 시간:
  - p50: ${hasLatencyData ? data.metrics.accepted_latency.values['p(50)'].toFixed(2) : 'N/A'}ms
  - p95: ${hasLatencyData ? data.metrics.accepted_latency.values['p(95)'].toFixed(2) : 'N/A'}ms
  - p99: ${hasLatencyData ? data.metrics.accepted_latency.values['p(99)'].toFixed(2) : 'N/A'}ms

평가:
${maxLag > BACKPRESSURE_THRESHOLD ? '✅' : '⚠️'} Redis Lag이 임계값 초과 (${maxLag.toFixed(0)} > ${BACKPRESSURE_THRESHOLD})
${backpressureActive ? '✅' : '❌'} 백프레셔 메커니즘 작동
${rejectedRate < 10 ? '✅' : '⚠️'} 거부율 < 10%

💡 백프레셔 목적:
   - Redis Lag이 임계값을 초과하면 신규 요청 거부 (429/503)
   - Worker가 밀린 작업을 처리할 시간 확보
   - 시스템 과부하 방지

⚠️  주의: 백프레셔가 발동하지 않았다면 임계값을 낮추거나 부하를 더 높여보세요.

========================================
`
    };
}
