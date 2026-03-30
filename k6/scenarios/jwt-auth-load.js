import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter, Rate } from 'k6/metrics';
import { group } from 'k6';

// 커스텀 메트릭
const loginLatency = new Trend('login_latency');
const tokenRefreshLatency = new Trend('token_refresh_latency');
const authenticatedApiLatency = new Trend('authenticated_api_latency');
const authFailures = new Rate('auth_failures');
const successfulLogins = new Counter('successful_logins');
const tokenRefreshCount = new Counter('token_refresh_count');

const API_BASE_URL = __ENV.API_BASE_URL || 'http://localhost:8080';

export const options = {
    stages: [
        { duration: '1m', target: 20 },    // Warm-up
        { duration: '3m', target: 100 },   // Load Test
        { duration: '2m', target: 200 },   // Stress Test
        { duration: '1m', target: 20 },    // Cool-down
    ],
    thresholds: {
        'login_latency': ['p(95)<1000'],              // 로그인 p95 < 1s
        'token_refresh_latency': ['p(95)<500'],       // 토큰 갱신 p95 < 500ms
        'authenticated_api_latency': ['p(95)<800'],   // 인증 API p95 < 800ms
        'auth_failures': ['rate<0.01'],               // 인증 실패율 < 1%
    },
};

// 테스트용 사용자 풀 (사전 생성 필요)
const TEST_USERS = [
    { email: 'test1@documind.com', password: 'Test1234!' },
    { email: 'test2@documind.com', password: 'Test1234!' },
    { email: 'test3@documind.com', password: 'Test1234!' },
    { email: 'test4@documind.com', password: 'Test1234!' },
    { email: 'test5@documind.com', password: 'Test1234!' },
];

// VU별 토큰 저장소
let accessToken = null;
let refreshToken = null;

export default function () {
    // 각 VU는 랜덤 사용자 선택
    const user = TEST_USERS[__VU % TEST_USERS.length];

    // ==========================================
    // 1. 로그인 (JWT 발급)
    // ==========================================
    group('Login', () => {
        const loginPayload = JSON.stringify({
            email: user.email,
            password: user.password
        });

        const startTime = new Date().getTime();
        const res = http.post(
            `${API_BASE_URL}/api/auth/login`,
            loginPayload,
            {
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );
        const duration = new Date().getTime() - startTime;

        loginLatency.add(duration);

        const loginSuccess = check(res, {
            'login success': (r) => r.status === 200,
            'has tokens': (r) => {
                try {
                    const body = JSON.parse(r.body);
                    return body.success && body.data && body.data.accessToken && body.data.refreshToken;
                } catch (e) {
                    return false;
                }
            }
        });

        if (loginSuccess) {
            try {
                const body = JSON.parse(res.body);
                accessToken = body.data.accessToken;
                refreshToken = body.data.refreshToken;
                successfulLogins.add(1);
                authFailures.add(0);
            } catch (e) {
                console.error('Failed to parse login response:', e);
                authFailures.add(1);
                return;
            }
        } else {
            authFailures.add(1);
            console.error(`Login failed for ${user.email}: ${res.status}`);
            return;
        }
    });

    sleep(1);

    // ==========================================
    // 2. 인증이 필요한 API 호출 (프로젝트 목록 조회)
    // ==========================================
    group('Authenticated API Call', () => {
        const startTime = new Date().getTime();
        const res = http.get(
            `${API_BASE_URL}/api/projects`,
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            }
        );
        const duration = new Date().getTime() - startTime;

        authenticatedApiLatency.add(duration);

        const apiSuccess = check(res, {
            'authenticated api success': (r) => r.status === 200,
            'has project data': (r) => {
                try {
                    const body = JSON.parse(r.body);
                    return body.success && body.data && Array.isArray(body.data);
                } catch (e) {
                    return false;
                }
            }
        });

        if (!apiSuccess) {
            authFailures.add(1);
        } else {
            authFailures.add(0);
        }
    });

    sleep(2);

    // ==========================================
    // 3. 토큰 갱신 (30% 확률)
    // ==========================================
    if (Math.random() < 0.3) {
        group('Token Refresh', () => {
            const refreshPayload = JSON.stringify({
                refreshToken: refreshToken
            });

            const startTime = new Date().getTime();
            const res = http.post(
                `${API_BASE_URL}/api/auth/refresh`,
                refreshPayload,
                {
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            );
            const duration = new Date().getTime() - startTime;

            tokenRefreshLatency.add(duration);

            const refreshSuccess = check(res, {
                'token refresh success': (r) => r.status === 200,
                'has new access token': (r) => {
                    try {
                        const body = JSON.parse(r.body);
                        return body.success && body.data && body.data.accessToken;
                    } catch (e) {
                        return false;
                    }
                }
            });

            if (refreshSuccess) {
                try {
                    const body = JSON.parse(res.body);
                    accessToken = body.data.accessToken;
                    tokenRefreshCount.add(1);
                    authFailures.add(0);
                } catch (e) {
                    console.error('Failed to parse refresh response:', e);
                    authFailures.add(1);
                }
            } else {
                authFailures.add(1);
            }
        });

        sleep(1);
    }

    // ==========================================
    // 4. 여러 인증 API 연속 호출 (실제 사용 패턴)
    // ==========================================
    group('Multiple Authenticated Calls', () => {
        // 이슈 목록 조회
        http.get(
            `${API_BASE_URL}/api/issues?status=TODO&page=0&size=20`,
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                },
                tags: { api: 'issues' }
            }
        );

        sleep(0.5);

        // 알림 목록 조회
        http.get(
            `${API_BASE_URL}/api/notifications?page=0&size=10`,
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                },
                tags: { api: 'notifications' }
            }
        );

        sleep(0.5);

        // 프로필 조회
        http.get(
            `${API_BASE_URL}/api/members/me`,
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                },
                tags: { api: 'profile' }
            }
        );
    });

    sleep(2);
}

