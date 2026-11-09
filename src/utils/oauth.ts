import crypto from "crypto";
import http from "http";
import net from "net";
import chalk from "chalk";
import open from "open";
import { confirm } from "@inquirer/prompts";
import { isAxiosError } from "axios";
import { SnaptradeOAuthDevice } from "snaptrade-typescript-sdk";
import { createRequire } from "module";
import { getProfile, saveProfile, type ProfileData } from "./settings.ts";

const require = createRequire(import.meta.url);
const oauthConstants = require("./oauthConstants.cjs") as {
  OAUTH_CLIENT_ID: string;
  OAUTH_SDK_PLACEHOLDER_CREDENTIAL: string;
};
export const { OAUTH_CLIENT_ID, OAUTH_SDK_PLACEHOLDER_CREDENTIAL } =
  oauthConstants;
const OAUTH_REDIRECT_HOST = "127.0.0.1";
const OAUTH_REDIRECT_PORT = Number(
  process.env.SNAPTRADE_OAUTH_REDIRECT_PORT ?? 36987,
);
const OAUTH_REDIRECT_PATH = "/oauth/callback";
const OAUTH_REDIRECT_URI = `http://${OAUTH_REDIRECT_HOST}:${OAUTH_REDIRECT_PORT}${OAUTH_REDIRECT_PATH}`;
const OAUTH_SCOPE = "openid profile email read trade";
const OAUTH_EXPIRY_SKEW_MS = 60_000;

type OAuthMetadata = {
  authorization_endpoint: string;
  token_endpoint: string;
  revocation_endpoint?: string;
};

type OAuthTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  sub?:
    | string
    | {
        email?: string;
        snaptrade_user_id?: string;
      };
};

function base64Url(input: Buffer): string {
  return input
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function oauthIssuerFromBasePath(basePath?: string): string {
  if (!basePath) return "https://api.snaptrade.com";
  const url = new URL(basePath);
  url.pathname = url.pathname.replace(/\/api\/v1\/?$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

async function getOAuthMetadata(profile: ProfileData): Promise<OAuthMetadata> {
  const issuer = oauthIssuerFromBasePath(profile.basePath);
  const response = await fetch(
    `${issuer}/.well-known/oauth-authorization-server`,
    {
      headers: { Accept: "application/json" },
    },
  );
  if (!response.ok) {
    throw new Error(
      `Failed to fetch SnapTrade OAuth metadata: ${response.status} ${await response.text()}`,
    );
  }
  return response.json() as Promise<OAuthMetadata>;
}

function expiresAt(expiresIn?: number): string {
  const seconds = expiresIn ?? 36_000;
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function hasUsableAccessToken(profile: ProfileData): boolean {
  if (!profile.oauthAccessToken) return false;
  if (!profile.oauthExpiresAt) return true;
  return (
    new Date(profile.oauthExpiresAt).getTime() >
    Date.now() + OAUTH_EXPIRY_SKEW_MS
  );
}

function subjectFromToken(token: OAuthTokenResponse): string | undefined {
  if (typeof token.sub === "string") return token.sub;
  if (token.sub && typeof token.sub.snaptrade_user_id === "string") {
    return token.sub.snaptrade_user_id;
  }
  return undefined;
}

function emailFromToken(token: OAuthTokenResponse): string | undefined {
  if (token.sub && typeof token.sub !== "string") {
    return token.sub.email;
  }
  return undefined;
}

function saveOAuthLogin(
  token: OAuthTokenResponse,
  flow: "browser" | "device",
  clientId: string,
) {
  saveProfile({
    accountType: "personal",
    authMode: "oauth",
    oauthFlow: flow,
    oauthClientId: clientId,
    clientId: undefined,
    consumerKey: undefined,
    userId: undefined,
    userSecret: undefined,
    lastAccountId: undefined,
    oauthAccessToken: token.access_token,
    oauthRefreshToken: token.refresh_token,
    oauthExpiresAt: expiresAt(token.expires_in),
    // Record only the scopes confirmed by the server.
    oauthScope: token.scope,
    oauthSubject: subjectFromToken(token),
    oauthEmail: emailFromToken(token),
  });
}

export async function loginWithDeviceOAuth(): Promise<void> {
  const profile = getProfile();
  const clientId =
    process.env.SNAPTRADE_OAUTH_DEVICE_CLIENT_ID?.trim() ||
    (profile.oauthFlow === "device" ? profile.oauthClientId : undefined);
  if (!clientId) {
    throw new Error(
      "Set SNAPTRADE_OAUTH_DEVICE_CLIENT_ID to a pre-registered public Device Code client's ID. The browser CLI client only supports authorization-code grants.",
    );
  }
  const oauth = new SnaptradeOAuthDevice({
    issuer: oauthIssuerFromBasePath(profile.basePath),
  });
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.once("SIGINT", cancel);

  try {
    const authorization = await oauth.startDeviceAuthorization({
      clientId,
      signal: controller.signal,
    });
    console.log(`\nOpen ${authorization.verificationUri} in any browser.`);
    console.log(`Enter code: ${chalk.bold(authorization.userCode)}`);
    console.log(
      "Waiting for approval. Device login provides read-only access. Press Ctrl+C to cancel.\n",
    );

    const token = await oauth.waitForDeviceToken({
      clientId,
      authorization,
      signal: controller.signal,
    });
    saveOAuthLogin(
      {
        access_token: token.accessToken,
        refresh_token: token.refreshToken,
        expires_in: token.expiresIn,
        scope: token.scope,
      },
      "device",
      clientId,
    );
    console.log(chalk.green("SnapTrade device login complete.\n"));
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("SnapTrade device login cancelled.");
    }
    if (isAxiosError(error)) {
      const code = error.response?.data?.error;
      if (code === "access_denied") {
        throw new Error("SnapTrade device authorization was denied.");
      }
      if (code === "expired_token" || code === "device_not_found") {
        throw new Error(
          "SnapTrade device code expired. Run `snaptrade login --use-device-code` to try again.",
        );
      }
      if (code === "unauthorized_client" || code === "invalid_client") {
        throw new Error(
          "SnapTrade rejected the device client. SNAPTRADE_OAUTH_DEVICE_CLIENT_ID must identify a public client registered for the Device Code grant.",
        );
      }
    }
    // Axios errors contain the private device code in their request config.
    throw new Error(
      error instanceof Error ? error.message : "SnapTrade device login failed.",
    );
  } finally {
    process.removeListener("SIGINT", cancel);
  }
}

async function exchangeToken(
  tokenEndpoint: string,
  body: URLSearchParams,
  clientId: string,
): Promise<OAuthTokenResponse> {
  body.set("client_id", clientId);
  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });

  if (!response.ok) {
    throw new Error(
      `SnapTrade OAuth token request failed: ${response.status} ${await response.text()}`,
    );
  }

  return response.json() as Promise<OAuthTokenResponse>;
}

async function revokeOAuthToken(
  revocationEndpoint: string,
  token: string,
  tokenTypeHint: "access_token" | "refresh_token",
  clientId: string,
): Promise<void> {
  const body = new URLSearchParams({
    token,
    token_type_hint: tokenTypeHint,
    client_id: clientId,
  });
  const response = await fetch(revocationEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });

  if (!response.ok) {
    throw new Error(
      `SnapTrade OAuth token revocation failed: ${response.status} ${await response.text()}`,
    );
  }
}

