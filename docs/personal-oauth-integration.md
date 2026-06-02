# Integrating SnapTrade Personal OAuth

This guide describes the Personal OAuth integration pattern used by the SnapTrade CLI. It is written for apps that want users to sign in with their own Personal SnapTrade account instead of entering SnapTrade API credentials directly.

Personal OAuth is different from a Commercial SnapTrade API-key integration:

- The user signs in with SnapTrade in a browser.
- Your app receives OAuth access and refresh tokens for that Personal user.
- Your app does not create or store a SnapTrade `userId` or `userSecret`.
- API calls are authorized with a Bearer token.
- The authenticated Personal user is implied by the OAuth token.

Personal OAuth currently supports read and connection-management workflows. Trading and other write operations require SnapTrade API-key authentication, either with Personal API keys where available or Commercial API credentials.

## When To Use Personal OAuth

Use Personal OAuth when your app is intended for individual SnapTrade users who already have, or can create, a Personal SnapTrade account.

Use API-key authentication when your app needs trading or other write access. Personal API keys can support trading for Personal users, while Commercial API keys are for apps that manage SnapTrade users themselves and need server-side user registration.

## High-Level Flow

1. Register an OAuth client with SnapTrade and configure your redirect URI.
2. Discover the OAuth endpoints from SnapTrade metadata.
3. Start an authorization-code flow with PKCE.
4. Send the user to the SnapTrade authorization URL.
5. Receive the authorization callback at your redirect URI.
6. Exchange the authorization code for tokens.
7. Store the tokens securely for the signed-in app user.
8. Refresh the access token before it expires.
9. Initialize the SnapTrade SDK with `SnaptradeAuth.personalOAuth`.
10. Use normal SnapTrade APIs. The Personal user is inferred from the token.

## OAuth Discovery

Fetch SnapTrade's OAuth metadata from the API issuer:

```ts
const issuer = "https://api.snaptrade.com";
const metadata = await fetch(
  `${issuer}/.well-known/oauth-authorization-server`,
  { headers: { Accept: "application/json" } },
).then((response) => response.json());

const authorizationEndpoint = metadata.authorization_endpoint;
const tokenEndpoint = metadata.token_endpoint;
const revocationEndpoint = metadata.revocation_endpoint;
```

## Authorization Request

Use the authorization-code flow with PKCE. Generate a high-entropy `state`, a high-entropy `code_verifier`, and a SHA-256 `code_challenge`.

```ts
import crypto from "crypto";

function base64Url(input: Buffer): string {
  return input
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

const state = base64Url(crypto.randomBytes(32));
const codeVerifier = base64Url(crypto.randomBytes(64));
const codeChallenge = base64Url(
  crypto.createHash("sha256").update(codeVerifier).digest(),
);

const authorizeUrl = new URL(authorizationEndpoint);
authorizeUrl.searchParams.set("response_type", "code");
authorizeUrl.searchParams.set("client_id", SNAPTRADE_OAUTH_CLIENT_ID);
authorizeUrl.searchParams.set("redirect_uri", redirectUri);
authorizeUrl.searchParams.set("scope", "read");
authorizeUrl.searchParams.set("state", state);
authorizeUrl.searchParams.set("code_challenge", codeChallenge);
authorizeUrl.searchParams.set("code_challenge_method", "S256");
```

Redirect the user to `authorizeUrl`.

For desktop or CLI apps, the SnapTrade CLI pattern is to listen on a loopback redirect URI such as:

```text
http://127.0.0.1:36987/oauth/callback
```

For web apps, use your normal HTTPS callback route.

## Callback Handling

On the callback route:

1. Verify that the returned `state` matches the value you generated.
2. Handle an OAuth `error` response.
3. Read the authorization `code`.
4. Exchange the code at the token endpoint.

```ts
const body = new URLSearchParams({
  grant_type: "authorization_code",
  code,
  code_verifier: codeVerifier,
  redirect_uri: redirectUri,
  client_id: SNAPTRADE_OAUTH_CLIENT_ID,
});

const token = await fetch(tokenEndpoint, {
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  },
  body,
}).then(async (response) => {
  if (!response.ok) {
    throw new Error(
      `SnapTrade OAuth token request failed: ${response.status} ${await response.text()}`,
    );
  }
  return response.json();
});
```

Persist:

- `access_token`
- `refresh_token`, when returned
- computed expiry timestamp from `expires_in`
- granted `scope`
- useful subject metadata from `sub`, such as email or SnapTrade user ID when present

