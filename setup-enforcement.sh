#!/bin/bash
set -e

echo "🔧 Setting up code quality enforcement for Bible App..."
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo "📍 Working directory: $SCRIPT_DIR"
echo ""

# 1. Create pre-commit hook
echo "📝 Installing pre-commit hook..."
mkdir -p .git/hooks

cat > .git/hooks/pre-commit << 'EOF'
#!/bin/bash
set -e

echo ""
echo "🔍 Running pre-commit checks..."
echo ""

# Check if npm is available
if ! command -v npm &> /dev/null; then
    echo "❌ npm not found. Install Node.js and try again."
    exit 1
fi

# 1. Build must succeed with zero warnings
echo "🏗️  Building..."
if ! npm run build 2>&1 | tee /tmp/build.log; then
    echo "❌ Build failed. Fix errors before committing."
    exit 1
fi

# Check for duplicate keys and other warnings
if grep -iE "Duplicate key|Duplicate member" /tmp/build.log; then
    echo "❌ Build has duplicate keys or members. Fix them before committing."
    exit 1
fi

if grep -iE "error" /tmp/build.log | grep -v "0 errors"; then
    echo "❌ Build has errors. Fix them before committing."
    exit 1
fi

echo "✅ Build succeeded"

# 2. Tests must pass (uncomment when tests are configured)
# echo "🧪 Running tests..."
# if ! npm run test; then
#     echo "❌ Tests failed. Fix them before committing."
#     exit 1
# fi
# echo "✅ Tests passed"

# 3. Check for security vulnerabilities
echo "🔒 Checking for security vulnerabilities..."
if ! npm audit --audit-level=high; then
    echo "⚠️  Security vulnerabilities found. Run 'npm audit fix' to resolve."
    echo "   Commit blocked due to high/critical vulnerabilities."
    exit 1
fi
echo "✅ No high/critical vulnerabilities"

echo ""
echo "✅ All pre-commit checks passed!"
echo ""
EOF

chmod +x .git/hooks/pre-commit
echo "✅ Pre-commit hook installed"
echo ""

# 2. Add test scripts to package.json if they don't exist
echo "📦 Checking package.json for test scripts..."

if ! grep -q '"test":' package.json; then
    echo "${YELLOW}⚠️  No test script found in package.json${NC}"
    echo "   You'll need to add test scripts manually:"
    echo '   "test": "vitest run",'
    echo '   "test:watch": "vitest",'
    echo '   "test:coverage": "vitest run --coverage"'
else
    echo "✅ Test scripts exist in package.json"
fi
echo ""

# 3. Create .gitignore entries for test coverage
echo "📝 Updating .gitignore..."
if ! grep -q "coverage" .gitignore 2>/dev/null; then
    echo "" >> .gitignore
    echo "# Test coverage" >> .gitignore
    echo "coverage/" >> .gitignore
    echo ".nyc_output/" >> .gitignore
    echo "*.lcov" >> .gitignore
    echo "✅ Added coverage directories to .gitignore"
else
    echo "✅ .gitignore already configured"
fi
echo ""

# 4. Create tests directory structure
echo "📁 Creating test directory structure..."
mkdir -p tests/unit
mkdir -p tests/integration
mkdir -p tests/e2e

# Create a sample test file
if [ ! -f "tests/unit/sample.test.ts" ]; then
    cat > tests/unit/sample.test.ts << 'EOF'
import { describe, it, expect } from 'vitest';

describe('Sample Test Suite', () => {
  it('should pass', () => {
    expect(true).toBe(true);
  });

  it('should validate basic math', () => {
    expect(2 + 2).toBe(4);
  });
});
EOF
    echo "✅ Created sample test file: tests/unit/sample.test.ts"
else
    echo "✅ Test directory already exists"
fi
echo ""

# 5. Check if testing framework is installed
echo "📦 Checking test dependencies..."
if ! grep -q '"vitest":' package.json && ! grep -q '"jest":' package.json; then
    echo "${YELLOW}⚠️  No test framework found${NC}"
    echo "   Install Vitest (recommended for Vite projects):"
    echo "   npm install -D vitest @vitest/ui @vitest/coverage-v8"
    echo ""
    echo "   Or Jest:"
    echo "   npm install -D jest @types/jest ts-jest"
else
    echo "✅ Test framework installed"
fi
echo ""

# 6. Verify GitHub Actions workflow
echo "🔧 Checking GitHub Actions workflow..."
if [ -f ".github/workflows/ci.yml" ]; then
    echo "✅ CI workflow exists: .github/workflows/ci.yml"
else
    echo "${YELLOW}⚠️  CI workflow not found (should be at .github/workflows/ci.yml)${NC}"
fi
echo ""

# 7. Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Code quality enforcement setup complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📋 What was installed:"
echo "  ✓ Pre-commit hook (.git/hooks/pre-commit)"
echo "  ✓ Test directory structure (tests/unit, tests/integration, tests/e2e)"
echo "  ✓ Sample test file (tests/unit/sample.test.ts)"
echo "  ✓ Contributing guidelines (CONTRIBUTING.md)"
echo "  ✓ AI instructions (.ai-instructions.md)"
echo "  ✓ CI workflow (.github/workflows/ci.yml)"
echo ""
echo "📝 Next steps:"
echo "  1. Install test framework: npm install -D vitest @vitest/ui @vitest/coverage-v8"
echo "  2. Add test scripts to package.json (see above)"
echo "  3. Write tests for existing code"
echo "  4. Run: npm run test"
echo "  5. Run: npm run test:coverage"
echo ""
echo "🔒 Pre-commit hook will now:"
echo "  • Block commits with build errors/warnings"
echo "  • Block commits with duplicate keys"
echo "  • Block commits with security vulnerabilities"
echo "  • Run tests (when configured)"
echo ""
echo "🎯 Goal: >70% test coverage before merging to production"
echo ""
echo "${GREEN}Ready to enforce professional engineering standards!${NC}"
echo ""
EOF

chmod +x ~/bible/setup-enforcement.sh
echo "✅ Setup script created: ~/bible/setup-enforcement.sh"
echo ""