async function waitForOAuthCallback(
  expectedState: string,
): Promise<{ code: string }> {
  return new Promise((resolve, reject) => {
    const sockets = new Set<net.Socket>();
    const timeout = setTimeout(
      () => {
        closeServer();
        reject(
          new Error("Timed out waiting for the SnapTrade OAuth callback."),
        );
      },
      5 * 60 * 1000,
    );

    const closeServer = () => {
      server.close();
      server.closeIdleConnections?.();
      server.closeAllConnections?.();
      for (const socket of sockets) {
        socket.destroy();
      }
      sockets.clear();
    };

    const finish = (error: Error | null, code?: string) => {
      clearTimeout(timeout);
      closeServer();
      if (error) {
        reject(error);
      } else {
        resolve({ code: code! });
      }
    };

    const server = http.createServer((req, res) => {
      const requestUrl = new URL(req.url ?? "/", OAUTH_REDIRECT_URI);
      if (requestUrl.pathname !== OAUTH_REDIRECT_PATH) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not found");
        return;
      }

      const error = requestUrl.searchParams.get("error");
      const state = requestUrl.searchParams.get("state");
      const code = requestUrl.searchParams.get("code");
      if (error) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(
          "<h1>SnapTrade authorization failed</h1><p>You can close this tab.</p>",
          () =>
            finish(new Error(`SnapTrade OAuth authorization failed: ${error}`)),
        );
        return;
      }
      if (!code || state !== expectedState) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(
          "<h1>Invalid SnapTrade OAuth callback</h1><p>You can close this tab.</p>",
          () => finish(new Error("Invalid SnapTrade OAuth callback.")),
        );
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(
        "<h1>SnapTrade CLI is connected</h1><p>You can close this tab.</p>",
        () => finish(null, code),
      );
    });

    server.on("connection", (socket) => {
      sockets.add(socket);
      socket.on("close", () => sockets.delete(socket));
    });

    server.on("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timeout);
      if (error.code === "EADDRINUSE") {
        reject(
          new Error(
            `OAuth callback port ${OAUTH_REDIRECT_PORT} is already in use. Free that port and try again.`,
          ),
        );
        return;
      }
      reject(error);
    });

    server.listen(OAUTH_REDIRECT_PORT, OAUTH_REDIRECT_HOST);
  });
}

