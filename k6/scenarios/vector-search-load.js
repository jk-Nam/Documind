import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';
import { group } from 'k6';

// 커스텀 메트릭
const vectorSearchLatency = new Trend('vector_search_latency');
const semanticSearchLatency = new Trend('semantic_search_latency');
const hybridSearchLatency = new Trend('hybrid_search_latency');
const searchResultCount = new Trend('search_result_count');
const relevanceScore = new Trend('relevance_score');
const cacheHitRate = new Counter('cache_hit_rate');

const API_BASE_URL = __ENV.API_BASE_URL || 'http://localhost:8080';
const PROJECT_ID = __ENV.PROJECT_ID;
const API_KEY = __ENV.API_KEY;

export const options = {
    stages: [
        { duration: '1m', target: 10 },
        { duration: '3m', target: 30 },
        { duration: '2m', target: 50 },
        { duration: '1m', target: 10 },
    ],
    thresholds: {
        'vector_search_latency': ['p(95)<2000'],      // 벡터 검색 p95 < 2s
        'semantic_search_latency': ['p(95)<3000'],    // 의미론적 검색 p95 < 3s
        'hybrid_search_latency': ['p(95)<2500'],      // 하이브리드 검색 p95 < 2.5s
    },
};

// 검색 쿼리 샘플 (실제 사용 패턴)
const SEARCH_QUERIES = [
    // 기술 질문
    'NullPointerException 해결 방법',
    'Spring Security JWT 설정',
    'Redis Stream 사용법',
    'JPA N+1 문제 해결',
    'Docker Compose 설정',

    // 프로젝트 관련
    '로그 수집 파이프라인 구조',
    '이슈 그룹화 알고리즘',
    '파티션 테이블 설계',
    '알림 시스템 아키텍처',
    '벡터 검색 최적화',

    // API 관련
    'API 응답 시간 개선',
    '인증 토큰 관리',
    '에러 처리 패턴',
    '페이지네이션 구현',
    '파일 업로드 처리',

    // 인프라
    'AWS 배포 방법',
    'PostgreSQL 튜닝',
    'Redis 메모리 관리',
    'Nginx 설정',
    'CI/CD 파이프라인',
];

// 토큰 생성 (JWT)
function getAuthToken() {
    const loginRes = http.post(
        `${API_BASE_URL}/api/auth/login`,
        JSON.stringify({
            email: 'test@documind.com',
            password: 'Test1234!'
        }),
        {
            headers: {
                'Content-Type': 'application/json'
            }
        }
    );

    if (loginRes.status === 200) {
        try {
            const body = JSON.parse(loginRes.body);
            return body.data.accessToken;
        } catch (e) {
            return null;
        }
    }
    return null;
}

export function setup() {
    // 테스트 시작 전 토큰 발급
    const token = getAuthToken();
    if (!token) {
        console.error('Failed to get auth token for setup');
    }
    return { token: token };
}

export default function (data) {
    if (!data.token) {
        console.error('No auth token available');
        return;
    }

    const token = data.token;
    const query = SEARCH_QUERIES[Math.floor(Math.random() * SEARCH_QUERIES.length)];

    // ==========================================
    // 1. 벡터 검색 (Archive 문서 검색)
    // ==========================================
    group('Vector Search', () => {
        const startTime = new Date().getTime();
        const res = http.post(
            `${API_BASE_URL}/api/archive/search`,
            JSON.stringify({
                projectId: PROJECT_ID,
                query: query,
                searchType: 'VECTOR',  // 벡터 유사도 검색
                topK: 10
            }),
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            }
        );
        const duration = new Date().getTime() - startTime;

        vectorSearchLatency.add(duration);

        const success = check(res, {
            'vector search success': (r) => r.status === 200,
            'has results': (r) => {
                try {
                    const body = JSON.parse(r.body);
                    return body.success && body.data && Array.isArray(body.data.results);
                } catch (e) {
                    return false;
                }
            }
        });

        if (success) {
            try {
                const body = JSON.parse(res.body);
                const results = body.data.results || [];
                searchResultCount.add(results.length);

                // 관련성 점수 수집 (코사인 유사도)
                if (results.length > 0 && results[0].score !== undefined) {
                    relevanceScore.add(results[0].score);
                }

                // 캐시 히트 확인
                if (body.data.cached === true) {
                    cacheHitRate.add(1);
                } else {
                    cacheHitRate.add(0);
                }
            } catch (e) {
                console.error('Failed to parse vector search response:', e);
            }
        }
    });

    sleep(1);

    // ==========================================
    // 2. 의미론적 검색 (Semantic Search)
    // ==========================================
    if (Math.random() < 0.5) {
        group('Semantic Search', () => {
            const startTime = new Date().getTime();
            const res = http.post(
                `${API_BASE_URL}/api/archive/search`,
                JSON.stringify({
                    projectId: PROJECT_ID,
                    query: query,
                    searchType: 'SEMANTIC',  // OpenAI Embedding + 벡터 검색
                    topK: 5,
                    filters: {
                        fileType: ['MD', 'TXT', 'PDF']
                    }
                }),
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    }
                }
            );
            const duration = new Date().getTime() - startTime;

            semanticSearchLatency.add(duration);

            check(res, {
                'semantic search success': (r) => r.status === 200
            });
        });

        sleep(1);
    }

    // ==========================================
    // 3. 하이브리드 검색 (Keyword + Vector)
    // ==========================================
    if (Math.random() < 0.3) {
        group('Hybrid Search', () => {
            const startTime = new Date().getTime();
            const res = http.post(
                `${API_BASE_URL}/api/archive/search`,
                JSON.stringify({
                    projectId: PROJECT_ID,
                    query: query,
                    searchType: 'HYBRID',  // 키워드 + 벡터 조합
                    topK: 10,
                    weights: {
                        keyword: 0.3,
                        vector: 0.7
                    }
                }),
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    }
                }
            );
            const duration = new Date().getTime() - startTime;

            hybridSearchLatency.add(duration);

            check(res, {
                'hybrid search success': (r) => r.status === 200
            });
        });

        sleep(1);
    }

    sleep(2);
}

