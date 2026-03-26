# 📋 DocuMind

<h3 align="center">
게임 서비스의 오류 로그를 실시간으로 수집·분석하고, AI가 이슈를 분류하고 패치노트까지 자동 생성하는 품질 관리 코파일럿
</h3>

<p align="center">
  <img src="./docs/mainpage.png" alt="DocuMind 메인 대시보드" width="800" />
</p>
<p align="center">
  <a href="http://43.201.190.32.nip.io:8080">
    <img src="https://img.shields.io/badge/🚀_Live_Demo-DocuMind-4285F4?style=for-the-badge" />
  </a>
</p>

<p align="center">
  <a href="https://fine-airport-005.notion.site/4-a10fc0d27a98837488f881ffec988a07?source=copy_link">
    <img src="https://img.shields.io/badge/Notion-Team%20Docs-000000?logo=notion&logoColor=white" />
  </a>
</p>
---

<a id="프로젝트-소개"></a>
## 📝 프로젝트 소개

**DocuMind**는 게임 운영팀의 품질 관리 업무를 획기적으로 개선하는
**AI 기반 로그 분석 & 이슈 관리 & 문서 검색 플랫폼**입니다.

현재의 게임 운영 환경에서 QA 담당자는 **수천 건의 에러 로그에서 핵심 이슈를 빠르게 파악**하기 어렵습니다.<br>
기존 방식에서는 로그와 이슈의 관계가 명확하지 않아 **중요한 문제를 놓치기 쉽고**,
패치노트는 **수동 작성이 필요해 릴리즈마다 반복적인 비용**이 발생했습니다.

> DocuMind는 이러한 문제를 해결하기 위해, 다음과 같은 기능을 제공합니다:

- 📡 **실시간 로그 수집 파이프라인** — Redis Streams 기반 비동기 수집 + 적응형 배치 처리
- 🔍 **자동 이슈 분류 & 심각도 평가** — SHA-256 핑거프린트 기반 그룹핑 + 5가지 전략 스코어링
- 🤖 **AI 문서 검색 (RAG 챗봇)** — pgvector 벡터 검색 + 멀티 LLM 스트리밍 응답
- 📝 **패치노트 자동 생성** — 해결된 이슈 + 문서 변경 기반 AI 초안 생성
- 🔎 **No-code 로그 탐색기** — SQL 없이 JSON DSL로 로그 검색·집계
- 📊 **커스텀 대시보드** — 드래그 앤 드롭 위젯 레이아웃 + Chart.js 시각화
- 🔔 **실시간 알림** — SSE 기반 토스트 알림 + 딥 링크

## 💡 이런 팀에게 추천해요!

- "수천 건의 에러 로그에서 핵심 이슈를 빠르게 찾고 싶어요"
- "이슈 심각도를 객관적인 기준으로 평가하고 싶어요"
- "프로젝트 문서를 AI에게 질문하며 빠르게 파악하고 싶어요"
- "패치노트 작성을 자동화하고 싶어요"

## 📗 DocuMind와 함께,
**게임 품질 관리의 정확도는 높이고, 시간은 줄이세요.**
운영팀의 반복 업무는 줄이고, 품질은 체계적으로 관리하는 게임 QA의 진짜 코파일럿, **DocuMind** ✨

---

