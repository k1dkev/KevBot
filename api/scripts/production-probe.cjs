const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");

// Runs inside the production container, with /api as its working directory.
async function main() {
  assert.equal(process.env.NODE_ENV, "production");
  for (const file of ["dist/server.js", "dist/docs/openapi.yml"]) assert.ok(fs.existsSync(file), file);
  for (const file of ["src", "tests", "scripts", ".env", "local_dev.env", "dist/stale-build-marker"]) {
    assert.ok(!fs.existsSync(file), "Unexpected runtime artifact: " + file);
  }
  // This probe lives in /tmp, so resolve dependencies from the app rather than the probe's location.
  assert.throws(() => require.resolve("typescript", { paths: [process.cwd()] }), { code: "MODULE_NOT_FOUND" });
  execFileSync("ffmpeg", ["-version"], { stdio: "pipe" });

  for (const asset of ["swagger-ui.css", "swagger-ui-bundle.js", "swagger-ui-init.js"]) {
    const response = await fetch("http://127.0.0.1:3000/v1/docs/" + asset);
    assert.equal(response.status, 200, asset);
    const text = await response.text();
    assert.ok(text.length > 100, asset);
    if (asset === "swagger-ui-init.js") assert.ok(text.includes("openapi"), "Missing embedded spec");
  }
  const response = await fetch("http://127.0.0.1:3000/v1/users");
  assert.equal(response.status, 200);
  const users = await response.json();
  assert.ok(Array.isArray(users), "Expected a database-backed users response");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
