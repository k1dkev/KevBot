const { copyFileSync, mkdirSync } = require("node:fs");
const path = require("node:path");

const docsDirectory = path.join(__dirname, "../dist/docs");
mkdirSync(docsDirectory, { recursive: true });
copyFileSync(path.join(__dirname, "../src/docs/openapi.yml"), path.join(docsDirectory, "openapi.yml"));
