import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';
import { group } from 'k6';

// 커스텀 메트릭
const warmStorageLatency = new Trend('warm_storage_latency');
const coldStorageLatency = new Trend('cold_storage_latency');
const warmStorageQueries = new Counter('warm_storage_queries');
const coldStorageQueries = new Counter('cold_storage_queries');
const coldStorageRestoreTime = new Trend('cold_storage_restore_time');

const API_BASE_URL = __ENV.API_BASE_URL || 'http://localhost:8080';
const PROJECT_ID = __ENV.PROJECT_ID;
const API_KEY = __ENV.API_KEY;

export const options = {
    stages: [
        { duration: '1m', target: 10 },
        { duration: '5m', target: 30 },
        { duration: '3m', target: 50 },
        { duration: '1m', target: 10 },
    ],
    thresholds: {
        'warm_storage_latency': ['p(95)<500'],    // Warm: 500ms 이내
        'cold_storage_latency': ['p(95)<3000'],   // Cold: 3s 이내 (복원 포함)
    },
};

// ==========================================
// Warm Storage: 최근 30일 데이터 (활성 파티션)
// ==========================================
function queryWarmStorage() {
    group('Warm Storage Query', () => {
        // 최근 7일 데이터 조회
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 7);

        const startTime = new Date().getTime();
        const res = http.get(
            `${API_BASE_URL}/api/logs?projectId=${PROJECT_ID}&startDate=${start.toISOString()}&endDate=${end.toISOString()}&page=0&size=100`,
            {
                headers: {
                    'X-API-Key': API_KEY
                },
                tags: { storage_tier: 'warm' }
            }
        );
        const duration = new Date().getTime() - startTime;

        check(res, {
            'warm storage success': (r) => r.status === 200,
            'has data': (r) => {
                try {
                    const body = JSON.parse(r.body);
                    return body.success && body.data && Array.isArray(body.data.content);
                } catch (e) {
                    return false;
                }
            }
        });

        warmStorageLatency.add(duration);
        warmStorageQueries.add(1);
    });
}

// ==========================================
// Cold Storage: 30일 이전 데이터 (아카이브)
// ==========================================
function queryColdStorage() {
    group('Cold Storage Query', () => {
        // 31~60일 전 데이터 조회 (Cold Storage)
        const end = new Date();
        end.setDate(end.getDate() - 31);
        const start = new Date();
        start.setDate(start.getDate() - 60);

        const startTime = new Date().getTime();
        const res = http.get(
            `${API_BASE_URL}/api/logs/archive?projectId=${PROJECT_ID}&startDate=${start.toISOString()}&endDate=${end.toISOString()}&page=0&size=100`,
            {
                headers: {
                    'X-API-Key': API_KEY
                },
                tags: { storage_tier: 'cold' },
                timeout: '10s'  // Cold storage는 복원 시간 고려
            }
        );
        const duration = new Date().getTime() - startTime;

        const success = check(res, {
            'cold storage success or restore needed': (r) => r.status === 200 || r.status === 202,
            'response valid': (r) => {
                try {
                    const body = JSON.parse(r.body);
                    return body.success !== undefined;
                } catch (e) {
                    return false;
                }
            }
        });

        if (res.status === 200) {
            // 즉시 조회 성공 (이미 복원됨)
            coldStorageLatency.add(duration);
            coldStorageQueries.add(1);
        } else if (res.status === 202) {
            // 복원 중 - 재조회 필요
            try {
                const body = JSON.parse(res.body);
                const restoreJobId = body.data.restoreJobId;

                // 복원 완료 대기 (폴링)
                let restored = false;
                for (let i = 0; i < 10; i++) {
                    sleep(1);

                    const checkRes = http.get(
                        `${API_BASE_URL}/api/logs/archive/restore-status/${restoreJobId}`,
                        {
                            headers: {
                                'X-API-Key': API_KEY
                            }
                        }
                    );

                    if (checkRes.status === 200) {
                        const checkBody = JSON.parse(checkRes.body);
                        if (checkBody.data.status === 'COMPLETED') {
                            restored = true;
                            const totalDuration = new Date().getTime() - startTime;
                            coldStorageRestoreTime.add(totalDuration);
                            coldStorageLatency.add(totalDuration);
                            coldStorageQueries.add(1);
                            break;
                        }
                    }
                }

                if (!restored) {
                    console.error('Cold storage restore timeout');
                }
            } catch (e) {
                console.error('Failed to parse restore response:', e);
            }
        }
    });
}

