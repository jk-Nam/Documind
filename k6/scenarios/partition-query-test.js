import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';

// 커스텀 메트릭
const singlePartitionQuery = new Trend('single_partition_query');
const multiPartitionQuery = new Trend('multi_partition_query');
const fullScanQuery = new Trend('full_scan_query');

const API_BASE_URL = __ENV.API_BASE_URL || 'http://localhost:8080';
const PROJECT_ID = __ENV.PROJECT_ID;
const API_KEY = __ENV.API_KEY;

export const options = {
    stages: [
        { duration: '1m', target: 20 },
        { duration: '5m', target: 100 },
        { duration: '3m', target: 200 },
        { duration: '1m', target: 20 },
    ],
    thresholds: {
        'single_partition_query': ['p(95)<300'],  // 단일 파티션 조회
        'multi_partition_query': ['p(95)<1000'],  // 다중 파티션 조회
        'full_scan_query': ['p(95)<3000'],        // 전체 스캔
    },
};

// 날짜 범위 생성 함수
function getDateRange(daysBack) {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - daysBack);

    return {
        startDate: start.toISOString(),
        endDate: end.toISOString()
    };
}

export default function () {
    const queryType = Math.random();

    // 60% - 단일 파티션 조회 (최근 1일)
    if (queryType < 0.6) {
        const { startDate, endDate } = getDateRange(1);

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
            'single partition query success': (r) => r.status === 200,
            'has data': (r) => {
                try {
                    const body = JSON.parse(r.body);
                    return body.success && body.data && Array.isArray(body.data.content);
                } catch (e) {
                    return false;
                }
            }
        });

        singlePartitionQuery.add(duration);
    }
    // 30% - 다중 파티션 조회 (최근 7일)
    else if (queryType < 0.9) {
        const { startDate, endDate } = getDateRange(7);

        const startTime = new Date().getTime();
        const res = http.get(
            `${API_BASE_URL}/api/logs?projectId=${PROJECT_ID}&startDate=${startDate}&endDate=${endDate}&page=0&size=100`,
            {
                headers: {
                    'X-API-Key': API_KEY
                }
            }
        );
        const duration = new Date().getTime() - startTime;

        check(res, {
            'multi partition query success': (r) => r.status === 200
        });

        multiPartitionQuery.add(duration);
    }
    // 10% - 전체 스캔 (최근 30일)
    else {
        const { startDate, endDate } = getDateRange(30);

        const startTime = new Date().getTime();
        const res = http.get(
            `${API_BASE_URL}/api/logs?projectId=${PROJECT_ID}&startDate=${startDate}&endDate=${endDate}&page=0&size=100`,
            {
                headers: {
                    'X-API-Key': API_KEY
                }
            }
        );
        const duration = new Date().getTime() - startTime;

        check(res, {
            'full scan query success': (r) => r.status === 200
        });

        fullScanQuery.add(duration);
    }

    sleep(0.3);
}

export function handleSummary(data) {
    const hasSingleData = data.metrics.single_partition_query && data.metrics.single_partition_query.values.count > 0;
    const hasMultiData = data.metrics.multi_partition_query && data.metrics.multi_partition_query.values.count > 0;
    const hasFullScanData = data.metrics.full_scan_query && data.metrics.full_scan_query.values.count > 0;

    return {
        'partition-query-test-summary.json': JSON.stringify(data, null, 2),
        stdout: `
========================================
파티션 테이블 쿼리 성능 테스트 결과
========================================

1. 단일 파티션 조회 (최근 1일)
   - 요청 수: ${hasSingleData ? data.metrics.single_partition_query.values.count : 0}
   - p50: ${hasSingleData ? data.metrics.single_partition_query.values['p(50)'].toFixed(2) : 'N/A'}ms
   - p95: ${hasSingleData ? data.metrics.single_partition_query.values['p(95)'].toFixed(2) : 'N/A'}ms
   - p99: ${hasSingleData ? data.metrics.single_partition_query.values['p(99)'].toFixed(2) : 'N/A'}ms

2. 다중 파티션 조회 (최근 7일)
   - 요청 수: ${hasMultiData ? data.metrics.multi_partition_query.values.count : 0}
   - p50: ${hasMultiData ? data.metrics.multi_partition_query.values['p(50)'].toFixed(2) : 'N/A'}ms
   - p95: ${hasMultiData ? data.metrics.multi_partition_query.values['p(95)'].toFixed(2) : 'N/A'}ms
   - p99: ${hasMultiData ? data.metrics.multi_partition_query.values['p(99)'].toFixed(2) : 'N/A'}ms

3. 전체 스캔 (최근 30일)
   - 요청 수: ${hasFullScanData ? data.metrics.full_scan_query.values.count : 0}
   - p50: ${hasFullScanData ? data.metrics.full_scan_query.values['p(50)'].toFixed(2) : 'N/A'}ms
   - p95: ${hasFullScanData ? data.metrics.full_scan_query.values['p(95)'].toFixed(2) : 'N/A'}ms
   - p99: ${hasFullScanData ? data.metrics.full_scan_query.values['p(99)'].toFixed(2) : 'N/A'}ms

평가:
${hasSingleData && data.metrics.single_partition_query.values['p(95)'] < 300 ? '✅' : '❌'} 단일 파티션 p95 < 300ms
${hasMultiData && data.metrics.multi_partition_query.values['p(95)'] < 1000 ? '✅' : '❌'} 다중 파티션 p95 < 1000ms
${hasFullScanData && data.metrics.full_scan_query.values['p(95)'] < 3000 ? '✅' : '⚠️'} 전체 스캔 p95 < 3000ms

========================================
`
    };
}
