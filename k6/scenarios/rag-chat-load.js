import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter, Rate } from 'k6/metrics';
import { group } from 'k6';

// 커스텀 메트릭
const ragQueryLatency = new Trend('rag_query_latency');
const retrievalLatency = new Trend('retrieval_latency');
const llmResponseLatency = new Trend('llm_response_latency');
const contextTokenCount = new Trend('context_token_count');
const responseTokenCount = new Trend('response_token_count');
const relevantDocsCount = new Trend('relevant_docs_count');
const ragFailures = new Rate('rag_failures');

const API_BASE_URL = __ENV.API_BASE_URL || 'http://localhost:8080';
const PROJECT_ID = __ENV.PROJECT_ID;

export const options = {
    stages: [
        { duration: '1m', target: 5 },     // Warm-up (LLM API 느림)
        { duration: '3m', target: 15 },    // Load Test
        { duration: '2m', target: 30 },    // Stress Test
        { duration: '1m', target: 5 },     // Cool-down
    ],
    thresholds: {
        'rag_query_latency': ['p(95)<10000'],        // RAG 전체 p95 < 10s
        'retrieval_latency': ['p(95)<2000'],         // 문서 검색 p95 < 2s
        'llm_response_latency': ['p(95)<8000'],      // LLM 응답 p95 < 8s
        'rag_failures': ['rate<0.05'],               // 실패율 < 5%
    },
};

// RAG 채팅 질문 샘플
const RAG_QUESTIONS = [
    // 기술 질문
    {
        question: 'NullPointerException이 발생했을 때 어떻게 해결하나요?',
        chatType: 'ARCHIVE',  // 문서 기반 채팅
    },
    {
        question: 'Spring Security에서 JWT를 어떻게 설정하나요?',
        chatType: 'ARCHIVE',
    },
    {
        question: 'Redis Stream 사용법을 알려주세요',
        chatType: 'ARCHIVE',
    },

    // 프로젝트 관련
    {
        question: '이 프로젝트의 로그 수집 파이프라인 구조를 설명해주세요',
        chatType: 'ARCHIVE',
    },
    {
        question: '이슈 그룹화는 어떤 알고리즘을 사용하나요?',
        chatType: 'ARCHIVE',
    },

    // 패치노트 생성
    {
        question: '이번 주에 해결된 이슈들을 정리해서 패치노트를 작성해주세요',
        chatType: 'PATCHNOTE',  // 패치노트 채팅
    },
    {
        question: 'CRITICAL 이슈 중 해결된 것들을 요약해주세요',
        chatType: 'PATCHNOTE',
    },

    // 코드 설명
    {
        question: 'IssueNotificationService 클래스의 역할을 설명해주세요',
        chatType: 'ARCHIVE',
    },
    {
        question: 'Redis 파이프라인 처리 로직이 어떻게 동작하나요?',
        chatType: 'ARCHIVE',
    },
    {
        question: '파티션 테이블은 어떻게 관리되나요?',
        chatType: 'ARCHIVE',
    },
];

// 토큰 생성
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
    const token = getAuthToken();
    if (!token) {
        console.error('Failed to get auth token for RAG test');
    }
    return { token: token };
}

