// Runs before any test file's own imports are evaluated (via vitest's
// `setupFiles`), which matters: ES module `import` statements are hoisted
// above ordinary statements within a single file, so setting process.env at
// the top of a test file does NOT run before that file's own imports read
// config from the environment. A separate setup file sidesteps that.
process.env.DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
