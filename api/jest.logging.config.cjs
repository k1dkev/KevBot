module.exports = {
  ...require("./jest.config.js"),
  setupFilesAfterEnv: [],
  testMatch: ["**/tests/logging/**/*.test.ts"],
  testPathIgnorePatterns: ["/node_modules/"],
};
