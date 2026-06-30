// Connects to the Fathom MCP server over streamable HTTP using stored OAuth
// credentials, and exposes thin helpers for the tools the sync needs.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  FathomOAuthProvider,
  FATHOM_MCP_URL,
  type ProviderOptions,
} from "./auth-provider";

export interface FathomMcpSession {
  client: Client;
  transport: StreamableHTTPClientTransport;
  close: () => Promise<void>;
}

export function createSession(
  providerOptions: ProviderOptions = {},
): { client: Client; transport: StreamableHTTPClientTransport } {
  const authProvider = new FathomOAuthProvider(providerOptions);
  const transport = new StreamableHTTPClientTransport(new URL(FATHOM_MCP_URL), {
    authProvider,
  });
  const client = new Client(
    { name: "navigator", version: "0.1.0" },
    { capabilities: {} },
  );
  return { client, transport };
}

/** Connect using already-stored tokens (non-interactive). Throws if not authed. */
export async function connectForSync(): Promise<FathomMcpSession> {
  const { client, transport } = createSession();
  await client.connect(transport);
  return {
    client,
    transport,
    close: async () => {
      await client.close();
    },
  };
}

/** Call a tool and return its raw result (content + structuredContent). */
export async function callTool(
  client: Client,
  name: string,
  args: Record<string, unknown> = {},
) {
  return client.callTool({ name, arguments: args });
}

/** Concatenate the text blocks of a tool result. */
export function textOf(result: unknown): string {
  const content = (result as { content?: unknown })?.content;
  if (!Array.isArray(content)) return "";
  return content
    .filter(
      (c): c is { type: string; text: string } =>
        typeof c?.text === "string" && c?.type === "text",
    )
    .map((c) => c.text)
    .join("\n");
}
