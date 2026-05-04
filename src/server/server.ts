import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import { buildRegistry, type ToolDeps } from "./registry.js";

export interface ServerOptions {
  deps: ToolDeps;
  name: string;
  version: string;
}

export function createServer(opts: ServerOptions): Server {
  const tools = buildRegistry(opts.deps);
  const byName = new Map(tools.map((tool) => [tool.name, tool]));

  const server = new Server(
    { name: opts.name, version: opts.version },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = byName.get(request.params.name);
    if (!tool) {
      throw new Error(`unknown tool: ${request.params.name}`);
    }
    return await tool.handler(request.params.arguments);
  });

  return server;
}
