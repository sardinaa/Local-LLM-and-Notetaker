#!/bin/bash

# Comprehensive test script for PDF.js setup validation
# This script validates that all custom configurations are properly applied

echo "🧪 PDF.js Configuration Test Suite"
echo "==================================="

PDFJS_DIR="static/pdfjs"
CONFIG_DIR="pdfjs-config"
TEST_PASSED=0
TEST_FAILED=0

# Function to run a test
run_test() {
    local test_name="$1"
    local test_command="$2"
    local expected_result="$3"
    
    echo -n "Testing: $test_name... "
    
    if eval "$test_command"; then
        if [ "$expected_result" = "pass" ]; then
            echo "✅ PASS"
            TEST_PASSED=$((TEST_PASSED + 1))
        else
            echo "❌ FAIL (unexpected pass)"
            TEST_FAILED=$((TEST_FAILED + 1))
        fi
    else
        if [ "$expected_result" = "fail" ]; then
            echo "✅ PASS (expected fail)"
            TEST_PASSED=$((TEST_PASSED + 1))
        else
            echo "❌ FAIL"
            TEST_FAILED=$((TEST_FAILED + 1))
        fi
    fi
}

echo ""
echo "1. Testing Core PDF.js Files"
echo "----------------------------"

run_test "PDF.js core library exists" "[ -f '$PDFJS_DIR/build/pdf.js' ]" "pass"
run_test "PDF.js viewer exists" "[ -f '$PDFJS_DIR/web/viewer.js' ]" "pass"
run_test "PDF.js worker exists" "[ -f '$PDFJS_DIR/build/pdf.worker.js' ]" "pass"

echo ""
echo "2. Testing Custom Configuration Files"
echo "------------------------------------"

run_test "Custom highlight plugin exists" "[ -f '$PDFJS_DIR/highlight-plugin.js' ]" "pass"
run_test "Custom viewer.html exists" "[ -f '$PDFJS_DIR/web/viewer.html' ]" "pass"
run_test "Custom viewer.css exists" "[ -f '$PDFJS_DIR/web/viewer.css' ]" "pass"

echo ""
echo "3. Testing Custom Images"
echo "-----------------------"

run_test "AI highlights icon exists" "[ -f '$PDFJS_DIR/web/images/toolbarButton-aiHighlights.svg' ]" "pass"
run_test "Guided selection icon exists" "[ -f '$PDFJS_DIR/web/images/toolbarButton-guidedSelection.svg' ]" "pass"

echo ""
echo "4. Testing Configuration Content"
echo "------------------------------"

run_test "viewer.html contains highlight plugin script" "grep -q 'highlight-plugin.js' '$PDFJS_DIR/web/viewer.html'" "pass"
run_test "viewer.css contains custom highlight colors" "grep -q 'highlight-bg-color' '$PDFJS_DIR/web/viewer.css'" "pass"
run_test "highlight plugin contains expected functionality" "grep -q 'postMessage' '$PDFJS_DIR/highlight-plugin.js'" "pass"

echo ""
echo "5. Testing Configuration Consistency"
echo "-----------------------------------"

# Compare files with originals in pdfjs-config
run_test "highlight-plugin.js matches config" "cmp -s '$CONFIG_DIR/highlight-plugin.js' '$PDFJS_DIR/highlight-plugin.js'" "pass"
run_test "viewer.html matches config" "cmp -s '$CONFIG_DIR/viewer.html' '$PDFJS_DIR/web/viewer.html'" "pass"
run_test "viewer.css matches config" "cmp -s '$CONFIG_DIR/viewer.css' '$PDFJS_DIR/web/viewer.css'" "pass"
run_test "AI highlights icon matches config" "cmp -s '$CONFIG_DIR/images/toolbarButton-aiHighlights.svg' '$PDFJS_DIR/web/images/toolbarButton-aiHighlights.svg'" "pass"
run_test "Guided selection icon matches config" "cmp -s '$CONFIG_DIR/images/toolbarButton-guidedSelection.svg' '$PDFJS_DIR/web/images/toolbarButton-guidedSelection.svg'" "pass"

echo ""
echo "6. Testing File Permissions"
echo "---------------------------"

run_test "PDF.js files are readable" "[ -r '$PDFJS_DIR/build/pdf.js' ] && [ -r '$PDFJS_DIR/web/viewer.js' ]" "pass"
run_test "Custom files are readable" "[ -r '$PDFJS_DIR/highlight-plugin.js' ] && [ -r '$PDFJS_DIR/web/viewer.html' ]" "pass"

echo ""
echo "7. Testing Version Compatibility"
echo "-------------------------------"

# Check if files are .js (not .mjs)
run_test "Uses .js files (not .mjs)" "[ -f '$PDFJS_DIR/build/pdf.js' ] && [ ! -f '$PDFJS_DIR/build/pdf.mjs' ]" "pass"

echo ""
echo "==================================="
echo "Test Results Summary:"
echo "PASSED: $TEST_PASSED"
echo "FAILED: $TEST_FAILED"
echo ""

if [ $TEST_FAILED -eq 0 ]; then
    echo "🎉 All tests passed! PDF.js configuration is correct."
    echo ""
    echo "The setup is ready for deployment to other desktops."
    echo "Users can run: ./setup_pdfjs.sh"
    exit 0
else
    echo "⚠️  Some tests failed. Please check the configuration."
    echo ""
    echo "You may need to run: ./setup_pdfjs.sh --force"
    exit 1
fi
