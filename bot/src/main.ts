import { ConfigError, readConfig } from "./config.js";
import { renderHelp } from "./commands.js";
import { createLogger } from "./logging.js";

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    // Intentional offline CLI output: no config, Discord client, API call or login.
    console.log(renderHelp("kb"));
    return;
  }
  if (args.length && !(args.length === 1 && args[0] === "--check-config")) {
    console.error("Usage: npm start -- [--help|--check-config]");
    process.exitCode = 1;
    return;
  }
  let config;
  try {
    config = readConfig();
  } catch (error) {
    console.error(
      error instanceof ConfigError
        ? `Invalid bot configuration fields: ${error.fields.join(", ")}`
        : "Invalid bot configuration",
    );
    process.exitCode = 1;
    return;
  }
  if (args[0] === "--check-config") {
    console.log("Bot configuration is valid; no login attempted.");
    return;
  }
  const log = createLogger(config);
  const shutdown = new AbortController();
  const removeSignals = () => {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
  };
  const stop = () => {
    shutdown.abort();
    removeSignals();
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  try {
    const { startGateway } = await import("./gateway.js");
    await startGateway(config, log, {
      signal: shutdown.signal,
      onFatal: () => {
        process.exitCode = 1;
        removeSignals();
      },
    });
  } catch {
    removeSignals();
    if (shutdown.signal.aborted) return;
    log.error({ component: "startup", reason: "gateway_start_failed" }, "bot.start.failed");
    process.exitCode = 1;
  }
}

void main();
