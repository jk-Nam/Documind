# k6 부하 테스트 가이드

## 📋 테스트 시나리오 구성

### Core Scenarios (필수)

#### 로그 수집/이슈 관리
1. **log-collection-stress.js** - 로그 수집 API 부하 테스트
2. **redis-pipeline-test.js** - Redis Stream → Worker → DB 파이프라인 검증
3. **issue-grouping-test.js** - 이슈 그룹화 성능 테스트
4. **partition-query-test.js** - 파티션 테이블 쿼리 성능 테스트
5. **end-to-end-latency.js** - 종단 간 지연 시간 측정

#### 인증/검색
6. **jwt-auth-load.js** - JWT 인증 부하 테스트
7. **vector-search-load.js** - 벡터 검색 부하 테스트
8. **rag-chat-load.js** - RAG 채팅 부하 테스트

### Extended Scenarios (권장)
9. **issue-api-under-load.js** - 로그 수집 중 이슈 조회 API 성능
10. **partition-creation-test.js** - 새 주차 파티션 생성 부하 테스트

### Optional Scenarios (선택)
11. **backpressure-test.js** - 백프레셔 임계값 테스트
12. **storage-tier-comparison.js** - Cold/Warm Storage 성능 비교

---

## 🚀 실행 방법

### 1. 사전 준비

```bash
# k6 설치 (Windows)
choco install k6

# 환경 변수 설정
export API_BASE_URL="http://localhost:8080"
export PROJECT_ID="your-project-id"
export API_KEY="your-api-key"
```

### 2. 개별 시나리오 실행

```bash
# Core 테스트 (로그 수집/이슈 관리)
k6 run k6/scenarios/log-collection-stress.js
k6 run k6/scenarios/redis-pipeline-test.js
k6 run k6/scenarios/issue-grouping-test.js
k6 run k6/scenarios/partition-query-test.js
k6 run k6/scenarios/end-to-end-latency.js

# Core 테스트 (인증/검색)
k6 run k6/scenarios/jwt-auth-load.js
k6 run k6/scenarios/vector-search-load.js
k6 run k6/scenarios/rag-chat-load.js

# Extended 테스트
k6 run k6/scenarios/issue-api-under-load.js
k6 run k6/scenarios/partition-creation-test.js

# Optional 테스트
k6 run k6/scenarios/backpressure-test.js
k6 run k6/scenarios/storage-tier-comparison.js
```

### 3. 전체 시나리오 순차 실행

```bash
# Windows
./k6/run-all.bat

# Unix/Mac
./k6/run-all.sh
```

---

## 📊 메트릭 해석 가이드

### 응답 시간 (Response Time)
- **p50 (중앙값)**: 50% 요청이 이 시간 내 완료
  - ✅ 목표: < 100ms (로그 수집), < 200ms (조회 API)
- **p95**: 95% 요청이 이 시간 내 완료
  - ✅ 목표: < 500ms (로그 수집), < 1000ms (조회 API)
- **p99**: 99% 요청이 이 시간 내 완료
  - ✅ 목표: < 1000ms (로그 수집), < 2000ms (조회 API)

### RPS (Requests Per Second)
- **처리량 지표**: 초당 처리 가능한 요청 수
  - ✅ 목표: > 1000 RPS (로그 수집 API)

### 오류율 (Error Rate)
- **실패 비율**: `http_req_failed` 메트릭
  - ✅ 목표: < 1%

### Redis Stream 메트릭
- **Redis Lag**: 컨슈머가 처리하지 못한 메시지 수
  - ✅ 목표: < 1000 (정상), > 10000 (백프레셔 필요)

### DB 커넥션 풀
- **Active Connections**: 사용 중인 커넥션 수
  - ✅ 목표: < 최대 풀 크기의 80%

---

## ⚠️ 주의사항

### 1. 테스트 환경
- **운영 환경 금지**: 반드시 스테이징/테스트 환경에서 실행
- **데이터 정리**: 테스트 후 생성된 데이터 정리 필요

### 2. 단계적 부하 증가
- 모든 시나리오는 **3단계 ramp-up** 패턴 적용:
  1. **Warm-up** (1분): 10 VUs → 시스템 예열
  2. **Load Test** (5분): 50 VUs → 정상 부하
  3. **Stress Test** (3분): 200 VUs → 한계 테스트
  4. **Cool-down** (1분): 10 VUs → 안정화

