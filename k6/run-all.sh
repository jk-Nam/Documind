#!/bin/bash

# ========================================
# k6 부하 테스트 전체 실행 스크립트 (Unix/Mac)
# ========================================

set -e  # 에러 발생 시 중단

echo "========================================"
echo "k6 Load Testing - Full Suite"
echo "========================================"
echo ""

# 환경 변수 확인
if [ -z "$API_BASE_URL" ]; then
    echo "[ERROR] API_BASE_URL is not set"
    echo "Please run: export API_BASE_URL=http://localhost:8080"
    exit 1
fi

if [ -z "$PROJECT_ID" ]; then
    echo "[ERROR] PROJECT_ID is not set"
    echo "Please run: export PROJECT_ID=your-project-id"
    exit 1
fi

if [ -z "$API_KEY" ]; then
    echo "[ERROR] API_KEY is not set"
    echo "Please run: export API_KEY=your-api-key"
    exit 1
fi

echo "Environment Variables:"
echo "  API_BASE_URL: $API_BASE_URL"
echo "  PROJECT_ID: $PROJECT_ID"
echo "  API_KEY: ****"
echo ""

# 결과 디렉토리 생성
mkdir -p results
echo "Results will be saved to: $(pwd)/results"
echo ""

# Core Scenarios
echo "========================================"
echo "Running Core Scenarios"
echo "========================================"
echo ""

echo "[1/5] Log Collection Stress Test..."
if k6 run scenarios/log-collection-stress.js; then
    echo "[PASSED] Log Collection Stress Test"
    mv log-collection-stress-summary.json results/ 2>/dev/null || true
else
    echo "[FAILED] Log Collection Stress Test"
fi
echo ""

echo "[2/5] Redis Pipeline Test..."
if k6 run scenarios/redis-pipeline-test.js; then
    echo "[PASSED] Redis Pipeline Test"
    mv redis-pipeline-test-summary.json results/ 2>/dev/null || true
else
    echo "[FAILED] Redis Pipeline Test"
fi
echo ""

echo "[3/5] Issue Grouping Test..."
if k6 run scenarios/issue-grouping-test.js; then
    echo "[PASSED] Issue Grouping Test"
    mv issue-grouping-test-summary.json results/ 2>/dev/null || true
else
    echo "[FAILED] Issue Grouping Test"
fi
echo ""

echo "[4/5] Partition Query Test..."
if k6 run scenarios/partition-query-test.js; then
    echo "[PASSED] Partition Query Test"
    mv partition-query-test-summary.json results/ 2>/dev/null || true
else
    echo "[FAILED] Partition Query Test"
fi
echo ""

echo "[5/5] End-to-End Latency Test..."
if k6 run scenarios/end-to-end-latency.js; then
    echo "[PASSED] End-to-End Latency Test"
    mv end-to-end-latency-summary.json results/ 2>/dev/null || true
else
    echo "[FAILED] End-to-End Latency Test"
fi
echo ""

# Extended Scenarios
echo "========================================"
echo "Running Extended Scenarios (Optional)"
echo "========================================"
echo ""

read -p "Run extended scenarios? (y/N): " RUN_EXTENDED
if [[ "$RUN_EXTENDED" =~ ^[Yy]$ ]]; then
    echo ""
    echo "[6/7] Issue API Under Load Test..."
    if k6 run scenarios/issue-api-under-load.js; then
        echo "[PASSED] Issue API Under Load Test"
        mv issue-api-under-load-summary.json results/ 2>/dev/null || true
    else
        echo "[FAILED] Issue API Under Load Test"
    fi
    echo ""

    echo "[7/7] Partition Creation Test..."
    if k6 run scenarios/partition-creation-test.js; then
        echo "[PASSED] Partition Creation Test"
        mv partition-creation-test-summary.json results/ 2>/dev/null || true
    else
        echo "[FAILED] Partition Creation Test"
    fi
    echo ""
fi

# Optional Scenarios
echo "========================================"
echo "Running Optional Scenarios"
echo "========================================"
echo ""

read -p "Run optional scenarios? (y/N): " RUN_OPTIONAL
if [[ "$RUN_OPTIONAL" =~ ^[Yy]$ ]]; then
    echo ""
    echo "[8/9] Backpressure Test..."
    if k6 run scenarios/backpressure-test.js; then
        echo "[PASSED] Backpressure Test"
        mv backpressure-test-summary.json results/ 2>/dev/null || true
    else
        echo "[FAILED] Backpressure Test"
    fi
    echo ""

    echo "[9/9] Storage Tier Comparison Test..."
    if k6 run scenarios/storage-tier-comparison.js; then
        echo "[PASSED] Storage Tier Comparison Test"
        mv storage-tier-comparison-summary.json results/ 2>/dev/null || true
    else
        echo "[FAILED] Storage Tier Comparison Test"
    fi
    echo ""
fi

echo "========================================"
echo "All Tests Completed!"
echo "========================================"
echo ""
echo "Results saved to: $(pwd)/results"
echo ""
echo "To view summary reports:"
echo "  - Check JSON files in results/ directory"
echo "  - Or run: cat results/*-summary.json"
echo ""