## 📚 목차
- [프로젝트 소개](#프로젝트-소개)
- [시스템 아키텍처](#시스템-아키텍처)
- [ERD](#erd)
- [기술 스택 및 도입 이유](#기술-스택-및-도입-이유)
- [핵심 기능 소개](#핵심-기능-소개)
- [트러블 슈팅](#트러블-슈팅)
- [팀원 구성](#팀원-구성)

---

<a id="시스템-아키텍처"></a>
## 🖼️ 시스템 아키텍처
![시스템아키텍처이미지 — 전체 인프라 구성도 (Client → Spring Boot → PostgreSQL/Redis/S3 + 모니터링 스택)](./docs/system_architecture.png)

---

<a id="erd"></a>
## 🧩 ERD
![ERD이미지 — ERDCloud에서 생성한 전체 테이블 관계도](./docs/erd.png)

### 테이블 요약

| 테이블 | PK 타입 | 설명 |
|--------|---------|------|
| `company` | BIGSERIAL | 조직 (멀티테넌트) |
| `member` | UUID | OAuth2 연동 사용자 |
| `project` | UUID | 프로젝트 (publicId로 URL 노출) |
| `project_member` | BIGSERIAL | 프로젝트 멤버십 + 역할 |
| `project_api_key` | BIGSERIAL | API 키 (HMAC 해시 저장) |
| `invitation` | UUID | 이메일 초대 (72시간 만료) |
| `domain_source` | BIGSERIAL | 문서 기본 엔티티 |
| `document_group` | BIGSERIAL | 문서 그룹 (카테고리별) |
| `document_metadata` | BIGINT (FK) | 문서 메타데이터 + 버전 |
| `vector_store` | UUID | 벡터 임베딩 (pgvector 1536차원) |
| `game_log` | UUID + TIMESTAMP | 게임 로그 (주별 파티셔닝) |
| `issue` | BIGSERIAL | 이슈 (핑거프린트 기반 그룹핑) |
| `issue_history` | BIGSERIAL | 이슈 변경 이력 |
| `issue_comment` | BIGSERIAL | 이슈 댓글 + 멘션 |
| `issue_alert_rule` | BIGSERIAL | 알림 규칙 설정 |
| `pending_item` | BIGSERIAL | 패치노트 후보 항목 |
| `patch_note` | BIGSERIAL | 패치노트 (시맨틱 버저닝) |
| `dashboard_view` | UUID | 대시보드 위젯 레이아웃 |
| `notification` | BIGSERIAL | 실시간 알림 |

---

<a id="기술-스택-및-도입-이유"></a>
## 🛠 기술 스택 및 도입 이유

### Backend
| Category | Stack | 도입 이유 |
|----------|-------|----------|
| Language | ![Java](https://img.shields.io/badge/Java%2017-ED8B00?style=for-the-badge&logo=openjdk&logoColor=white) | 안정적인 타입 시스템과 풍부한 엔터프라이즈 생태계를 활용하기 위해 사용 |
| Framework | ![Spring Boot](https://img.shields.io/badge/Spring%20Boot%203.5-6DB33F?style=for-the-badge&logo=springboot&logoColor=white) | 자동 설정과 DDD 기반 도메인 분리 구조를 효율적으로 구성하기 위해 사용 |
| ORM | ![JPA](https://img.shields.io/badge/Spring%20Data%20JPA-6DB33F?style=for-the-badge&logo=spring&logoColor=white) | 엔티티 매핑과 트랜잭션 관리를 선언적으로 처리하기 위해 사용 |
| Dynamic Query | ![QueryDSL](https://img.shields.io/badge/QueryDSL%205.0-0769AD?style=for-the-badge) | 로그 탐색기의 동적 쿼리를 타입 세이프하게 구성하기 위해 도입 |
| Security | ![Spring Security](https://img.shields.io/badge/Spring%20Security-6DB33F?style=for-the-badge&logo=springsecurity&logoColor=white) | OAuth2 소셜 로그인과 역할 기반 접근 제어를 분리하기 위해 도입 |
| Authentication | ![JWT](https://img.shields.io/badge/JWT-000000?style=for-the-badge&logo=jsonwebtokens&logoColor=white) | 무상태 인증으로 수평 확장이 가능한 구조를 확보하기 위해 사용 |
| Real-time | ![SSE](https://img.shields.io/badge/SSE-010101?style=for-the-badge) | 서버에서 클라이언트로 단방향 실시간 알림을 전달하기 위해 사용 |
| Validation | ![Bean Validation](https://img.shields.io/badge/Jakarta%20Validation-ED8B00?style=for-the-badge) | 요청 DTO의 입력값을 선언적으로 검증하기 위해 사용 |
| API Docs | ![SpringDoc](https://img.shields.io/badge/SpringDoc%20OpenAPI-85EA2D?style=for-the-badge&logo=swagger&logoColor=black) | API 명세를 코드 기반으로 자동 생성하여 문서 관리 비용을 줄이기 위해 도입 |
| DB Migration | ![Flyway](https://img.shields.io/badge/Flyway-CC0200?style=for-the-badge&logo=flyway&logoColor=white) | 팀원 간 스키마 변경을 버전 관리하고 자동 마이그레이션하기 위해 사용 |
| Code Format | ![Spotless](https://img.shields.io/badge/Spotless-4285F4?style=for-the-badge) | Google Java Format(AOSP) 기반으로 코드 스타일을 자동 통일하기 위해 도입 |

### AI & Document Processing
| Category | Stack | 도입 이유 |
|----------|-------|----------|
| AI Framework | ![Spring AI](https://img.shields.io/badge/Spring%20AI%201.1-6DB33F?style=for-the-badge&logo=spring&logoColor=white) | RAG 파이프라인과 멀티 LLM 연동을 Spring 생태계 내에서 일관되게 구성하기 위해 도입 |
| LLM | ![OpenAI](https://img.shields.io/badge/OpenAI%20GPT--4.1-412991?style=for-the-badge&logo=openai&logoColor=white) | 패치노트 생성, 이슈 요약 등 고품질 텍스트 생성을 위해 사용 |
| LLM | ![Gemini](https://img.shields.io/badge/Google%20Gemini%202.5-4285F4?style=for-the-badge&logo=googlegemini&logoColor=white) | 대안 LLM으로 비용 최적화와 모델 선택의 유연성을 확보하기 위해 도입 |
| LLM | ![Ollama](https://img.shields.io/badge/Ollama-000000?style=for-the-badge) | 로컬 LLM(HyperCLOVA X) 실행으로 외부 API 의존도를 줄이기 위해 지원 |
| Embedding | ![OpenAI](https://img.shields.io/badge/text--embedding--3--large-412991?style=for-the-badge&logo=openai&logoColor=white) | 1536차원 벡터 임베딩으로 문서 유사도 검색 정확도를 확보하기 위해 사용 |
| PDF Parsing | ![PDFBox](https://img.shields.io/badge/PDFBox%203.0-D22128?style=for-the-badge&logo=apache&logoColor=white) | PDF 문서의 텍스트와 테이블을 정밀하게 추출하기 위해 사용 |
| Office Parsing | ![Apache POI](https://img.shields.io/badge/Apache%20POI%205.4-D22128?style=for-the-badge&logo=apache&logoColor=white) | Word/Excel 문서를 서버에서 직접 파싱하기 위해 사용 |
| Generic Parsing | ![Tika](https://img.shields.io/badge/Apache%20Tika-D22128?style=for-the-badge&logo=apache&logoColor=white) | 다양한 파일 형식을 통합 파싱하기 위한 폴백으로 도입 |

### Database & Cache
| Category | Stack | 도입 이유 |
|----------|-------|----------|
| RDBMS | ![PostgreSQL](https://img.shields.io/badge/PostgreSQL%2016-4169E1?style=for-the-badge&logo=postgresql&logoColor=white) | 파티셔닝, JSONB, pgvector 등 고급 기능을 활용한 로그/벡터 저장소로 사용 |
| Vector Store | ![pgvector](https://img.shields.io/badge/pgvector-4169E1?style=for-the-badge&logo=postgresql&logoColor=white) | HNSW 인덱스 기반 코사인 유사도 검색으로 RAG 벡터 저장소를 구성하기 위해 도입 |
| Full-text Search | ![pg_bigm](https://img.shields.io/badge/pg__bigm-4169E1?style=for-the-badge&logo=postgresql&logoColor=white) | 한국어 2-gram 기반 전문 검색으로 문서/패치노트 키워드 검색을 지원하기 위해 도입 |
| Cache / Stream | ![Redis](https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white) | 로그 수집 스트리밍(Redis Streams), JWT 세션, Rate Limiting, HyperLogLog를 통합 처리하기 위해 사용 |
| Rate Limiting | ![Bucket4j](https://img.shields.io/badge/Bucket4j-DC382D?style=for-the-badge) | 로그 수집 API의 요청 속도를 제한하여 시스템 안정성을 확보하기 위해 도입 |
| Resilience | ![Resilience4j](https://img.shields.io/badge/Resilience4j-000000?style=for-the-badge) | Redis Streams 장애 시 Circuit Breaker와 Retry로 시스템 복원력을 확보하기 위해 도입 |

### Infrastructure
| Category | Stack | 도입 이유 |
|----------|-------|----------|
| Container | ![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white) | PostgreSQL, Redis 등 인프라를 환경 차이 없이 일관되게 구성하기 위해 사용 |
| Object Storage | ![AWS S3](https://img.shields.io/badge/AWS%20S3-569A31?style=for-the-badge&logo=amazons3&logoColor=white) | 문서 파일 저장 및 Cold Storage 아카이빙을 위해 도입 |
| Cold Storage | ![Parquet](https://img.shields.io/badge/Apache%20Parquet-50ABF1?style=for-the-badge&logo=apache&logoColor=white) | 4주 이상 경과된 로그를 컬럼 기반 압축 포맷으로 S3에 아카이빙하기 위해 사용 |
| S3 Emulation | ![LocalStack](https://img.shields.io/badge/LocalStack-4666E5?style=for-the-badge) | 로컬 개발 환경에서 AWS S3를 에뮬레이션하여 비용 없이 테스트하기 위해 사용 |

### Monitoring & Testing
| Category | Stack | 도입 이유 |
|----------|-------|----------|
| Metrics | ![Prometheus](https://img.shields.io/badge/Prometheus-E6522C?style=for-the-badge&logo=prometheus&logoColor=white) | 애플리케이션 메트릭을 수집하여 성능 이상을 조기에 파악하기 위해 도입 |
| Dashboard | ![Grafana](https://img.shields.io/badge/Grafana-F46800?style=for-the-badge&logo=grafana&logoColor=white) | 서버 자원과 애플리케이션 상태를 시각적으로 모니터링하기 위해 사용 |
| Metrics DB | ![InfluxDB](https://img.shields.io/badge/InfluxDB%201.8-22ADF6?style=for-the-badge&logo=influxdb&logoColor=white) | k6 부하 테스트 결과를 시계열 데이터로 저장·조회하기 위해 사용 |
| Load Testing | ![k6](https://img.shields.io/badge/k6-7D64FF?style=for-the-badge&logo=k6&logoColor=white) | 로그 수집 API의 성능 한계를 측정하고 병목을 사전에 발견하기 위해 도입 |

### Frontend
| Category | Stack | 도입 이유 |
|----------|-------|----------|
| Template Engine | ![Thymeleaf](https://img.shields.io/badge/Thymeleaf-005F0F?style=for-the-badge&logo=thymeleaf&logoColor=white) | 서버사이드 렌더링으로 초기 로드 속도를 확보하고 Spring Security와 자연스럽게 통합하기 위해 사용 |
| JavaScript | ![JavaScript](https://img.shields.io/badge/Vanilla%20JS%20(ES6+)-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black) | 프레임워크 의존 없이 SSE, Fetch API 등 브라우저 네이티브 기능을 활용하기 위해 사용 |
| Charts | ![Chart.js](https://img.shields.io/badge/Chart.js-FF6384?style=for-the-badge&logo=chartdotjs&logoColor=white) | 대시보드 위젯의 데이터 시각화를 가볍고 유연하게 구현하기 위해 사용 |
| File Upload | ![Dropzone](https://img.shields.io/badge/Dropzone-4FC08D?style=for-the-badge) | 드래그 앤 드롭 문서 업로드 UX를 직관적으로 제공하기 위해 도입 |
| Styling | ![Bootstrap](https://img.shields.io/badge/Bootstrap-7952B3?style=for-the-badge&logo=bootstrap&logoColor=white) | 반응형 레이아웃과 UI 컴포넌트를 빠르게 구성하기 위해 사용 |

---

<a id="핵심-기능-소개"></a>
## ✨ 핵심 기능 소개

### 📡 실시간 로그 수집

| 로그 수집 파이프라인                                                                  |
|------------------------------------------------------------------------------|
| ![로그수집이미지 — 게임 서버에서 API Key 기반으로 로그가 수집되는 화면 또는 흐름도](./docs/logpipeline.png) |

- Redis Streams 기반 비동기 수집 + 적응형 배치 처리 (100~1,000건)
- 심각도 기반 샘플링 (DEBUG 5%, INFO 10%, WARN 50%, ERROR/FATAL 100%)
- Dead Letter Queue + 최대 5회 재시도
- Hot/Warm/Cold 3단계 계층형 스토리지 (SSD → HDD → S3 Parquet)

### 🔍 자동 이슈 분류 & 심각도 평가

| 이슈 대시보드                                                            |
|--------------------------------------------------------------------|
| ![이슈대시보드이미지 — 이슈 목록 화면에서 심각도별 분류, 상태 관리가 보이는 화면](./docs/issue.gif) |

- SHA-256 핑거프린트로 동일 이슈 자동 그룹핑
- 5가지 전략으로 0~100점 심각도 스코어 산출 (빈도/사용자수/비즈니스임팩트/차단정도/크래시유형)
- 이슈 라이프사이클: RECOMMENDED → TODO → IN_PROGRESS → RESOLVED
- 담당자 배정 + 변경 이력(Audit Trail) 자동 추적

### 🤖 AI 문서 검색 (RAG 챗봇)

| RAG 챗봇 대화                                                                   |
|-----------------------------------------------------------------------------|
| ![RAG챗봇이미지 — 챗봇 화면에서 사용자가 질문하고 AI가 문서 기반 답변을 스트리밍하는 화면](./docs/chatbot.gif) |

- PDF 문서 업로드 → 자동 파싱 → 벡터 임베딩 (OpenAI text-embedding-3-large)
- pgvector HNSW 인덱스 기반 코사인 유사도 검색 (threshold 0.3, top-K 5)
- SSE 스트리밍으로 토큰 단위 실시간 응답
- 멀티 LLM 지원: OpenAI GPT-4.1 / Google Gemini 2.5 / Ollama (HyperCLOVA X)

### 📝 패치노트 자동 생성

| 패치노트 AI 생성                                                      |
|-----------------------------------------------------------------|
| ![패치노트이미지 — 패치노트 초안이 AI에 의해 스트리밍 생성되는 화면](./docs/patchnote.gif) |

- 해결된 이슈 + 문서 변경 사항 → PendingItem 후보 자동 수집
- RAG 컨텍스트 구성 → AI가 패치노트 초안 스트리밍 생성
- 할루시네이션 참조 자동 제거 (RefValidator)
- 시맨틱 버저닝 (major.minor.patch) + DRAFT → PUBLISHED 워크플로우

### 🔎 로그 탐색기 (No-code SQL)

| 로그 탐색기                                                              |
|---------------------------------------------------------------------|
| ![로그탐색기이미지 — JSON 기반 쿼리 빌더로 로그를 검색·집계하는 화면](./docs/logexplorer.gif) |

- SQL 없이 JSON DSL로 SELECT, WHERE, ORDER BY, GROUP BY 구성
- 집계 함수 지원: COUNT, SUM, AVG, MIN, MAX, DISTINCT
- JSONB 필드 중첩 접근 (`attributes.game.fps`)
- 파라미터 바인딩으로 SQL Injection 완전 차단

### 📊 커스텀 대시보드

| 대시보드 위젯                                                            |
|--------------------------------------------------------------------|
| ![대시보드이미지 — 드래그 앤 드롭으로 위젯을 배치하고 차트가 표시되는 화면](./docs/dashboard.gif) |

- 사용자별 위젯 레이아웃 저장 (JSONB)
- 드래그 앤 드롭 배치
- Chart.js 기반 데이터 시각화
- 시간 범위 설정 (15분 ~ 30일)

### 👥 프로젝트 & 조직 관리

| 프로젝트 관리 |
|----------|
| [프로젝트관리이미지 — 프로젝트 설정, 멤버 관리, API Key 발급 화면](./docs/dashboard.png) |

- 멀티테넌트 구조 (Company → Project → Member)
- OAuth2 소셜 로그인 (GitHub, Google)
- 프로젝트 역할 기반 접근 제어 (MANAGER / MEMBER / VIEWER)
- 이메일 초대 (HMAC-SHA256 서명, 72시간 만료)
- API Key 발급·폐기 관리 (해시 저장, prefix + last4 표시)

### 🔔 실시간 알림 (SSE)

- SSE 기반 실시간 토스트 알림
- 이벤트 타입: 이슈 생성, 담당자 배정, 문서 업로드, 패치노트 등
- 읽음/무시/해제 상태 관리 + 관련 리소스 딥 링크
- DB 영속 저장 + SSE 비동기 전송 분리

---

## 내가 구현한 기능

### 📡 실시간 로그 수집 파이프라인 (logprocessor 도메인)

#### 핵심 구현
- **Redis Streams 기반 비동기 로그 수집**
  - Consumer Group 패턴으로 병렬 처리
  - 적응형 배치 크기 (100~1,000건) 동적 조정
  - 메시지 유실 방지 (ACK 기반 신뢰성 보장)

- **Batch Insert 최적화**
  - JdbcTemplate.batchUpdate()로 대량 로그 일괄 저장
  - 단건 INSERT 대비 **10배 이상 성능 향상**
  - 트랜잭션 단위로 배치 처리하여 일관성 보장

- **백프레셔 관리 시스템 (BackpressureManager)**
  - DB 응답 시간 측정 → 배치 크기 자동 조정
  - latency < 100ms: 배치 증가 / latency > 300ms: 배치 감소
  - 시스템 과부하 시 우아한 성능 저하(graceful degradation)

- **안정성 확보**
  - Dead Letter Queue + 최대 5회 재시도
  - Circuit Breaker (Resilience4j): 장애 전파 차단
  - 심각도 기반 샘플링 (DEBUG 5% ~ ERROR 100%)

- **3단계 계층형 스토리지**
  - Hot (PostgreSQL SSD): 최근 1주일
  - Warm (PostgreSQL HDD): 1~4주
  - Cold (S3 Parquet): 4주 이상

#### 기술 스택
- Redis Streams, Resilience4j
- PostgreSQL 파티셔닝 (주별 RANGE), JdbcTemplate Batch Insert
- Apache Parquet, Spring @Scheduled, CompletableFuture

#### 성과
- 피크 시 PEL 크기: **10,000+ → 100 이하** 개선
- DB 과부하 시: 연쇄 실패 → **배치 축소 + 우아한 감속**
- 장애 복구: 수동 재시작 → **Circuit Breaker 자동 복구**

---

### 🔍 자동 이슈 분류 & 심각도 평가 (issue 도메인)

#### 핵심 구현
- **SHA-256 핑거프린트 기반 이슈 그룹핑**
  - 스택 트레이스 + 에러 메시지 → 해시 생성
  - 동일 이슈 자동 병합 (중복 제거)
  - UNIQUE 제약 조건으로 중복 생성 방지

- **전략 패턴(Strategy Pattern) 기반 심각도 스코어링 (0~100점)**
  - 5개의 독립적인 전략 클래스로 심각도 평가 로직 분리
  - 각 전략이 개별적으로 점수 산출 후 종합 평가
  - 신규 전략 추가/제거 시 기존 코드 수정 불필요 (OCP 원칙)

  1. **FrequencyStrategy**: 발생 횟수 기반 점수 (log10 스케일)
  2. **UserImpactStrategy**: 영향받은 고유 사용자 수 (Redis HyperLogLog)
  3. **BusinessImpactStrategy**: 결제/인증/핵심 기능 가중치
  4. **BlockingLevelStrategy**: FATAL > ERROR > WARN 순 점수
  5. **CrashTypeStrategy**: OutOfMemory, StackOverflow 등 치명도

- **이슈 라이프사이클 관리**
  - RECOMMENDED → TODO → IN_PROGRESS → RESOLVED
  - 담당자 배정 + 변경 이력(Audit Trail) 자동 추적
  - 심각도 80점 이상 자동 알림 (SSE)

- **이슈 댓글 시스템**
  - 멘션 기능 (@username)
  - 실시간 알림 (Server-Sent Events)

#### 기술 스택
- 전략 패턴 (Strategy Pattern) - 심각도 평가 알고리즘 분리
- Redis HyperLogLog (사용자 영향도 추정)
- JPA Auditing (변경 이력 자동 추적)
- Spring Events (도메인 이벤트 기반 알림)

#### 성과
- 동일 이슈 중복 생성: **SHA-256 핑거프린트로 완전 차단**
- 심각도 평가: **전략 패턴으로 확장 가능한 평가 시스템** 구축
- 이슈 관리: **라이프사이클 + Audit Trail**로 추적성 확보

---

<a id="트러블-슈팅"></a>
## 🛠 트러블 슈팅

### 1. 로그 TTL 정책 수립과 스토리지 Tier 결정

**📌 문제 상황**

비동기 로그 수집 파이프라인에서 **데이터 수명 주기(TTL) 정책이 확립되지 않아**
스토리지 계층 이동 전략과 파티션 단위를 결정해야 하는 상황이 발생했다.

**현재 아키텍처:**

| 메시지 큐 | Hot/Warm Storage | Cold Storage |
|----------|------------------|--------------|
| Redis Stream | PostgreSQL | Amazon S3 |
| 비동기 배치 처리 | Range Partitioning | 장기 보관 / 저비용 |

**핵심 의사결정 문제:**
1. **TTL Tier 수 결정**: 3-Tier(Hot→Warm→Cold) vs 2-Tier(Hot→Cold)?
2. **파티션 단위 결정**: 일별(365개) vs 주별(52개) vs 월별(12개)?
3. **파티션 관리 자동화**: Flyway 초기 생성 + Scheduled Job 동적 관리 방식의 타당성?

**🔍 원인 분석**

**1️⃣ 파티션 수와 쿼리 플래닝 오버헤드**

PostgreSQL은 쿼리 실행 전 파티션 프루닝(Partition Pruning) 단계에서
WHERE 조건을 분석해 실제 스캔할 파티션을 필터링한다.
이 과정 자체가 O(파티션 수)의 메모리와 CPU를 소모한다.

| 파티션 수 | Planning 부담 | Pruning 효과 | 실무 판단 |
|-----------|--------------|-------------|----------|
| ~100개 (일별 약 3개월) | 낮음 | 높음 | 문제없음 |
| 365개 (일별 1년) | 중간 | 높음 | 감내 가능, 모니터링 필요 |
| 1,000개+ | 높음 | 중간 | 성능 저하 가능성 |

**2️⃣ Flyway + Scheduled Job 조합이 표준인 이유**

- **Flyway**: 테이블 스키마는 코드와 함께 버전 관리되어야 함. 파티션 부모 테이블과 초기 파티션을 Migration으로 관리하면 개발/스테이징/운영 환경에서 동일한 구조를 보장
- **Scheduled Job**: 파티션은 시간에 따라 계속 생성/삭제되는 동적 객체. 미래 파티션을 사전 생성하지 않으면 해당 시점에 INSERT가 실패하므로, 적어도 2~4주 앞의 파티션을 미리 만들어두는 Job이 필수
- **pg_partman**: 확장 모듈 설치가 가능한 환경이라면 Scheduled Job 대신 pg_partman을 사용하면 관리 오버헤드를 대폭 줄일 수 있음

**✔️ 해결 방법**

**파티션 단위별 비교 분석:**

| 파티션 단위 | 연간 파티션 수 | 장점 | 단점 | 7일 TTL |
|------------|--------------|------|------|---------|
| 일별 | 365개 | 정확한 TTL 구현 가능 | 쿼리 플래닝 오버헤드 우려 | ✔ 정확 |
| **주별** | **52개** | **관리 용이, 오버헤드 적음** | 최대 6일 오차 발생 | △ 근사 |
| 월별 | 12개 | 관리 가장 간단 | 7일 TTL 구현 불가 | ✘ 불가 |

**최종 결정: 주별 파티셔닝 + 3-Tier 스토리지**

게임사는 패치를 1달 주기로 하는 곳이 많아 주별 단위 관리가 업무 주기와 일치하며,
52개 파티션은 플래닝 오버헤드가 낮고 관리가 용이하다고 판단.

```sql
-- 주별 파티션 예시
CREATE TABLE game_logs_2026_w12 PARTITION OF game_logs
  FOR VALUES FROM ('2026-03-17') TO ('2026-03-24');
```

**3-Tier 스토리지 정책:**
- **Hot (PostgreSQL SSD)**: 최근 1주일 (실시간 검색/분석)
- **Warm (PostgreSQL HDD)**: 1~4주 (주기적 리포트)
- **Cold (S3 Parquet)**: 4주 이상 (규정 준수/장기 보관)

**📊 결과**

| 항목 | 최종 선택 | 이유 |
|------|---------|------|
| 파티션 단위 | 주별 (52개) | 관리 용이 + 게임 패치 주기 일치 |
| TTL Tier | 3-Tier | Hot/Warm 분리로 비용 최적화 |
| 관리 자동화 | Flyway + Scheduled Job | 환경 일관성 + 동적 파티션 생성 |

---

### 2. FrequencyStrategy 장기 지속 이슈 계산 범위 제한

**📌 문제 상황**

Redis에 전체 로그 수를 추적하면서 **TTL(7일)**과 장기 지속 이슈 간 데이터 불일치가 발생했다.

**구체적 사례:**
```java
// UserCountTracker.java
redisTemplate.expire(key, Duration.ofDays(7));  // 7일 후 데이터 삭제

// FrequencyStrategy.java
// 8일 이상 지속된 이슈의 경우 firstOccurredAt이 7일 이전
long totalLogs = userCountTracker.getTotalLogsInTimeRange(
    issue.getProjectId(),
    issue.getFirstOccurredAt(),  // 10일 전
    issue.getLastOccurredAt()     // 오늘
);
// totalLogs = 0 (7일 이전 데이터 TTL 만료) ❌
```

**🔍 원인 분석**

**시스템 아키텍처 불일치:**
- **Redis Stream** (메시지 큐): PostgreSQL로 bulk insert 후 ACK (즉시 삭제)
- **Redis Counter** (집계 데이터): 7일 TTL 후 삭제
- **Issue 엔티티** (PostgreSQL): 영구 저장소, 무기한 보관

→ 오래된 이슈 재계산 시 Redis 데이터 부족

**설계 시 고려 부족:**
- 초기 설계: 심각도 계산을 1회성 이벤트로 가정 (이슈 생성 시 1번 계산 후 고정)
- 실제: 이슈는 지속적으로 업데이트됨 (새 로그 추가 시 재계산)
- 결과: 장기간 지속되는 이슈 존재 (7일 이상)

**✔️ 해결 방법**

**계산 범위를 최근 7일로 제한:**

```java
private int calculateFrequencyScore(Issue issue) {
    OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
    OffsetDateTime firstOccurred = issue.getFirstOccurredAt();

    // Redis TTL(7일) 이내 데이터만 사용
    OffsetDateTime limitedStart = firstOccurred;
    if (Duration.between(firstOccurred, now).toDays() > 7) {
        limitedStart = now.minusDays(7);
        log.debug("이슈 발생 기간이 7일 초과. 최근 7일 데이터만 사용");
    }

    // 최근 7일 이내 발생 횟수로 점수 계산
    long occurrencesInRange = calculateOccurrencesInRange(
        issue, limitedStart, issue.getLastOccurredAt());

    return mapFrequencyToScore(occurrencesInRange);
}
```

**설계 트레이드오프 검토:**

| 방안 | 장점 | 단점 | 선택 이유 |
|-----|------|------|----------|
| A. PostgreSQL 집계 테이블 | 전체 기간 정확한 계산 | ERD 수정, 엔티티 추가, 배치 작업 필요 | ❌ ERD 수정은 너무 큰 작업 |
| B. Redis TTL 30일 연장 | 간단한 수정 | 메모리 증가, 근본 해결 아님 | ❌ 임시방편 |
| C. 계산 범위 7일 제한 | 정확성 보장, ERD 수정 불필요 | 장기 이슈는 최근 추세만 반영 | ✅ 채택 |

**채택 근거:**
- 심각도는 **최근 추세가 더 중요** (30일 전 에러보다 오늘 에러가 중요)
- Redis TTL과 정합성 보장
- 현재 브랜치에서 즉시 적용 가능
- 향후 방안 A로 점진적 개선 가능

**📊 결과**

| 상황 | 개선 전 | 개선 후 |
|------|---------|---------|
| 8일 지속 이슈 | TTL 만료 → fallback (부정확) | 최근 7일 발생 횟수로 정확 계산 ✅ |
| 장기 이슈 평가 | 전체 기간 데이터 부족 | 최근 추세 기반 객관적 평가 ✅ |
| Redis 정합성 | 데이터 부재 시 에러 | TTL 범위 내 안정적 조회 ✅ |

---

### ✅ 트러블 슈팅 요약

| 문제 | 핵심 원인 | 해결 전략 |
|------|----------|----------|
| 로그 TTL 정책 미확립 | 파티션 단위 및 Tier 전략 부재 | 주별 파티셔닝 + 3-Tier 스토리지 |
| 장기 이슈 계산 오류 | Redis TTL vs 영구 저장소 불일치 | 계산 범위 7일 제한 |

