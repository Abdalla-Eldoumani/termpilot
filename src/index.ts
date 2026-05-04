#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { parseConfig } from "./config/env.js";
import { SessionManager } from "./pty/manager.js";
import { closeAudit, configureAudit } from "./security/audit.js";
import { createServer } from "./server/server.js";
import { newSessionId } from "./util/ids.js";
import * as logger from "./util/logger.js";

const SERVER_NAME = "termpilot";
const SERVER_VERSION = "0.1.0-alpha.0";

async function main(): Promise<void> {
  const config = parseConfig();
  logger.setLevel(config.logLevel);
  configureAudit(config.auditLog);

  const manager = new SessionManager(config, newSessionId);
  manager.start();

  const server = createServer({
    deps: { config, manager },
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("shutting down", { signal });
    manager.stop();
    try {
      await manager.closeAll();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn("error closing sessions", { message });
    }
    try {
      await closeAudit();
    } catch {
      // best-effort
    }
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("termpilot ready", {
    name: SERVER_NAME,
    version: SERVER_VERSION,
    policy: config.policy,
    workspaceRoot: config.workspaceRoot,
  });
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  logger.error("fatal startup error", { message });
  process.exit(1);
});
