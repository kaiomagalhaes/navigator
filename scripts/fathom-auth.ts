// One-time interactive OAuth for the Fathom MCP server: `npm run fathom:auth`.
// Opens the browser to Fathom's consent page, captures the authorization code on
// a localhost callback, exchanges it for tokens, and caches them for the sync.
import "dotenv/config";
import { createServer } from "node:http";
import { exec } from "node:child_process";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { createSession, callTool, textOf } from "@/lib/fathom/mcp/client";
import { CALLBACK_PORT } from "@/lib/fathom/mcp/auth-provider";

function openBrowser(url: string) {
  const cmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";
  exec(`${cmd} "${url}"`);
}

/** Start the loopback server and resolve with the `code` it receives. */
function waitForCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://localhost:${CALLBACK_PORT}`);
      if (url.pathname !== "/callback") {
        res.writeHead(404).end();
        return;
      }
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");
      res.writeHead(200, { "content-type": "text/html" });
      res.end(
        `<html><body style="font-family:system-ui;padding:40px">
         <h2>${code ? "Fathom connected ✓" : "Authorization failed"}</h2>
         <p>You can close this tab and return to the terminal.</p>
         </body></html>`,
      );
      server.close();
      if (code) resolve(code);
      else reject(new Error(`Authorization failed: ${error ?? "no code"}`));
    });
    server.on("error", reject);
    server.listen(CALLBACK_PORT);
  });
}

async function main() {
  console.log("[auth] starting Fathom MCP authorization…");

  const codePromise = waitForCode();

  // First connect triggers discovery + dynamic registration + redirect.
  const auth = createSession({
    onRedirect: (url) => {
      console.log("[auth] opening browser to authorize:\n" + url.toString());
      openBrowser(url.toString());
    },
  });

  try {
    await auth.client.connect(auth.transport);
  } catch (err) {
    if (!(err instanceof UnauthorizedError)) throw err;
    // expected: we now wait for the user to approve in the browser
  }

  const code = await codePromise;
  console.log("[auth] received authorization code, exchanging for tokens…");
  await auth.transport.finishAuth(code);
  await auth.client.close().catch(() => {});

  // Reconnect with the freshly stored tokens and confirm identity.
  const verify = createSession();
  await verify.client.connect(verify.transport);
  const identity = await callTool(verify.client, "get_identity");
  console.log("[auth] success — authorized as:", textOf(identity).trim());
  await verify.client.close();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[auth] failed:", err);
    process.exit(1);
  });