export function handleSummary(data) {
    const totalLogins = data.metrics.successful_logins ? data.metrics.successful_logins.values.count : 0;
    const totalRefreshes = data.metrics.token_refresh_count ? data.metrics.token_refresh_count.values.count : 0;
    const failureRate = data.metrics.auth_failures ? (data.metrics.auth_failures.values.rate * 100).toFixed(2) : '0.00';

    const hasLoginData = data.metrics.login_latency && data.metrics.login_latency.values.count > 0;
    const hasRefreshData = data.metrics.token_refresh_latency && data.metrics.token_refresh_latency.values.count > 0;
    const hasApiData = data.metrics.authenticated_api_latency && data.metrics.authenticated_api_latency.values.count > 0;

    return {
        'jwt-auth-load-summary.json': JSON.stringify(data, null, 2),
        stdout: `
========================================
JWT 인증 부하 테스트 결과
========================================

총 인증 작업:
  - 성공한 로그인: ${totalLogins}
  - 토큰 갱신 횟수: ${totalRefreshes}
  - 인증 실패율: ${failureRate}%

1. 로그인 (JWT 발급)
   - p50: ${hasLoginData ? data.metrics.login_latency.values['p(50)'].toFixed(2) : 'N/A'}ms
   - p95: ${hasLoginData ? data.metrics.login_latency.values['p(95)'].toFixed(2) : 'N/A'}ms
   - p99: ${hasLoginData ? data.metrics.login_latency.values['p(99)'].toFixed(2) : 'N/A'}ms
   - avg: ${hasLoginData ? data.metrics.login_latency.values.avg.toFixed(2) : 'N/A'}ms

2. 토큰 갱신 (Refresh Token)
   - p50: ${hasRefreshData ? data.metrics.token_refresh_latency.values['p(50)'].toFixed(2) : 'N/A'}ms
   - p95: ${hasRefreshData ? data.metrics.token_refresh_latency.values['p(95)'].toFixed(2) : 'N/A'}ms
   - avg: ${hasRefreshData ? data.metrics.token_refresh_latency.values.avg.toFixed(2) : 'N/A'}ms

3. 인증 API 호출 (Bearer Token)
   - p50: ${hasApiData ? data.metrics.authenticated_api_latency.values['p(50)'].toFixed(2) : 'N/A'}ms
   - p95: ${hasApiData ? data.metrics.authenticated_api_latency.values['p(95)'].toFixed(2) : 'N/A'}ms
   - avg: ${hasApiData ? data.metrics.authenticated_api_latency.values.avg.toFixed(2) : 'N/A'}ms

평가:
${hasLoginData && data.metrics.login_latency.values['p(95)'] < 1000 ? '✅' : '❌'} 로그인 p95 < 1s
${hasRefreshData && data.metrics.token_refresh_latency.values['p(95)'] < 500 ? '✅' : '❌'} 토큰 갱신 p95 < 500ms
${hasApiData && data.metrics.authenticated_api_latency.values['p(95)'] < 800 ? '✅' : '❌'} 인증 API p95 < 800ms
${failureRate < 1 ? '✅' : '❌'} 인증 실패율 < 1%

💡 테스트 시나리오:
   1. 로그인 (JWT 발급)
   2. 인증이 필요한 API 호출 (Bearer Token)
   3. 토큰 갱신 (30% 확률)
   4. 여러 인증 API 연속 호출 (실제 사용 패턴)

⚠️  사전 준비:
   - 테스트 사용자 계정 생성 필요
   - TEST_USERS 배열에 실제 계정 정보 입력

========================================
`
    };
}
