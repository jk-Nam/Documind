@echo off
REM ========================================
REM k6 부하 테스트 전체 실행 스크립트 (Windows)
REM ========================================

echo ========================================
echo k6 Load Testing - Full Suite
echo ========================================
echo.

REM 환경 변수 확인
if "%API_BASE_URL%"=="" (
    echo [ERROR] API_BASE_URL is not set
    echo Please run: set API_BASE_URL=http://localhost:8080
    exit /b 1
)

if "%PROJECT_ID%"=="" (
    echo [ERROR] PROJECT_ID is not set
    echo Please run: set PROJECT_ID=your-project-id
    exit /b 1
)

if "%API_KEY%"=="" (
    echo [ERROR] API_KEY is not set
    echo Please run: set API_KEY=your-api-key
    exit /b 1
)

echo Environment Variables:
echo   API_BASE_URL: %API_BASE_URL%
echo   PROJECT_ID: %PROJECT_ID%
echo   API_KEY: ****
echo.

REM 결과 디렉토리 생성
if not exist "results" mkdir results
echo Results will be saved to: %CD%\results
echo.

REM Core Scenarios
echo ========================================
echo Running Core Scenarios
echo ========================================
echo.

echo [1/5] Log Collection Stress Test...
k6 run scenarios\log-collection-stress.js
if %ERRORLEVEL% NEQ 0 (
    echo [FAILED] Log Collection Stress Test
) else (
    echo [PASSED] Log Collection Stress Test
    move log-collection-stress-summary.json results\
)
echo.

echo [2/5] Redis Pipeline Test...
k6 run scenarios\redis-pipeline-test.js
if %ERRORLEVEL% NEQ 0 (
    echo [FAILED] Redis Pipeline Test
) else (
    echo [PASSED] Redis Pipeline Test
    move redis-pipeline-test-summary.json results\
)
echo.

echo [3/5] Issue Grouping Test...
k6 run scenarios\issue-grouping-test.js
if %ERRORLEVEL% NEQ 0 (
    echo [FAILED] Issue Grouping Test
) else (
    echo [PASSED] Issue Grouping Test
    move issue-grouping-test-summary.json results\
)
echo.

echo [4/5] Partition Query Test...
k6 run scenarios\partition-query-test.js
if %ERRORLEVEL% NEQ 0 (
    echo [FAILED] Partition Query Test
) else (
    echo [PASSED] Partition Query Test
    move partition-query-test-summary.json results\
)
echo.

echo [5/5] End-to-End Latency Test...
k6 run scenarios\end-to-end-latency.js
if %ERRORLEVEL% NEQ 0 (
    echo [FAILED] End-to-End Latency Test
) else (
    echo [PASSED] End-to-End Latency Test
    move end-to-end-latency-summary.json results\
)
echo.

REM Extended Scenarios
echo ========================================
echo Running Extended Scenarios (Optional)
echo ========================================
echo.

set /p RUN_EXTENDED=Run extended scenarios? (y/N):
if /i "%RUN_EXTENDED%"=="y" (
    echo.
    echo [6/7] Issue API Under Load Test...
    k6 run scenarios\issue-api-under-load.js
    if %ERRORLEVEL% NEQ 0 (
        echo [FAILED] Issue API Under Load Test
    ) else (
        echo [PASSED] Issue API Under Load Test
        move issue-api-under-load-summary.json results\
    )
    echo.

    echo [7/7] Partition Creation Test...
    k6 run scenarios\partition-creation-test.js
    if %ERRORLEVEL% NEQ 0 (
        echo [FAILED] Partition Creation Test
    ) else (
        echo [PASSED] Partition Creation Test
        move partition-creation-test-summary.json results\
    )
    echo.
)

REM Optional Scenarios
echo ========================================
echo Running Optional Scenarios
echo ========================================
echo.

set /p RUN_OPTIONAL=Run optional scenarios? (y/N):
if /i "%RUN_OPTIONAL%"=="y" (
    echo.
    echo [8/9] Backpressure Test...
    k6 run scenarios\backpressure-test.js
    if %ERRORLEVEL% NEQ 0 (
        echo [FAILED] Backpressure Test
    ) else (
        echo [PASSED] Backpressure Test
        move backpressure-test-summary.json results\
    )
    echo.

    echo [9/9] Storage Tier Comparison Test...
    k6 run scenarios\storage-tier-comparison.js
    if %ERRORLEVEL% NEQ 0 (
        echo [FAILED] Storage Tier Comparison Test
    ) else (
        echo [PASSED] Storage Tier Comparison Test
        move storage-tier-comparison-summary.json results\
    )
    echo.
)

echo ========================================
echo All Tests Completed!
echo ========================================
echo.
echo Results saved to: %CD%\results
echo.
echo To view summary reports:
echo   - Check JSON files in results\ directory
echo   - Or run: type results\*-summary.json
echo.

pause
