import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// 커스텀 메트릭
const errorRate = new Rate('errors');
const logIngestionTime = new Trend('log_ingestion_time');

// 환경 변수
const API_BASE_URL = __ENV.API_BASE_URL || 'http://localhost:8080';
const PROJECT_ID = __ENV.PROJECT_ID;
const API_KEY = __ENV.API_KEY;

// 단계적 부하 증가
export const options = {
    stages: [
        { duration: '1m', target: 10 },   // Warm-up: 10 VUs
        { duration: '5m', target: 50 },   // Load Test: 50 VUs
        { duration: '3m', target: 200 },  // Stress Test: 200 VUs
        { duration: '1m', target: 10 },   // Cool-down: 10 VUs
    ],
    thresholds: {
        'http_req_duration': ['p(95)<500'],  // 95% 요청이 500ms 이내
        'http_req_failed': ['rate<0.01'],    // 오류율 1% 미만
        'errors': ['rate<0.01'],
    },
};

// 로그 데이터 생성기
function generateLogData() {
    const logLevels = ['ERROR', 'WARN', 'INFO', 'DEBUG'];
    const exceptionTypes = [
        'NullPointerException',
        'IllegalArgumentException',
        'SQLException',
        'IOException',
        'RuntimeException'
    ];

    const level = logLevels[Math.floor(Math.random() * logLevels.length)];
    const exception = exceptionTypes[Math.floor(Math.random() * exceptionTypes.length)];

    return {
        level: level,
        message: `Test exception: ${exception} at line ${Math.floor(Math.random() * 1000)}`,
        timestamp: new Date().toISOString(),
        logger: 'kr.java.documind.test.Service',
        thread: `http-nio-8080-exec-${Math.floor(Math.random() * 10)}`,
        exception: level === 'ERROR' ? {
            type: exception,
            message: 'Test error message',
            stackTrace: [
                `at kr.java.documind.test.Service.method(Service.java:${Math.floor(Math.random() * 100)})`,
                'at org.springframework.web.method.support.InvocableHandlerMethod.invoke',
                'at org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerAdapter.invokeHandlerMethod'
            ]
        } : null,
        metadata: {
            environment: 'test',
            version: '1.0.0',
            hostname: `server-${Math.floor(Math.random() * 10)}`
        }
    };
}

export default function () {
    const payload = JSON.stringify(generateLogData());

    const params = {
        headers: {
            'Content-Type': 'application/json',
            'X-API-Key': API_KEY,
            'X-Project-Id': PROJECT_ID
        },
    };

    const startTime = new Date().getTime();
    const res = http.post(`${API_BASE_URL}/api/logs/collect`, payload, params);
    const duration = new Date().getTime() - startTime;

    // 메트릭 기록
    logIngestionTime.add(duration);

    // 응답 검증
    const checkResult = check(res, {
        'status is 200': (r) => r.status === 200,
        'response time < 500ms': (r) => r.timings.duration < 500,
        'has success field': (r) => {
            try {
                const body = JSON.parse(r.body);
                return body.success === true;
            } catch (e) {
                return false;
            }
        }
    });

    errorRate.add(!checkResult);

    // 요청 간 간격 (RPS 조절)
    sleep(0.1); // 100ms (VU당 10 RPS)
}

export function handleSummary(data) {
    return {
        'log-collection-stress-summary.json': JSON.stringify(data, null, 2),
        stdout: `
========================================
로그 수집 API 부하 테스트 결과
========================================

총 요청 수: ${data.metrics.http_reqs.values.count}
성공 요청: ${data.metrics.http_reqs.values.count - data.metrics.http_req_failed.values.passes}
실패 요청: ${data.metrics.http_req_failed.values.passes}
오류율: ${(data.metrics.errors.values.rate * 100).toFixed(2)}%

응답 시간:
  - p50: ${data.metrics.http_req_duration.values['p(50)']}ms
  - p95: ${data.metrics.http_req_duration.values['p(95)']}ms
  - p99: ${data.metrics.http_req_duration.values['p(99)']}ms
  - max: ${data.metrics.http_req_duration.values.max}ms

RPS: ${(data.metrics.http_reqs.values.count / data.state.testRunDurationMs * 1000).toFixed(2)}

로그 적재 시간:
  - avg: ${data.metrics.log_ingestion_time.values.avg.toFixed(2)}ms
  - p95: ${data.metrics.log_ingestion_time.values['p(95)'].toFixed(2)}ms

========================================
`
    };
}