Store tokens encrypted or in your platform's secure credential store. Do not expose refresh tokens to browsers unless your app architecture is explicitly designed for public-client token storage.

## Refreshing Tokens

Before each SnapTrade API call, use the current access token if it has not expired. Apply a short expiry skew, such as 60 seconds, so requests do not race token expiry.

If the access token is expired and you have a refresh token, exchange it:

```ts
const body = new URLSearchParams({
  grant_type: "refresh_token",
  refresh_token: storedRefreshToken,
  client_id: SNAPTRADE_OAUTH_CLIENT_ID,
});

const token = await fetch(tokenEndpoint, {
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  },
  body,
}).then((response) => response.json());
```

Update the stored access token, expiry, scope, subject metadata, and refresh token. If the refresh response does not include a new refresh token, keep the existing refresh token.

If an API request returns `401`, force one refresh and retry the request once. If the retry also fails, send the user through OAuth login again.

## SDK Initialization

Initialize the SnapTrade SDK with Personal OAuth auth. Pass an async access-token function so the SDK can use a fresh token for each request.

```ts
import { Snaptrade, SnaptradeAuth } from "snaptrade-typescript-sdk";

const snaptrade = new Snaptrade({
  auth: SnaptradeAuth.personalOAuth({
    accessToken: async () => {
      const token = await getFreshSnapTradeAccessToken(appUserId);
      if (!token) {
        throw new Error("No SnapTrade OAuth access token is available.");
      }
      return token;
    },
  }),
  userAgent: "your-app-name/1.0.0",
});
```

With Personal OAuth, do not call `registerSnapTradeUser`, and do not store or send `userSecret`. The token already identifies the Personal SnapTrade user.

## Opening The Connection Portal

After the SDK is initialized, your app can open the Connection Portal using the normal SnapTrade authentication login endpoint. For Personal OAuth, omit `userId` and `userSecret`; the Bearer token identifies the Personal user.

The CLI pattern calls `loginSnapTradeUser`, opens the returned `redirectURI`, and polls brokerage authorizations until a new or updated connection appears:

```ts
const loginResponse = await snaptrade.authentication.loginSnapTradeUser({
  reconnect: existingConnectionId,
  broker: brokerSlug,
  connectionType: existingConnectionId ? undefined : "trade-if-available",
});

const redirectUri = loginResponse.data.redirectURI;
```

For Personal OAuth apps, prefer connection-management UX that makes the user's current state obvious:

- "Connect account" opens a new Connection Portal session.
- "Reconnect" passes the existing brokerage authorization ID.
- "Disconnect" removes an existing brokerage authorization.
- "Refresh status" lists brokerage authorizations and accounts after the portal closes.

## Token Revocation And Sign-Out

Use the discovered `revocation_endpoint` to revoke tokens on sign-out or account unlink:

```ts
const body = new URLSearchParams({
  token,
  token_type_hint: "refresh_token",
  client_id: SNAPTRADE_OAUTH_CLIENT_ID,
});

await fetch(revocationEndpoint, {
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  },
  body,
});
```

Revoke the refresh token first, then the access token if you store both.

## Recommended App Architecture

For web apps, keep the OAuth token exchange and refresh flow on your backend. The browser should initiate login and receive your app session, not the SnapTrade refresh token.

For desktop and CLI apps, a loopback callback with PKCE is appropriate. Store tokens in the operating system credential store or another local encrypted store.

Keep a clear distinction in your data model:

```ts
type SnapTradeAuthMode =
  | "personalOAuth"
  | "personalApiKey"
  | "commercialApiKey";
```

For Personal OAuth records, store OAuth token fields only. Do not retain stale Commercial fields such as `userId`, `userSecret`, `clientId`, or `consumerKey` on the same active auth profile.

## Implementation Checklist

- SnapTrade has issued your OAuth `client_id`.
- Your redirect URI is registered exactly.
- Your OAuth flow uses authorization code + PKCE.
- You verify `state` on every callback.
- Your token exchange sends `client_id`, `redirect_uri`, and `code_verifier`.
- Your app stores refresh tokens securely.
- Your API client refreshes before expiry with a small skew.
- Your API client retries once after a `401` by forcing a refresh.
- Your SDK uses `SnaptradeAuth.personalOAuth`.
- Your Personal OAuth path does not create SnapTrade users or store `userSecret`.
- Your UI explains that Personal OAuth currently supports read and connection-management workflows.
