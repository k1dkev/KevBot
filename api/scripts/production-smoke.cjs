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
      // Inject the checked-in test probe only for this run; it is not shipped in the production image.
      .withCopyFilesToContainer([
        { source: path.join(__dirname, "production-probe.cjs"), target: "/tmp/production-probe.cjs" },
      ])
      .withExposedPorts(3000)
      .withWaitStrategy(Wait.forHttp("/v1/docs/", 3000))
      .withStartupTimeout(60_000)
      .start();
    containers.push(api);

    const probe = await api.exec(["node", "/tmp/production-probe.cjs"]);
    assert.equal(probe.exitCode, 0, probe.output);
    console.log("Production image smoke passed: startup, migrated MySQL, Swagger assets, FFmpeg, runtime-only files.");
  } finally {
    await Promise.all(containers.reverse().map((container) => container.stop()));
    await network.stop();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
