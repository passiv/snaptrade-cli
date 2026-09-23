import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  captureConsole,
  parseCommand,
  stripAnsi,
  useIsolatedConfigHome,
} from "./helpers/cli.ts";

describe("logout command", () => {
  beforeEach(() => {
    vi.resetModules();
    useIsolatedConfigHome();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("revokes both tokens and clears only the active OAuth session", async () => {
    const settings = await import("../src/utils/settings.ts");
    settings.saveProfile({
      authMode: "oauth",
      accountType: "personal",
      oauthAccessToken: "access-token",
      oauthRefreshToken: "refresh-token",
      oauthExpiresAt: "2026-09-23T12:00:00Z",
      oauthScope: "read trade",
      oauthSubject: "person-id",
      oauthEmail: "person@example.com",
      lastAccountId: "account-id",
      basePath: "https://api.snaptrade.com/api/v1",
    });

    const revoked: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string, init?: RequestInit) => {
        if (input.endsWith("/.well-known/oauth-authorization-server")) {
          return Response.json({
            revocation_endpoint: "https://api.snaptrade.com/oauth/revoke/",
          });
        }
        if (input.endsWith("/oauth/revoke/")) {
          revoked.push(new URLSearchParams(init?.body as string).get("token")!);
          return new Response(null, { status: 200 });
        }
        throw new Error(`Unexpected request: ${input}`);
      }),
    );

    const { logoutCommand } = await import("../src/commands/logout.ts");
    const output = captureConsole();
    await parseCommand(logoutCommand(), ["logout"]);

    expect(revoked).toEqual(["refresh-token", "access-token"]);
    expect(settings.getProfile()).toEqual({
      authMode: "oauth",
      accountType: "personal",
      basePath: "https://api.snaptrade.com/api/v1",
    });
    expect(stripAnsi(output.log.join("\n"))).toContain(
      "Signed out of OAuth profile default",
    );
  });

  it("clears local credentials and warns when revocation fails", async () => {
    const settings = await import("../src/utils/settings.ts");
    settings.saveProfile({
      authMode: "oauth",
      oauthRefreshToken: "refresh-token",
      oauthScope: "read",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("Network unavailable");
      }),
    );

    const { logoutCommand } = await import("../src/commands/logout.ts");
    const output = captureConsole();
    await parseCommand(logoutCommand(), ["logout"]);

    expect(settings.getProfile()).toEqual({ authMode: "oauth" });
    expect(stripAnsi(output.warn.join("\n"))).toContain(
      "SnapTrade token revocation could not be confirmed",
    );
  });

  it("leaves API-key profiles alone", async () => {
    const settings = await import("../src/utils/settings.ts");
    settings.saveProfile({
      authMode: "apiKey",
      clientId: "client-id",
      consumerKey: "consumer-key",
    });
    const { logoutCommand } = await import("../src/commands/logout.ts");
    const output = captureConsole();
    await parseCommand(logoutCommand(), ["logout"]);

    expect(settings.getProfile()).toMatchObject({
      authMode: "apiKey",
      clientId: "client-id",
      consumerKey: "consumer-key",
    });
    expect(output.log.join("\n")).toContain("does not use SnapTrade OAuth");
  });
});
