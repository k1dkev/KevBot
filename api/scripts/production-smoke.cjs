const assert = require("node:assert/strict");
const path = require("node:path");
const { GenericContainer, Network, Wait } = require("testcontainers");

// Only disposable dependencies and synthetic credentials; never reads a developer's env file.
async function main() {
  const network = await new Network().start();
  const containers = [];
  try {
    const mysql = await new GenericContainer("mysql:8.0.30")
      .withNetwork(network)
      .withNetworkAliases("production-smoke-db")
      .withEnvironment({ MYSQL_ROOT_PASSWORD: "smoke-only", MYSQL_DATABASE: "smoke", MYSQL_ROOT_HOST: "%" })
      .withWaitStrategy(Wait.forLogMessage(/ready for connections.*port: 3306/))
      .withStartupTimeout(120_000)
      .start();
    containers.push(mysql);

    const connection = "mysql://root:smoke-only@production-smoke-db:3306/smoke";
    const scripts = path.resolve(__dirname, "../../db/migration");
    const migration = await new GenericContainer("migration-manager:latest")
      .withNetwork(network)
      .withEnvironment({ DB_CONNECTION_STRING: connection })
      .withCopyDirectoriesToContainer([
        { source: `${scripts}/baseline`, target: "/app/migration/baseline" },
        { source: `${scripts}/migrations`, target: "/app/migration/migrations" },
      ])
      .withCommand(["migrate", "migration"])
      .withWaitStrategy(Wait.forOneShotStartup())
      .withStartupTimeout(120_000)
      .start();
    containers.push(migration);

    const api = await new GenericContainer(process.env.API_PRODUCTION_IMAGE || "kevbot_api_production:smoke")
      .withNetwork(network)
      .withEnvironment({
        DB_CONNECTION_STRING: connection,
        GCP_API_ENDPOINT: "http://127.0.0.1:4443",
        GCP_TRACKS_BUCKET_NAME: "smoke-only",
        KEVBOT_API_ADDRESS: "0.0.0.0",
        KEVBOT_API_PORT: "3000",
        KEVBOT_API_JWT_SECRET: "synthetic-smoke-secret",
        BOT_AUTH_API_KEY: "synthetic-smoke-key",
        DISCORD_OAUTH2_CLIENT_ID: "smoke-only",
        DISCORD_OAUTH2_CLIENT_SECRET: "smoke-only",
        DISCORD_OAUTH2_REDIRECT_URI: "http://localhost/callback",
      })
      .withExposedPorts(3000)
      .withWaitStrategy(Wait.forHttp("/v1/docs/", 3000))
      .withStartupTimeout(60_000)
      .start();
    containers.push(api);

    const ffmpeg = await api.exec(["ffmpeg", "-version"]);
    assert.equal(ffmpeg.exitCode, 0, ffmpeg.output);
    const probe = await api.exec(["node", "-e", `
      const assert = require('node:assert/strict');
      const fs = require('node:fs');
      (async () => {
        assert.equal(process.env.NODE_ENV, 'production');
        for (const file of ['dist/server.js', 'dist/docs/openapi.yml']) assert.ok(fs.existsSync(file), file);
        for (const file of ['src', 'tests', 'scripts', '.env', 'local_dev.env', 'dist/stale-build-marker']) {
          assert.ok(!fs.existsSync(file), 'Unexpected runtime artifact: ' + file);
        }
        assert.throws(() => require.resolve('typescript'), { code: 'MODULE_NOT_FOUND' });
        for (const asset of ['swagger-ui.css', 'swagger-ui-bundle.js', 'swagger-ui-init.js']) {
          const response = await fetch('http://127.0.0.1:3000/v1/docs/' + asset);
          assert.equal(response.status, 200, asset);
          const text = await response.text();
          assert.ok(text.length > 100, asset);
          if (asset === 'swagger-ui-init.js') assert.ok(text.includes('openapi'), 'Missing embedded spec');
        }
        const response = await fetch('http://127.0.0.1:3000/v1/users');
        assert.equal(response.status, 200);
        const users = await response.json();
        assert.ok(Array.isArray(users), 'Expected a database-backed users response');
      })().catch(error => { console.error(error); process.exit(1); });
    `]);
    assert.equal(probe.exitCode, 0, probe.output);
    console.log("Production image smoke passed: startup, migrated MySQL, Swagger assets, FFmpeg, runtime-only files.");
  } finally {
    await Promise.all(containers.reverse().map(container => container.stop()));
    await network.stop();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
