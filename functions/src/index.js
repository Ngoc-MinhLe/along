const { authHealth } = require('./health')

// Phase 6C.1 exposes only a read-only authentication boundary check.
// Trusted RBAC mutation functions are intentionally not registered here.
exports.authHealth = authHealth
