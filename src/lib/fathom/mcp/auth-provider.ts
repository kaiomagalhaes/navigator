// OAuthClientProvider for the Fathom MCP server, backed by the file store.
// Fathom's MCP only supports the authorization_code grant (PKCE, public
// client), so the access token must be minted via a one-time browser flow
// (`npm run fathom:auth`). After that, the sync reuses the stored token.
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformationFull,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import {
  readAuthState,
  writeAuthState,
  clearAuthState,
} from "./store";

export const FATHOM_MCP_URL =
  process.env.FATHOM_MCP_URL ?? "https://api.fathom.ai/mcp";
export const CALLBACK_PORT = Number(
  process.env.FATHOM_MCP_CALLBACK_PORT ?? "8765",
);
export const CALLBACK_URL = `http://localhost:${CALLBACK_PORT}/callback`;

/** Thrown when the sync needs a token but none is stored / it has expired. */
export class FathomAuthRequiredError extends Error {
  constructor() {
    super(
      "Fathom MCP is not authorized. Run `npm run fathom:auth` to sign in once.",
    );
    this.name = "FathomAuthRequiredError";
  }
}

export interface ProviderOptions {
  /**
   * How to handle the authorization redirect. The interactive auth CLI opens a
   * browser; the non-interactive sync throws FathomAuthRequiredError.
   */
  onRedirect?: (url: URL) => void | Promise<void>;
}

export class FathomOAuthProvider implements OAuthClientProvider {
  constructor(private readonly options: ProviderOptions = {}) {}

  get redirectUrl(): string {
    return CALLBACK_URL;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: "Navigator (Fathom sync)",
      redirect_uris: [CALLBACK_URL],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: "mcp",
    };
  }

  clientInformation(): OAuthClientInformationFull | undefined {
    return readAuthState().clientInformation;
  }

  saveClientInformation(info: OAuthClientInformationFull): void {
    writeAuthState({ clientInformation: info });
  }

  tokens(): OAuthTokens | undefined {
    return readAuthState().tokens;
  }

  saveTokens(tokens: OAuthTokens): void {
    writeAuthState({ tokens });
  }

  saveCodeVerifier(codeVerifier: string): void {
    writeAuthState({ codeVerifier });
  }

  codeVerifier(): string {
    const verifier = readAuthState().codeVerifier;
    if (!verifier) throw new Error("Missing PKCE code verifier in auth store.");
    return verifier;
  }

  async redirectToAuthorization(url: URL): Promise<void> {
    if (this.options.onRedirect) {
      await this.options.onRedirect(url);
      return;
    }
    throw new FathomAuthRequiredError();
  }

  invalidateCredentials(scope: "all" | "client" | "tokens" | "verifier"): void {
    clearAuthState(scope);
  }
}
