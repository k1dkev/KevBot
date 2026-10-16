/** @type {import('ts-jest').JestConfigWithTsJest} **/
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  setupFilesAfterEnv: ["./tests/setupTestContainers.ts"],
  testMatch: ["**/tests/**/*.test.ts", "**/tests/**/*.spec.ts"],
  testPathIgnorePatterns: ["/node_modules/", "/tests/logging/"],
  transform: {
    "^.+.tsx?$": ["ts-jest", { tsconfig: "tests/tsconfig.json" }],
  },
  maxWorkers: 2,
  globals: {
    NODE_ENV: "test",
  },
};
