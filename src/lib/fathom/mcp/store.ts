// File-backed persistence for the Fathom MCP OAuth session: the dynamically
// registered client, the PKCE code verifier, and the issued tokens. Written to
// a gitignored JSON file in the project root (à la mcp-remote's ~/.mcp-auth).
import { readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import type {
  OAuthClientInformationFull,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";

export interface FathomAuthState {
  clientInformation?: OAuthClientInformationFull;
  tokens?: OAuthTokens;
  codeVerifier?: string;
}

const STORE_PATH = resolve(
  process.cwd(),
  process.env.FATHOM_MCP_AUTH_FILE ?? ".fathom-auth.json",
);

export function readAuthState(): FathomAuthState {
  if (!existsSync(STORE_PATH)) return {};
  try {
    return JSON.parse(readFileSync(STORE_PATH, "utf8")) as FathomAuthState;
  } catch {
    return {};
  }
}

export function writeAuthState(patch: Partial<FathomAuthState>): void {
  const next = { ...readAuthState(), ...patch };
  writeFileSync(STORE_PATH, JSON.stringify(next, null, 2), { mode: 0o600 });
}

export function clearAuthState(scope: "all" | "tokens" | "verifier" | "client") {
  if (scope === "all") {
    rmSync(STORE_PATH, { force: true });
    return;
  }
  const state = readAuthState();
  if (scope === "tokens") delete state.tokens;
  if (scope === "verifier") delete state.codeVerifier;
  if (scope === "client") delete state.clientInformation;
  writeFileSync(STORE_PATH, JSON.stringify(state, null, 2), { mode: 0o600 });
}

export function hasTokens(): boolean {
  return Boolean(readAuthState().tokens?.access_token);
}
