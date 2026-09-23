import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import net from "net";
import { useIsolatedConfigHome } from "./helpers/cli.ts";

describe("OAuth trading scope", () => {
  beforeEach(async () => {
    vi.resetModules();
    useIsolatedConfigHome();
    const server = net.createServer();
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Could not reserve an OAuth test port");
    }
    process.env.SNAPTRADE_OAUTH_REDIRECT_PORT = String(address.port);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.doUnmock("open");
    vi.restoreAllMocks();
    delete process.env.SNAPTRADE_OAUTH_REDIRECT_PORT;
  });

  it("requests new consent for a read-only profile before trading", async () => {
    const localFetch = globalThis.fetch;
    const openedUrls: URL[] = [];
    vi.doMock("open", () => ({
      default: vi.fn(async (value: string) => {
        const url = new URL(value);
        openedUrls.push(url);
        const callback = new URL(url.searchParams.get("redirect_uri")!);
        callback.searchParams.set("state", url.searchParams.get("state")!);
        callback.searchParams.set("code", "test-code");
        await localFetch(callback);
      }),
    }));

    const requests: URLSearchParams[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string, init?: RequestInit) => {
        if (input.endsWith("/.well-known/oauth-authorization-server")) {
          return Response.json({
            authorization_endpoint:
              "https://dashboard.snaptrade.com/oauth/authorize",
            token_endpoint: "https://api.snaptrade.com/oauth/token/",
          });
        }
        if (input.endsWith("/oauth/token/")) {
          requests.push(new URLSearchParams(init?.body as string));
          return Response.json({
            access_token: "trading-token",
            refresh_token: "trading-refresh",
            expires_in: 3600,
            scope: "openid profile email read trade",
          });
        }
        throw new Error(`Unexpected fetch: ${input}`);
      }),
    );

    const settings = await import("../src/utils/settings.ts");
    settings.saveProfile({
      authMode: "oauth",
      accountType: "personal",
      oauthAccessToken: "read-token",
      oauthRefreshToken: "read-refresh",
      oauthExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
      oauthScope: "read",
    });
    const { ensureOAuthLogin } = await import("../src/utils/oauth.ts");

    await ensureOAuthLogin("trade");

    expect(openedUrls).toHaveLength(1);
    expect(openedUrls[0].searchParams.get("scope")).toBe(
      "openid profile email read trade",
    );
    expect(requests[0].get("grant_type")).toBe("authorization_code");
    expect(settings.getProfile().oauthScope).toBe(
      "openid profile email read trade",
    );
  });

  it("rejects trading when SnapTrade narrows the requested grant", async () => {
    const localFetch = globalThis.fetch;
    vi.doMock("open", () => ({
      default: vi.fn(async (value: string) => {
        const url = new URL(value);
        const callback = new URL(url.searchParams.get("redirect_uri")!);
        callback.searchParams.set("state", url.searchParams.get("state")!);
        callback.searchParams.set("code", "test-code");
        await localFetch(callback);
      }),
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) => {
        if (input.endsWith("/.well-known/oauth-authorization-server")) {
          return Response.json({
            authorization_endpoint:
              "https://dashboard.snaptrade.com/oauth/authorize",
            token_endpoint: "https://api.snaptrade.com/oauth/token/",
          });
        }
        if (input.endsWith("/oauth/token/")) {
          return Response.json({
            access_token: "read-only-token",
            expires_in: 3600,
            scope: "openid profile email read",
          });
        }
        throw new Error(`Unexpected fetch: ${input}`);
      }),
    );
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const settings = await import("../src/utils/settings.ts");
    settings.saveProfile({
      authMode: "oauth",
      oauthAccessToken: "old-read-token",
      oauthExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
      oauthScope: "read",
    });
    const { ensureOAuthLogin } = await import("../src/utils/oauth.ts");

    await expect(ensureOAuthLogin("trade")).rejects.toThrow(
      "did not grant trading access",
    );
    expect(settings.getProfile().oauthScope).toBe("openid profile email read");
    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining("did not confirm the trade scope"),
    );
  });

  it("preserves a trade grant when the refresh response omits scope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) => {
        if (input.endsWith("/.well-known/oauth-authorization-server")) {
          return Response.json({
            token_endpoint: "https://api.snaptrade.com/oauth/token/",
          });
        }
        return Response.json({ access_token: "new-token", expires_in: 3600 });
      }),
    );
    const settings = await import("../src/utils/settings.ts");
    settings.saveProfile({
      authMode: "oauth",
      oauthRefreshToken: "refresh-token",
      oauthExpiresAt: new Date(Date.now() - 1000).toISOString(),
      oauthScope: "read trade",
    });
    const { ensureOAuthLogin } = await import("../src/utils/oauth.ts");

    await ensureOAuthLogin("trade");

    expect(settings.getProfile().oauthAccessToken).toBe("new-token");
    expect(settings.getProfile().oauthScope).toBe("read trade");
  });
});
