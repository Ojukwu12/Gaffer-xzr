#!/bin/bash

# Polyscope Pre-Deployment Verification Script
# Run this before deploying to production

set -e  # Exit on error

echo "=================================================="
echo "🔍 Polyscope Pre-Deployment Verification"
echo "=================================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track results
PASSED=0
FAILED=0
WARNINGS=0

# Function to print results
print_result() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✅ PASS${NC}: $2"
        ((PASSED++))
    else
        echo -e "${RED}❌ FAIL${NC}: $2"
        ((FAILED++))
    fi
}

print_warning() {
    echo -e "${YELLOW}⚠️  WARN${NC}: $1"
    ((WARNINGS++))
}

print_info() {
    echo -e "ℹ️  INFO: $1"
}

echo "1️⃣  Checking Node.js version..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    print_result 0 "Node.js is installed ($NODE_VERSION)"
else
    print_result 1 "Node.js is not installed"
fi
echo ""

echo "2️⃣  Checking npm dependencies..."
if [ -f "package.json" ]; then
    if [ -d "node_modules" ]; then
        print_result 0 "node_modules exists"
    else
        print_warning "node_modules not found. Run: npm install"
    fi
else
    print_result 1 "package.json not found"
fi
echo ""

echo "3️⃣  Checking environment configuration..."
if [ -f ".env" ]; then
    print_result 0 ".env file exists"
    
    # Check for required variables
    REQUIRED_VARS=("MONGODB_URI" "GEMINI_API_KEY" "JWT_SECRET")
    for var in "${REQUIRED_VARS[@]}"; do
        if grep -q "^${var}=" .env; then
            print_result 0 "$var is configured"
        else
            print_result 1 "$var is missing in .env"
        fi
    done
else
    print_result 1 ".env file not found. Copy from .env.example"
fi
echo ""

echo "4️⃣  Running linter..."
if npm run lint 2>&1 | tee /tmp/lint-output.txt; then
    print_result 0 "Code passes linting"
else
    ERROR_COUNT=$(grep -c "error" /tmp/lint-output.txt || echo "0")
    if [ "$ERROR_COUNT" -gt "0" ]; then
        print_result 1 "Linting failed with $ERROR_COUNT errors"
    else
        print_warning "Linting has warnings (but no errors)"
    fi
fi
echo ""

echo "5️⃣  Running test suite..."
if npm test -- --passWithNoTests 2>&1 | tee /tmp/test-output.txt; then
    print_result 0 "All tests passed"
    
    # Check coverage
    if [ -f "coverage/coverage-summary.json" ]; then
        print_info "Coverage report generated"
    fi
else
    print_result 1 "Tests failed"
fi
echo ""

echo "6️⃣  Checking for security vulnerabilities..."
npm audit --audit-level=high 2>&1 | tee /tmp/audit-output.txt
if [ ${PIPESTATUS[0]} -eq 0 ]; then
    print_result 0 "No high/critical vulnerabilities found"
else
    VULN_COUNT=$(grep -c "vulnerabilities" /tmp/audit-output.txt || echo "0")
    print_warning "Security vulnerabilities detected. Review with: npm audit"
fi
echo ""

echo "7️⃣  Checking Git status..."
if command -v git &> /dev/null; then
    if [ -d ".git" ]; then
        UNCOMMITTED=$(git status --porcelain | wc -l)
        if [ "$UNCOMMITTED" -eq 0 ]; then
            print_result 0 "No uncommitted changes"
        else
            print_warning "$UNCOMMITTED uncommitted files"
        fi
        
        BRANCH=$(git branch --show-current)
        print_info "Current branch: $BRANCH"
    else
        print_warning "Not a Git repository"
    fi
else
    print_warning "Git is not installed"
fi
echo ""

echo "8️⃣  Checking Docker configuration..."
if [ -f "Dockerfile" ]; then
    print_result 0 "Dockerfile exists"
else
    print_warning "Dockerfile not found"
fi

if [ -f "docker-compose.yml" ]; then
    print_result 0 "docker-compose.yml exists"
else
    print_warning "docker-compose.yml not found"
fi
echo ""

echo "9️⃣  Checking documentation..."
DOCS=("README.md" "API_DOCUMENTATION.md" "FEATURES.md" "TESTING_GUIDE.md")
for doc in "${DOCS[@]}"; do
    if [ -f "$doc" ]; then
        print_result 0 "$doc exists"
    else
        print_warning "$doc not found"
    fi
done
echo ""

echo "🔟  Database connectivity check..."
if [ -f ".env" ]; then
    source .env
    if [ -n "$MONGODB_URI" ]; then
        print_info "MongoDB URI configured: ${MONGODB_URI:0:20}..."
        # Note: Actual connection test would require mongosh or node script
        print_warning "Manual verification needed: Ensure MongoDB is accessible"
    fi
else
    print_warning "Cannot check database connection (no .env)"
fi
echo ""

# Summary
echo "=================================================="
echo "📊 Verification Summary"
echo "=================================================="
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo -e "${YELLOW}Warnings: $WARNINGS${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    if [ $WARNINGS -eq 0 ]; then
        echo -e "${GREEN}🎉 All checks passed! Ready for deployment.${NC}"
        exit 0
    else
        echo -e "${YELLOW}⚠️  All critical checks passed, but review warnings before deploying.${NC}"
        exit 0
    fi
else
    echo -e "${RED}❌ Deployment blocked. Fix the failed checks above.${NC}"
    exit 1
fi