// ==========================================
// Main Test Function
// ==========================================
export default function () {
    const queryType = Math.random();

    // 70% Warm Storage, 30% Cold Storage
    if (queryType < 0.7) {
        queryWarmStorage();
    } else {
        queryColdStorage();
    }

    sleep(1);
}

export function handleSummary(data) {
    const warmQueries = data.metrics.warm_storage_queries ? data.metrics.warm_storage_queries.values.count : 0;
    const coldQueries = data.metrics.cold_storage_queries ? data.metrics.cold_storage_queries.values.count : 0;

    const hasWarmData = data.metrics.warm_storage_latency && data.metrics.warm_storage_latency.values.count > 0;
    const hasColdData = data.metrics.cold_storage_latency && data.metrics.cold_storage_latency.values.count > 0;
    const hasRestoreData = data.metrics.cold_storage_restore_time && data.metrics.cold_storage_restore_time.values.count > 0;

    // 성능 비교
    const warmP95 = hasWarmData ? data.metrics.warm_storage_latency.values['p(95)'] : 0;
    const coldP95 = hasColdData ? data.metrics.cold_storage_latency.values['p(95)'] : 0;
    const performanceDiff = coldP95 > 0 ? ((coldP95 / warmP95 - 1) * 100).toFixed(2) : 'N/A';

    return {
        'storage-tier-comparison-summary.json': JSON.stringify(data, null, 2),
        stdout: `
========================================
Cold/Warm Storage 성능 비교 테스트 결과
========================================

테스트 분포:
  - Warm Storage 조회: ${warmQueries}회 (70% 목표)
  - Cold Storage 조회: ${coldQueries}회 (30% 목표)

1. Warm Storage (최근 30일)
   - p50: ${hasWarmData ? data.metrics.warm_storage_latency.values['p(50)'].toFixed(2) : 'N/A'}ms
   - p95: ${hasWarmData ? data.metrics.warm_storage_latency.values['p(95)'].toFixed(2) : 'N/A'}ms
   - p99: ${hasWarmData ? data.metrics.warm_storage_latency.values['p(99)'].toFixed(2) : 'N/A'}ms
   - avg: ${hasWarmData ? data.metrics.warm_storage_latency.values.avg.toFixed(2) : 'N/A'}ms

2. Cold Storage (30일 이전)
   - p50: ${hasColdData ? data.metrics.cold_storage_latency.values['p(50)'].toFixed(2) : 'N/A'}ms
   - p95: ${hasColdData ? data.metrics.cold_storage_latency.values['p(95)'].toFixed(2) : 'N/A'}ms
   - p99: ${hasColdData ? data.metrics.cold_storage_latency.values['p(99)'].toFixed(2) : 'N/A'}ms
   - avg: ${hasColdData ? data.metrics.cold_storage_latency.values.avg.toFixed(2) : 'N/A'}ms

3. Cold Storage 복원 시간 (202 응답 시)
   - 복원 횟수: ${hasRestoreData ? data.metrics.cold_storage_restore_time.values.count : 0}
   - avg 복원 시간: ${hasRestoreData ? data.metrics.cold_storage_restore_time.values.avg.toFixed(2) : 'N/A'}ms
   - max 복원 시간: ${hasRestoreData ? data.metrics.cold_storage_restore_time.values.max.toFixed(2) : 'N/A'}ms

성능 비교:
  Cold Storage는 Warm Storage보다 ${performanceDiff}% 느림

평가:
${hasWarmData && warmP95 < 500 ? '✅' : '❌'} Warm Storage p95 < 500ms
${hasColdData && coldP95 < 3000 ? '✅' : '⚠️'} Cold Storage p95 < 3s (복원 포함)
${performanceDiff !== 'N/A' && parseFloat(performanceDiff) > 0 ? '✅' : '⚠️'} Cold Storage가 Warm Storage보다 느림 (아키텍처 검증)

💡 아키텍처 검증:
   - Warm Storage: 활성 파티션, 빠른 조회
   - Cold Storage: 아카이브 데이터, 복원 후 조회 (느림 허용)
   - Cost-Performance 트레이드오프 확인

========================================
`
    };
}
