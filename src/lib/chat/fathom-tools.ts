// Bridges the Fathom MCP tools into AI SDK tools so the chat model can call
// them. Opens one MCP session (using the cached OAuth token) and exposes every
// read-only Fathom tool; the caller must close the session when the stream ends.
import { jsonSchema, tool, type ToolSet } from "ai";
import { connectForSync, textOf } from "@/lib/fathom/mcp/client";

export async function createFathomTools(): Promise<{
  tools: ToolSet;
  close: () => Promise<void>;
}> {
  const session = await connectForSync();

  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    try {
      await session.close();
    } catch {
      // best-effort: the stream is already done
    }
  };

  const { tools: mcpTools } = await session.client.listTools();
  const tools: ToolSet = {};

  for (const t of mcpTools) {
    tools[t.name] = tool({
      description: t.description ?? t.name,
      inputSchema: jsonSchema(
        (t.inputSchema ?? { type: "object", properties: {} }) as Record<
          string,
          unknown
        >,
      ),
      execute: async (args) => {
        const res = await session.client.callTool({
          name: t.name,
          arguments: (args ?? {}) as Record<string, unknown>,
        });
        return textOf(res);
      },
    });
  }

  return { tools, close };
}
