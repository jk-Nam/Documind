import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// ====================================
// 로그 처리량 공격적 테스트 (EC2 한계 측정)
// ====================================
// 포트폴리오용: EC2 다운 걱정 없이 최대 성능 측정
// ====================================

const logsProcessed = new Counter('logs_processed');
const logsFailed = new Counter('logs_failed');
const errorRate = new Rate('error_rate');
const ingestionLatency = new Trend('ingestion_latency');

const API_BASE_URL = __ENV.API_BASE_URL || 'http://43.201.190.32.nip.io:8080';
const PROJECT_ID = __ENV.PROJECT_ID;
const API_KEY = __ENV.API_KEY;
const SCENARIO_NAME = __ENV.SCENARIO_NAME || 'Unknown';

// 🔥 공격적 부하: EC2 한계까지 밀어붙이기
export const options = {
    scenarios: {
        spike_test: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '30s', target: 50 },    // 빠른 Warm-up
                { duration: '1m', target: 150 },    // 저부하
                { duration: '1m', target: 300 },    // 중간부하
                { duration: '1m', target: 500 },    // 고부하 🔥
                { duration: '30s', target: 0 },     // 급격한 감소
            ],
            gracefulRampDown: '10s',
        },
    },
    thresholds: {
        'http_req_duration': ['p(95)<3000'],  // 느슨하게 (3초)
        'error_rate': ['rate<0.3'],           // 오류율 30% 미만
    },
};

function generateLogData() {
    const severities = ['ERROR', 'WARN', 'INFO'];
    const exceptionTypes = [
        'NullPointerException',
        'IllegalArgumentException',
        'SQLException',
        'IOException',
        'TimeoutException',
        'OutOfMemoryError'
    ];

    const services = [
        'AuthService',
        'PaymentService',
        'InventoryService',
        'QuestService',
        'BattleService'
    ];

    const severity = severities[Math.floor(Math.random() * severities.length)];
    const exception = exceptionTypes[Math.floor(Math.random() * exceptionTypes.length)];
    const service = services[Math.floor(Math.random() * services.length)];
    const lineNumber = Math.floor(Math.random() * 500) + 1;

    return {
        severity: severity,
        eventCategory: 'GameEvent',
        occurredAt: new Date().toISOString(),
        archive: `[${service}] ${exception}: Error at line ${lineNumber}`,
        resource: {
            service: service,
            environment: 'stress-test',
            version: '1.0.0',
            hostname: `game-server-${Math.floor(Math.random() * 5)}`
        },
        attributes: {
            exception: severity === 'ERROR' ? exception : null,
            logger: `kr.java.documind.game.${service}`,
            thread: `http-nio-8080-exec-${Math.floor(Math.random() * 20)}`,
            playerId: `player-${Math.floor(Math.random() * 10000)}`
        }
    };
}

export default function () {
    const payload = JSON.stringify({
        logs: [generateLogData()]
    });

    const params = {
        headers: {
            'Content-Type': 'application/json',
            'Api-Key': API_KEY
        },
        timeout: '15s',
    };

    const startTime = Date.now();
    const res = http.post(`${API_BASE_URL}/api/logs`, payload, params);
    const duration = Date.now() - startTime;

    ingestionLatency.add(duration);

    const success = check(res, {
        'status is 200': (r) => r.status === 200,
    });

    if (success) {
        logsProcessed.add(1);
        errorRate.add(0);
    } else {
        logsFailed.add(1);
        errorRate.add(1);
    }

    // 🔥 짧은 간격으로 최대 부하
    sleep(0.05); // 20 RPS per VU
}

export function handleSummary(data) {
    const totalRequests = data.metrics.http_reqs ? data.metrics.http_reqs.values.count : 0;
    const totalSuccess = data.metrics.logs_processed ? data.metrics.logs_processed.values.count : 0;
    const totalFailed = data.metrics.logs_failed ? data.metrics.logs_failed.values.count : 0;
    const testDurationSec = data.state.testRunDurationMs / 1000;
    const rps = totalRequests / testDurationSec;
    const successRps = totalSuccess / testDurationSec;

    const p50 = (data.metrics.http_req_duration && data.metrics.http_req_duration.values['p(50)']) || 0;
    const p95 = (data.metrics.http_req_duration && data.metrics.http_req_duration.values['p(95)']) || 0;
    const p99 = (data.metrics.http_req_duration && data.metrics.http_req_duration.values['p(99)']) || 0;
    const max = (data.metrics.http_req_duration && data.metrics.http_req_duration.values.max) || 0;

    const errorRateValue = data.metrics.error_rate ? data.metrics.error_rate.values.rate : 0;

    const maxVUs = 300; // Spike test max VUs
    const peakRps = successRps; // 피크 RPS 추정

    return {
        [`log-throughput-aggressive-${SCENARIO_NAME}.json`]: JSON.stringify({
            scenario: SCENARIO_NAME,
            testType: 'Aggressive Spike Test',
            summary: {
                totalRequests,
                totalSuccess,
                totalFailed,
                rps: rps.toFixed(2),
                successRps: successRps.toFixed(2),
                errorRate: (errorRateValue * 100).toFixed(2),
                maxVUs,
                peakRps: peakRps.toFixed(2)
            },
            latency: {
                p50: p50.toFixed(2),
                p95: p95.toFixed(2),
                p99: p99.toFixed(2),
                max: max.toFixed(2)
            }
        }, null, 2),
        stdout: `
========================================
🔥 공격적 로그 처리량 테스트 결과
========================================

📌 시나리오: ${SCENARIO_NAME}
🚀 테스트 유형: Spike Test (최대 ${maxVUs} VUs)
🌐 환경: ${API_BASE_URL}

📊 최대 처리량 (Peak Performance)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ⭐ 최대 RPS:       ${peakRps.toFixed(2)} 건/초
  총 처리:           ${totalSuccess.toLocaleString()} 건
  실패:              ${totalFailed.toLocaleString()} 건
  오류율:            ${(errorRateValue * 100).toFixed(2)}%

⏱️  응답 시간 (고부하 시)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  p50:               ${p50.toFixed(2)}ms
  p95:               ${p95.toFixed(2)}ms
  p99:               ${p99.toFixed(2)}ms
  max:               ${max.toFixed(2)}ms

💡 EC2 t3.small 한계 측정
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ${errorRateValue < 0.1 ? '✅' : errorRateValue < 0.3 ? '⚠️ ' : '❌'} 오류율 ${(errorRateValue * 100).toFixed(1)}% ${errorRateValue < 0.1 ? '(안정적)' : errorRateValue < 0.3 ? '(한계 근접)' : '(한계 초과)'}
  ${p95 < 1000 ? '✅' : p95 < 3000 ? '⚠️ ' : '❌'} p95 ${p95.toFixed(0)}ms ${p95 < 1000 ? '(우수)' : p95 < 3000 ? '(양호)' : '(느림)'}

🎯 권장 운영 RPS: ${(successRps * 0.7).toFixed(0)} 건/초 (여유율 30%)

========================================
`
    };
}