export function handleSummary(data) {
    const hasVectorData = data.metrics.vector_search_latency && data.metrics.vector_search_latency.values.count > 0;
    const hasSemanticData = data.metrics.semantic_search_latency && data.metrics.semantic_search_latency.values.count > 0;
    const hasHybridData = data.metrics.hybrid_search_latency && data.metrics.hybrid_search_latency.values.count > 0;
    const hasResultData = data.metrics.search_result_count && data.metrics.search_result_count.values.count > 0;
    const hasRelevanceData = data.metrics.relevance_score && data.metrics.relevance_score.values.count > 0;

    const cacheHits = data.metrics.cache_hit_rate ? data.metrics.cache_hit_rate.values.count : 0;
    const totalSearches = hasVectorData ? data.metrics.vector_search_latency.values.count : 0;
    const cacheHitPercentage = totalSearches > 0 ? ((cacheHits / totalSearches) * 100).toFixed(2) : '0.00';

    return {
        'vector-search-load-summary.json': JSON.stringify(data, null, 2),
        stdout: `
========================================
벡터 검색 부하 테스트 결과
========================================

총 검색 횟수: ${totalSearches}
캐시 히트율: ${cacheHitPercentage}%

1. 벡터 검색 (Vector Search)
   - 검색 횟수: ${hasVectorData ? data.metrics.vector_search_latency.values.count : 0}
   - p50: ${hasVectorData ? data.metrics.vector_search_latency.values['p(50)'].toFixed(2) : 'N/A'}ms
   - p95: ${hasVectorData ? data.metrics.vector_search_latency.values['p(95)'].toFixed(2) : 'N/A'}ms
   - p99: ${hasVectorData ? data.metrics.vector_search_latency.values['p(99)'].toFixed(2) : 'N/A'}ms
   - avg: ${hasVectorData ? data.metrics.vector_search_latency.values.avg.toFixed(2) : 'N/A'}ms

2. 의미론적 검색 (Semantic Search)
   - 검색 횟수: ${hasSemanticData ? data.metrics.semantic_search_latency.values.count : 0}
   - p50: ${hasSemanticData ? data.metrics.semantic_search_latency.values['p(50)'].toFixed(2) : 'N/A'}ms
   - p95: ${hasSemanticData ? data.metrics.semantic_search_latency.values['p(95)'].toFixed(2) : 'N/A'}ms
   - avg: ${hasSemanticData ? data.metrics.semantic_search_latency.values.avg.toFixed(2) : 'N/A'}ms

3. 하이브리드 검색 (Keyword + Vector)
   - 검색 횟수: ${hasHybridData ? data.metrics.hybrid_search_latency.values.count : 0}
   - p50: ${hasHybridData ? data.metrics.hybrid_search_latency.values['p(50)'].toFixed(2) : 'N/A'}ms
   - p95: ${hasHybridData ? data.metrics.hybrid_search_latency.values['p(95)'].toFixed(2) : 'N/A'}ms
   - avg: ${hasHybridData ? data.metrics.hybrid_search_latency.values.avg.toFixed(2) : 'N/A'}ms

검색 품질:
   - 평균 결과 수: ${hasResultData ? data.metrics.search_result_count.values.avg.toFixed(1) : 'N/A'}
   - 평균 관련성 점수: ${hasRelevanceData ? data.metrics.relevance_score.values.avg.toFixed(3) : 'N/A'}

평가:
${hasVectorData && data.metrics.vector_search_latency.values['p(95)'] < 2000 ? '✅' : '❌'} 벡터 검색 p95 < 2s
${hasSemanticData && data.metrics.semantic_search_latency.values['p(95)'] < 3000 ? '✅' : '❌'} 의미론적 검색 p95 < 3s
${hasHybridData && data.metrics.hybrid_search_latency.values['p(95)'] < 2500 ? '✅' : '❌'} 하이브리드 검색 p95 < 2.5s
${cacheHitPercentage > 20 ? '✅' : '⚠️'} 캐시 히트율 > 20%

💡 테스트 시나리오:
   - 벡터 검색 (100%): 코사인 유사도 기반 문서 검색
   - 의미론적 검색 (50%): OpenAI Embedding + 벡터 검색
   - 하이브리드 검색 (30%): 키워드 + 벡터 조합

⚠️  사전 준비:
   - Archive 문서 데이터 업로드 (벡터 임베딩 완료)
   - 테스트 계정 생성 (test@documind.com / Test1234!)
   - PROJECT_ID 환경 변수 설정

========================================
`
    };
}
