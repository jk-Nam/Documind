import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

// 커스텀 메트릭
const e2eLatency = new Trend('e2e_latency');              // 로그 → 이슈 생성 → 조회 완료
const logToIssueLatency = new Trend('log_to_issue');      // 로그 → 이슈 생성
const issueToQueryLatency = new Trend('issue_to_query');  // 이슈 → 조회 가능
const e2eSuccess = new Rate('e2e_success');

const API_BASE_URL = __ENV.API_BASE_URL || 'http://localhost:8080';
const PROJECT_ID = __ENV.PROJECT_ID;
const API_KEY = __ENV.API_KEY;

export const options = {
    stages: [
        { duration: '1m', target: 5 },
        { duration: '5m', target: 20 },
        { duration: '3m', target: 50 },
        { duration: '1m', target: 5 },
    ],
    thresholds: {
        'e2e_latency': ['p(95)<5000'],        // 전체 p95 < 5s
        'log_to_issue': ['p(95)<3000'],       // 로그→이슈 p95 < 3s
        'issue_to_query': ['p(95)<1000'],     // 이슈→조회 p95 < 1s
        'e2e_success': ['rate>0.95'],         // 성공률 95% 이상
    },
};

let testIdCounter = 0;

function generateUniqueErrorLog() {
    const testId = `e2e-${Date.now()}-${__VU}-${testIdCounter++}`;

    return {
        testId: testId,
        level: 'ERROR',
        message: `End-to-end test error ${testId}`,
        timestamp: new Date().toISOString(),
        logger: 'kr.java.documind.e2e.Test',
        thread: 'main',
        exception: {
            type: 'E2ETestException',
            message: 'Latency measurement test',
            stackTrace: [
                `at kr.java.documind.e2e.Test.run(Test.java:${Math.floor(Math.random() * 100)})`
            ]
        },
        metadata: {
            testId: testId,
            purpose: 'e2e-latency-test'
        }
    };
}

export default function () {
    const logData = generateUniqueErrorLog();
    const testId = logData.testId;

    // ==========================================
    // 1단계: 로그 수집 API 호출
    // ==========================================
    const t0 = new Date().getTime();

    const logRes = http.post(
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

    const logSuccess = check(logRes, {
        'log collected': (r) => r.status === 200
    });

    if (!logSuccess) {
        e2eSuccess.add(0);
        return;
    }

    // ==========================================
    // 2단계: 이슈 생성 확인 (폴링)
    // ==========================================
    sleep(1); // Worker 처리 대기

    let issueId = null;
    let issueFound = false;
    const maxRetries = 10;

    for (let i = 0; i < maxRetries; i++) {
        const issueRes = http.get(
            `${API_BASE_URL}/api/issues?projectId=${PROJECT_ID}&search=${encodeURIComponent(testId)}`,
            {
                headers: {
                    'X-API-Key': API_KEY
                }
            }
        );

        if (issueRes.status === 200) {
            try {
                const body = JSON.parse(issueRes.body);
                if (body.success && body.data && body.data.content && body.data.content.length > 0) {
                    issueId = body.data.content[0].id;
                    issueFound = true;

                    const t1 = new Date().getTime();
                    logToIssueLatency.add(t1 - t0);
                    break;
                }
            } catch (e) {
                console.error('Failed to parse issue response:', e);
            }
        }

        sleep(0.5);
    }

    if (!issueFound) {
        console.error(`Issue not created for testId: ${testId}`);
        e2eSuccess.add(0);
        return;
    }

    // ==========================================
    // 3단계: 이슈 상세 조회
    // ==========================================
    const t2 = new Date().getTime();

    const detailRes = http.get(
        `${API_BASE_URL}/api/issues/${issueId}?projectId=${PROJECT_ID}`,
        {
            headers: {
                'X-API-Key': API_KEY
            }
        }
    );

    const detailSuccess = check(detailRes, {
        'issue detail retrieved': (r) => r.status === 200,
        'issue has correct data': (r) => {
            try {
                const body = JSON.parse(r.body);
                return body.success && body.data && body.data.id === issueId;
            } catch (e) {
                return false;
            }
        }
    });

    const t3 = new Date().getTime();

    if (detailSuccess) {
        issueToQueryLatency.add(t3 - t2);
        e2eLatency.add(t3 - t0);
        e2eSuccess.add(1);
    } else {
        e2eSuccess.add(0);
    }

    sleep(1);
}

export function handleSummary(data) {
    const hasE2EData = data.metrics.e2e_latency && data.metrics.e2e_latency.values.count > 0;
    const hasLogData = data.metrics.log_to_issue && data.metrics.log_to_issue.values.count > 0;
    const hasQueryData = data.metrics.issue_to_query && data.metrics.issue_to_query.values.count > 0;
    const successRate = data.metrics.e2e_success ? (data.metrics.e2e_success.values.rate * 100).toFixed(2) : '0.00';

    return {
        'end-to-end-latency-summary.json': JSON.stringify(data, null, 2),
        stdout: `
========================================
종단 간 지연 시간 측정 결과
========================================

테스트 시나리오:
  로그 수집 → 이슈 생성 → 이슈 조회

전체 종단 간 지연 (E2E):
  - avg: ${hasE2EData ? data.metrics.e2e_latency.values.avg.toFixed(2) : 'N/A'}ms
  - p50: ${hasE2EData ? data.metrics.e2e_latency.values['p(50)'].toFixed(2) : 'N/A'}ms
  - p95: ${hasE2EData ? data.metrics.e2e_latency.values['p(95)'].toFixed(2) : 'N/A'}ms
  - p99: ${hasE2EData ? data.metrics.e2e_latency.values['p(99)'].toFixed(2) : 'N/A'}ms
  - max: ${hasE2EData ? data.metrics.e2e_latency.values.max.toFixed(2) : 'N/A'}ms

세부 구간:
  1) 로그 → 이슈 생성
     - p95: ${hasLogData ? data.metrics.log_to_issue.values['p(95)'].toFixed(2) : 'N/A'}ms

  2) 이슈 → 조회 가능
     - p95: ${hasQueryData ? data.metrics.issue_to_query.values['p(95)'].toFixed(2) : 'N/A'}ms

성공률: ${successRate}%

평가:
${hasE2EData && data.metrics.e2e_latency.values['p(95)'] < 5000 ? '✅' : '❌'} 전체 E2E p95 < 5s
${hasLogData && data.metrics.log_to_issue.values['p(95)'] < 3000 ? '✅' : '❌'} 로그→이슈 p95 < 3s
${hasQueryData && data.metrics.issue_to_query.values['p(95)'] < 1000 ? '✅' : '❌'} 이슈→조회 p95 < 1s
${successRate >= 95 ? '✅' : '❌'} 성공률 >= 95%

========================================
`
    };
}
