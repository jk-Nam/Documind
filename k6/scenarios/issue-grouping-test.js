import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';

// 커스텀 메트릭
const groupingTime = new Trend('issue_grouping_time');
const duplicateDetected = new Counter('duplicate_detected');
const newIssueCreated = new Counter('new_issue_created');

const API_BASE_URL = __ENV.API_BASE_URL || 'http://localhost:8080';
const PROJECT_ID = __ENV.PROJECT_ID;
const API_KEY = __ENV.API_KEY;

export const options = {
    stages: [
        { duration: '1m', target: 10 },
        { duration: '5m', target: 50 },
        { duration: '3m', target: 100 },
        { duration: '1m', target: 10 },
    ],
    thresholds: {
        'http_req_duration': ['p(95)<1000'],
        'issue_grouping_time': ['p(95)<1500'],
    },
};

// Fingerprint 패턴 (의도적 중복 생성)
const fingerprintPatterns = [
    'NPE-PaymentService-processPayment-line42',
    'NPE-UserService-getUserById-line15',
    'IAE-OrderService-createOrder-line88',
    'SQL-ProductRepository-findAll-line24',
    'IO-FileService-uploadFile-line65',
];

function generateErrorLog(fingerprintPattern) {
    const parts = fingerprintPattern.split('-');
    const exceptionType = parts[0] === 'NPE' ? 'NullPointerException'
        : parts[0] === 'IAE' ? 'IllegalArgumentException'
        : parts[0] === 'SQL' ? 'SQLException'
        : 'IOException';

    const className = parts[1];
    const methodName = parts[2];
    const line = parts[3].replace('line', '');

    return {
        level: 'ERROR',
        message: `${exceptionType} in ${className}.${methodName}`,
        timestamp: new Date().toISOString(),
        logger: `kr.java.documind.service.${className}`,
        thread: `http-nio-8080-exec-${Math.floor(Math.random() * 10)}`,
        exception: {
            type: exceptionType,
            message: `Error at ${methodName}`,
            stackTrace: [
                `at kr.java.documind.service.${className}.${methodName}(${className}.java:${line})`,
                'at org.springframework.web.method.support.InvocableHandlerMethod.invoke',
                'at org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerAdapter.invokeHandlerMethod'
            ]
        },
        metadata: {
            fingerprint: fingerprintPattern,
            environment: 'test'
        }
    };
}

export default function () {
    // 70% 확률로 기존 패턴, 30% 확률로 새 패턴
    const useExistingPattern = Math.random() < 0.7;
    const fingerprintPattern = useExistingPattern
        ? fingerprintPatterns[Math.floor(Math.random() * fingerprintPatterns.length)]
        : `NEW-Service${Math.floor(Math.random() * 1000)}-method-line${Math.floor(Math.random() * 100)}`;

    const logData = generateErrorLog(fingerprintPattern);

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

    groupingTime.add(duration);

    const checkResult = check(res, {
        'status is 200': (r) => r.status === 200,
        'response has issueId': (r) => {
            try {
                const body = JSON.parse(r.body);
                return body.success && body.data && body.data.issueId !== undefined;
            } catch (e) {
                return false;
            }
        }
    });

    if (checkResult) {
        try {
            const body = JSON.parse(res.body);
            if (body.data.isNewIssue === true) {
                newIssueCreated.add(1);
            } else {
                duplicateDetected.add(1);
            }
        } catch (e) {
            console.error('Failed to parse response:', e);
        }
    }

    sleep(0.5);
}

export function handleSummary(data) {
    const totalRequests = data.metrics.http_reqs.values.count;
    const newIssues = data.metrics.new_issue_created ? data.metrics.new_issue_created.values.count : 0;
    const duplicates = data.metrics.duplicate_detected ? data.metrics.duplicate_detected.values.count : 0;
    const deduplicationRate = ((duplicates / totalRequests) * 100).toFixed(2);

    return {
        'issue-grouping-test-summary.json': JSON.stringify(data, null, 2),
        stdout: `
========================================
이슈 그룹화 성능 테스트 결과
========================================

총 로그 수집: ${totalRequests}
신규 이슈 생성: ${newIssues}
중복 감지 (기존 이슈): ${duplicates}
중복 제거율: ${deduplicationRate}%

그룹화 처리 시간:
  - avg: ${data.metrics.issue_grouping_time.values.avg.toFixed(2)}ms
  - p50: ${data.metrics.issue_grouping_time.values['p(50)'].toFixed(2)}ms
  - p95: ${data.metrics.issue_grouping_time.values['p(95)'].toFixed(2)}ms
  - p99: ${data.metrics.issue_grouping_time.values['p(99)'].toFixed(2)}ms

평가:
${data.metrics.issue_grouping_time.values['p(95)'] < 1500 ? '✅' : '❌'} p95 < 1500ms
${deduplicationRate >= 60 ? '✅' : '⚠️'} 중복 제거율 >= 60%
${data.metrics.http_req_failed.values.rate < 0.01 ? '✅' : '❌'} 오류율 < 1%

========================================
`
    };
}