export default function (data) {
    if (!data.token) {
        console.error('No auth token available');
        return;
    }

    const token = data.token;
    const questionData = RAG_QUESTIONS[Math.floor(Math.random() * RAG_QUESTIONS.length)];

    // ==========================================
    // RAG 전체 플로우 (Retrieval + Generation)
    // ==========================================
    group('RAG Chat Query', () => {
        const ragStartTime = new Date().getTime();

        // 1단계: 문서 검색 (Retrieval)
        let retrievalDuration = 0;
        let relevantDocs = [];

        group('Document Retrieval', () => {
            const retrievalStart = new Date().getTime();
            const retrievalRes = http.post(
                `${API_BASE_URL}/api/archive/retrieve`,
                JSON.stringify({
                    projectId: PROJECT_ID,
                    query: questionData.question,
                    topK: 5
                }),
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    }
                }
            );
            retrievalDuration = new Date().getTime() - retrievalStart;

            retrievalLatency.add(retrievalDuration);

            const retrievalSuccess = check(retrievalRes, {
                'retrieval success': (r) => r.status === 200
            });

            if (retrievalSuccess) {
                try {
                    const body = JSON.parse(retrievalRes.body);
                    relevantDocs = body.data.documents || [];
                    relevantDocsCount.add(relevantDocs.length);

                    // 컨텍스트 토큰 수 (대략 추정)
                    const totalChars = relevantDocs.reduce((sum, doc) => sum + (doc.content?.length || 0), 0);
                    const estimatedTokens = Math.floor(totalChars / 4);  // 1 token ≈ 4 chars
                    contextTokenCount.add(estimatedTokens);
                } catch (e) {
                    console.error('Failed to parse retrieval response:', e);
                }
            }
        });

        sleep(0.5);

        // 2단계: LLM 응답 생성 (Generation)
        let llmDuration = 0;

        group('LLM Generation', () => {
            const llmStart = new Date().getTime();

            const chatEndpoint = questionData.chatType === 'PATCHNOTE'
                ? `${API_BASE_URL}/api/patchnotechat/query`
                : `${API_BASE_URL}/api/archivechat/query`;

            const chatRes = http.post(
                chatEndpoint,
                JSON.stringify({
                    projectId: PROJECT_ID,
                    question: questionData.question,
                    chatType: questionData.chatType,
                    context: relevantDocs  // 검색된 문서 전달
                }),
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    timeout: '30s'  // LLM API 응답 대기
                }
            );

            llmDuration = new Date().getTime() - llmStart;
            llmResponseLatency.add(llmDuration);

            const chatSuccess = check(chatRes, {
                'llm response success': (r) => r.status === 200,
                'has answer': (r) => {
                    try {
                        const body = JSON.parse(r.body);
                        return body.success && body.data && body.data.answer;
                    } catch (e) {
                        return false;
                    }
                }
            });

            if (chatSuccess) {
                try {
                    const body = JSON.parse(chatRes.body);
                    const answer = body.data.answer || '';
                    const answerTokens = Math.floor(answer.length / 4);
                    responseTokenCount.add(answerTokens);
                    ragFailures.add(0);
                } catch (e) {
                    console.error('Failed to parse chat response:', e);
                    ragFailures.add(1);
                }
            } else {
                ragFailures.add(1);
                console.error(`RAG query failed: ${chatRes.status} - ${questionData.question}`);
            }
        });

        // 전체 RAG 레이턴시
        const totalRagDuration = new Date().getTime() - ragStartTime;
        ragQueryLatency.add(totalRagDuration);
    });

    // RAG는 비용이 높으므로 요청 간격 길게
    sleep(5);
}