export async function loginWithOAuth(): Promise<void> {
  const profile = getProfile();
  const metadata = await getOAuthMetadata(profile);
  const state = base64Url(crypto.randomBytes(32));
  const codeVerifier = base64Url(crypto.randomBytes(64));
  const codeChallenge = base64Url(
    crypto.createHash("sha256").update(codeVerifier).digest(),
  );

  const authorizeUrl = new URL(metadata.authorization_endpoint);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", OAUTH_CLIENT_ID);
  authorizeUrl.searchParams.set("redirect_uri", OAUTH_REDIRECT_URI);
  authorizeUrl.searchParams.set("scope", OAUTH_SCOPE);
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("code_challenge", codeChallenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");

  const callback = waitForOAuthCallback(state);
  console.log(chalk.cyan("\nOpening SnapTrade OAuth in your browser...\n"));
  await open(authorizeUrl.toString());

  const { code } = await callback;
  const token = await exchangeToken(
    metadata.token_endpoint,
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      code_verifier: codeVerifier,
      redirect_uri: OAUTH_REDIRECT_URI,
    }),
    OAUTH_CLIENT_ID,
  );

  saveOAuthLogin(token, "browser", OAUTH_CLIENT_ID);
  console.log(chalk.green("SnapTrade OAuth login complete.\n"));
  if (!token.scope?.split(/\s+/).includes("trade")) {
    console.warn(
      chalk.yellow(
        "SnapTrade did not confirm the trade scope for this OAuth app. Trading commands remain unavailable.",
      ),
    );
  }
}

export async function revokeOAuthTokensForProfile(
  profile: ProfileData,
): Promise<void> {
  if (profile.authMode !== "oauth") return;
  if (!profile.oauthAccessToken && !profile.oauthRefreshToken) return;

  const metadata = await getOAuthMetadata(profile);
  if (!metadata.revocation_endpoint) {
    throw new Error(
      "SnapTrade OAuth metadata did not include a revocation endpoint.",
    );
  }

  if (profile.oauthRefreshToken) {
    await revokeOAuthToken(
      metadata.revocation_endpoint,
      profile.oauthRefreshToken,
      "refresh_token",
      profile.oauthClientId ?? OAUTH_CLIENT_ID,
    );
  }
  if (profile.oauthAccessToken) {
    await revokeOAuthToken(
      metadata.revocation_endpoint,
      profile.oauthAccessToken,
      "access_token",
      profile.oauthClientId ?? OAUTH_CLIENT_ID,
    );
  }
}

export async function refreshOAuthToken(force = false): Promise<string | null> {
  const profile = getProfile();
  if (profile.authMode !== "oauth") return null;

  const expires = profile.oauthExpiresAt
    ? new Date(profile.oauthExpiresAt).getTime()
    : 0;
  if (
    !force &&
    profile.oauthAccessToken &&
    expires > Date.now() + OAUTH_EXPIRY_SKEW_MS
  ) {
    return profile.oauthAccessToken;
  }

  if (!profile.oauthRefreshToken) {
    return hasUsableAccessToken(profile) ? profile.oauthAccessToken! : null;
  }

  const metadata = await getOAuthMetadata(profile);
  const token = await exchangeToken(
    metadata.token_endpoint,
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: profile.oauthRefreshToken,
    }),
    profile.oauthClientId ?? OAUTH_CLIENT_ID,
  );

  saveProfile({
    accountType: "personal",
    authMode: "oauth",
    oauthAccessToken: token.access_token,
    oauthRefreshToken: token.refresh_token ?? profile.oauthRefreshToken,
    oauthExpiresAt: expiresAt(token.expires_in),
    // Refresh responses may omit scope; the existing grant still applies.
    oauthScope: token.scope ?? profile.oauthScope,
    oauthSubject: subjectFromToken(token) ?? profile.oauthSubject,
    oauthEmail: emailFromToken(token) ?? profile.oauthEmail,
  });
  return token.access_token;
}

export async function ensureOAuthLogin(
  requiredScope: "read" | "trade" = "read",
): Promise<void> {
  if (requiredScope === "trade" && getProfile().oauthFlow === "device") {
    throw new Error(
      "Device login is read-only. Run `snaptrade login` to authorize trading in your browser.",
    );
  }
  let token: string | null = null;
  try {
    token = await refreshOAuthToken();
  } catch {
    console.log(
      chalk.yellow(
        "Your SnapTrade OAuth session could not be refreshed. Please sign in again.",
      ),
    );
  }

  if (!token) {
    const shouldLogin = await confirm({
      message: "Sign in with your Personal SnapTrade account?",
      default: true,
    });
    if (!shouldLogin) {
      console.log(chalk.yellow("SnapTrade OAuth login cancelled."));
      process.exit(1);
    }
    if (getProfile().oauthFlow === "device") {
      await loginWithDeviceOAuth();
    } else {
      await loginWithOAuth();
    }
  } else if (
    requiredScope === "trade" &&
    !getProfile().oauthScope?.split(/\s+/).includes("trade")
  ) {
    console.log(
      chalk.yellow(
        "Trading requires an updated SnapTrade OAuth grant. Opening consent in your browser.",
      ),
    );
    await loginWithOAuth();
  }

  if (
    requiredScope === "trade" &&
    !getProfile().oauthScope?.split(/\s+/).includes("trade")
  ) {
    throw new Error(
      "SnapTrade OAuth did not grant trading access to this profile.",
    );
  }
}
