# k6 부하 테스트 빠른 시작 가이드

## 1️⃣ k6 설치

### Windows
```bash
choco install k6
```

### macOS
```bash
brew install k6
```

### Linux
```bash
# Debian/Ubuntu
sudo apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6

# CentOS/Fedora
sudo dnf install https://dl.k6.io/rpm/repo.rpm
sudo dnf install k6
```

---

## 2️⃣ 환경 변수 설정

### Windows (CMD)
```cmd
set API_BASE_URL=http://localhost:8080
set PROJECT_ID=your-project-id-here
set API_KEY=your-api-key-here
```

### Windows (PowerShell)
```powershell
$env:API_BASE_URL="http://localhost:8080"
$env:PROJECT_ID="your-project-id-here"
$env:API_KEY="your-api-key-here"
```

### Unix/Mac
```bash
export API_BASE_URL=http://localhost:8080
export PROJECT_ID=your-project-id-here
export API_KEY=your-api-key-here
```

---

## 3️⃣ 테스트 실행

### 방법 1: 개별 시나리오 실행
```bash
# Core 테스트
k6 run scenarios/log-collection-stress.js
k6 run scenarios/redis-pipeline-test.js
k6 run scenarios/issue-grouping-test.js
k6 run scenarios/partition-query-test.js
k6 run scenarios/end-to-end-latency.js

# Extended 테스트
k6 run scenarios/issue-api-under-load.js
k6 run scenarios/partition-creation-test.js

# Optional 테스트
k6 run scenarios/backpressure-test.js
k6 run scenarios/storage-tier-comparison.js
```

### 방법 2: 전체 시나리오 순차 실행
```bash
# Windows
./run-all.bat

# Unix/Mac
chmod +x run-all.sh
./run-all.sh
```

---

## 4️⃣ 결과 확인

### 콘솔 출력
각 테스트는 실행 후 자동으로 요약 결과를 출력합니다.

```
========================================
로그 수집 API 부하 테스트 결과
========================================

총 요청 수: 30000
성공 요청: 29850
실패 요청: 150
오류율: 0.50%

응답 시간:
  - p50: 45.2ms
  - p95: 312.8ms
  - p99: 487.3ms
  - max: 892.1ms

RPS: 500.25

========================================
```

### JSON 결과 파일
`results/` 디렉토리에 상세 결과가 저장됩니다:
- `log-collection-stress-summary.json`
- `redis-pipeline-test-summary.json`
- 등...

```bash
# 전체 결과 확인
cat results/*-summary.json
```

---

## 5️⃣ 주요 메트릭 해석

### ✅ 통과 기준
- **응답 시간 p95**: 목표값 이내
- **오류율**: < 1%
- **RPS**: 최소 목표 달성

### ⚠️ 주의 표시
- 목표값은 만족하나 한계에 근접

### ❌ 실패
- 목표값 미달성

---

## 6️⃣ 트러블슈팅

### 문제 1: 환경 변수 에러
```
[ERROR] API_BASE_URL is not set
```

**해결**: 환경 변수 재설정 후 재실행

### 문제 2: 연결 거부
```
ERRO[0001] GoError: Get "http://localhost:8080/api/logs/collect": dial tcp [::1]:8080: connect: connection refused
```

**해결**:
- 서버가 실행 중인지 확인
- `API_BASE_URL`이 올바른지 확인

### 문제 3: 인증 에러 (401/403)
```
check.......................: 0.00% ✓ 0 ✗ 30000
```

**해결**: `API_KEY`와 `PROJECT_ID`가 유효한지 확인

### 문제 4: k6 명령을 찾을 수 없음
```
'k6'은(는) 내부 또는 외부 명령, 실행할 수 있는 프로그램, 또는 배치 파일이 아닙니다.
```

**해결**: k6 재설치 또는 PATH 환경 변수 확인

---

## 7️⃣ 고급 옵션

### 부하 수준 조정
환경 변수로 VU(Virtual Users) 수 조정:
```bash
# 낮은 부하
k6 run --vus 10 --duration 1m scenarios/log-collection-stress.js

# 높은 부하
k6 run --vus 500 --duration 5m scenarios/log-collection-stress.js
```

### 특정 단계만 실행
```javascript
// scenarios/log-collection-stress.js 파일 수정
export const options = {
    stages: [
        { duration: '10s', target: 50 },  // 빠른 테스트
    ],
};
```

### 결과를 InfluxDB에 전송
```bash
k6 run --out influxdb=http://localhost:8086/k6 scenarios/log-collection-stress.js
```

---

## 8️⃣ 권장 실행 순서

1. **개발 환경 검증**
   ```bash
   k6 run scenarios/log-collection-stress.js
   ```

2. **파이프라인 검증**
   ```bash
   k6 run scenarios/redis-pipeline-test.js
   ```

3. **종단 간 테스트**
   ```bash
   k6 run scenarios/end-to-end-latency.js
   ```

4. **전체 테스트 (릴리스 전)**
   ```bash
   ./run-all.sh  # Unix/Mac
   ./run-all.bat  # Windows
   ```

---

## 📞 지원

문제가 지속되거나 질문이 있으면:
- GitHub Issues 생성
- 팀 Slack 채널에 문의
- README.md의 상세 가이드 참조