export function handleSummary(data) {
    const hasRagData = data.metrics.rag_query_latency && data.metrics.rag_query_latency.values.count > 0;
    const hasRetrievalData = data.metrics.retrieval_latency && data.metrics.retrieval_latency.values.count > 0;
    const hasLlmData = data.metrics.llm_response_latency && data.metrics.llm_response_latency.values.count > 0;
    const hasDocsData = data.metrics.relevant_docs_count && data.metrics.relevant_docs_count.values.count > 0;
    const hasContextData = data.metrics.context_token_count && data.metrics.context_token_count.values.count > 0;
    const hasResponseData = data.metrics.response_token_count && data.metrics.response_token_count.values.count > 0;

    const failureRate = data.metrics.rag_failures ? (data.metrics.rag_failures.values.rate * 100).toFixed(2) : '0.00';
    const totalQueries = hasRagData ? data.metrics.rag_query_latency.values.count : 0;

    return {
        'rag-chat-load-summary.json': JSON.stringify(data, null, 2),
        stdout: `
========================================
RAG 채팅 부하 테스트 결과
========================================

총 RAG 쿼리: ${totalQueries}
실패율: ${failureRate}%

1. 전체 RAG 응답 시간 (Retrieval + Generation)
   - p50: ${hasRagData ? data.metrics.rag_query_latency.values['p(50)'].toFixed(2) : 'N/A'}ms
   - p95: ${hasRagData ? data.metrics.rag_query_latency.values['p(95)'].toFixed(2) : 'N/A'}ms
   - p99: ${hasRagData ? data.metrics.rag_query_latency.values['p(99)'].toFixed(2) : 'N/A'}ms
   - avg: ${hasRagData ? data.metrics.rag_query_latency.values.avg.toFixed(2) : 'N/A'}ms

2. 문서 검색 (Retrieval)
   - p50: ${hasRetrievalData ? data.metrics.retrieval_latency.values['p(50)'].toFixed(2) : 'N/A'}ms
   - p95: ${hasRetrievalData ? data.metrics.retrieval_latency.values['p(95)'].toFixed(2) : 'N/A'}ms
   - avg: ${hasRetrievalData ? data.metrics.retrieval_latency.values.avg.toFixed(2) : 'N/A'}ms

3. LLM 응답 생성 (Generation)
   - p50: ${hasLlmData ? data.metrics.llm_response_latency.values['p(50)'].toFixed(2) : 'N/A'}ms
   - p95: ${hasLlmData ? data.metrics.llm_response_latency.values['p(95)'].toFixed(2) : 'N/A'}ms
   - avg: ${hasLlmData ? data.metrics.llm_response_latency.values.avg.toFixed(2) : 'N/A'}ms

RAG 품질 지표:
   - 평균 검색 문서 수: ${hasDocsData ? data.metrics.relevant_docs_count.values.avg.toFixed(1) : 'N/A'}
   - 평균 컨텍스트 토큰: ${hasContextData ? data.metrics.context_token_count.values.avg.toFixed(0) : 'N/A'}
   - 평균 응답 토큰: ${hasResponseData ? data.metrics.response_token_count.values.avg.toFixed(0) : 'N/A'}

시간 분해 (avg):
   - Retrieval: ${hasRetrievalData ? ((data.metrics.retrieval_latency.values.avg / data.metrics.rag_query_latency.values.avg) * 100).toFixed(1) : 'N/A'}%
   - LLM: ${hasLlmData ? ((data.metrics.llm_response_latency.values.avg / data.metrics.rag_query_latency.values.avg) * 100).toFixed(1) : 'N/A'}%

평가:
${hasRagData && data.metrics.rag_query_latency.values['p(95)'] < 10000 ? '✅' : '❌'} 전체 RAG p95 < 10s
${hasRetrievalData && data.metrics.retrieval_latency.values['p(95)'] < 2000 ? '✅' : '❌'} 문서 검색 p95 < 2s
${hasLlmData && data.metrics.llm_response_latency.values['p(95)'] < 8000 ? '✅' : '❌'} LLM 응답 p95 < 8s
${failureRate < 5 ? '✅' : '❌'} 실패율 < 5%

💡 RAG 플로우:
   1. 사용자 질문 → 벡터 임베딩
   2. 벡터 DB 검색 (코사인 유사도)
   3. 관련 문서 Top-K 추출
   4. LLM에 컨텍스트 + 질문 전달
   5. LLM 응답 생성 및 반환

⚠️  사전 준비:
   - Archive 문서 업로드 및 임베딩 완료
   - OpenAI API Key 설정 (또는 Ollama)
   - 테스트 계정 생성
   - PROJECT_ID 환경 변수 설정

⚠️  주의사항:
   - LLM API 호출 비용 발생 (OpenAI)
   - VU 수를 너무 높이면 API 요금 급증
   - 테스트 후 생성된 채팅 기록 정리 권장

========================================
`
    };
}