### 3. 리소스 모니터링
테스트 실행 중 다음 지표를 함께 확인:
- CPU 사용률
- 메모리 사용률
- 디스크 I/O
- 네트워크 대역폭
- Redis 메모리 사용량
- DB 커넥션 풀 상태

### 4. LLM API 비용 (RAG 테스트)
- **rag-chat-load.js** 실행 시 OpenAI API 비용 발생
- VU 수를 낮게 유지 (최대 30)
- 테스트 시간 단축 (7분)

---

## 📈 결과 리포트 생성

```bash
# HTML 리포트 생성
k6 run --out json=results.json k6/scenarios/log-collection-stress.js
k6 report results.json --output report.html

# InfluxDB + Grafana 연동 (권장)
k6 run --out influxdb=http://localhost:8086/k6 k6/scenarios/log-collection-stress.js
```

---

## 🎯 성공 기준

### Core Scenarios (로그 수집/이슈 관리)
| 시나리오 | 목표 RPS | p95 응답시간 | 오류율 |
|---------|---------|-------------|--------|
| 로그 수집 | > 1000 | < 500ms | < 1% |
| 이슈 그룹화 | > 100 | < 1000ms | < 1% |
| 파티션 쿼리 | > 500 | < 300ms | < 1% |

### Core Scenarios (인증/검색)
| 시나리오 | 목표 RPS | p95 응답시간 | 오류율 |
|---------|---------|-------------|--------|
| JWT 인증 | > 200 | < 1000ms | < 1% |
| 벡터 검색 | > 50 | < 2000ms | < 1% |
| RAG 채팅 | > 10 | < 10000ms | < 5% |

### Extended Scenarios
| 시나리오 | 목표 | 비고 |
|---------|------|------|
| 이슈 API 동시 부하 | 로그 수집 중에도 p95 < 1000ms | 격리성 검증 |
| 파티션 생성 | 생성 중에도 쿼리 성능 유지 | 무중단 확인 |

### Optional Scenarios
| 시나리오 | 목표 | 비고 |
|---------|------|------|
| 백프레셔 | Redis Lag > 10000 시 자동 조절 | 시스템 안정성 |
| Storage Tier | Cold < Warm 응답시간 | 아키텍처 검증 |

---

## 🔧 사전 준비사항

### JWT 인증 테스트
```bash
# 테스트 계정 생성
curl -X POST http://localhost:8080/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@documind.com",
    "password": "Test1234!",
    "nickname": "Test User"
  }'

# 추가 계정 (test1~test5@documind.com)
```

### 벡터 검색 테스트
```bash
# Archive 문서 업로드 (개발 문서, README 등)
# 벡터 임베딩 자동 생성 확인

# 문서 업로드 확인
curl http://localhost:8080/api/archive?projectId=xxx
```

### RAG 채팅 테스트
```bash
# OpenAI API Key 환경 변수 설정
export OPENAI_API_KEY=sk-...

# 또는 Ollama 사용 (로컬)
docker run -d -p 11434:11434 ollama/ollama
```

---

## 💡 포트폴리오 활용 팁

### README.md에 추가할 내용
```markdown
## 성능 테스트 결과

### 로그 수집 시스템
- **처리량**: 520 RPS
- **응답시간 (p95)**: 312ms
- **파이프라인 처리율**: 98.7%

### JWT 인증
- **로그인 (p95)**: 450ms
- **토큰 갱신 (p95)**: 120ms
- **인증 API (p95)**: 280ms

### RAG 검색
- **벡터 검색 (p95)**: 1.8초
- **RAG 응답 (p95)**: 7.2초
- **관련 문서 검색 정확도**: 평균 0.85
```

### 면접 어필 포인트
- "k6로 12가지 부하 테스트 시나리오를 설계하여 시스템 성능을 검증했습니다"
- "JWT 인증 시스템은 p95 기준 1초 이내 응답을 달성했습니다"
- "벡터 검색은 2초 이내, RAG 전체 응답은 10초 이내 목표를 충족했습니다"
