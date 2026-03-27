// Jest global setup - runs before each test file
// Ensure test environment variables are set
process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only'
process.env.UPLOAD_DIR = '/tmp/childbook-test-uploads'
process.env.PORT = '3002' // Different port for tests

// Suppress console.log in tests (keep errors)
global.console.log = jest.fn()
global.console.info = jest.fn()
global.console.debug = jest.fn()

// Create upload dir for tests
const fs = require('fs')
if (!fs.existsSync('/tmp/childbook-test-uploads')) {
  fs.mkdirSync('/tmp/childbook-test-uploads', { recursive: true })
}
