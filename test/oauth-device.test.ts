import http from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  captureConsole,
  parseCommand,
  useIsolatedConfigHome,
} from "./helpers/cli.ts";

vi.mock("open", () => ({ default: vi.fn() }));
vi.mock("@inquirer/prompts", () => ({ confirm: vi.fn(async () => true) }));

describe("device OAuth login", () => {
  let server: http.Server;
  let issuer: string;
  let requests: Array<{ path: string; body: URLSearchParams }>;
  let tokenError: string | undefined;
  let onAuthorization: (() => void) | undefined;
  let polls: number;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv("SNAPTRADE_OAUTH_DEVICE_CLIENT_ID", "public-device-client");
    useIsolatedConfigHome();
    requests = [];
    tokenError = undefined;
    onAuthorization = undefined;
    polls = 0;
    server = http.createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = new URLSearchParams(Buffer.concat(chunks).toString());
      requests.push({ path: req.url!, body });
      res.setHeader("Content-Type", "application/json");
      if (req.url === "/.well-known/oauth-authorization-server") {
        res.end(
          JSON.stringify({
            token_endpoint: `${issuer}/oauth/token/`,
            revocation_endpoint: `${issuer}/oauth/revoke/`,
          }),
        );
      } else if (req.url === "/oauth/device_authorization/") {
        res.end(
          JSON.stringify({
            device_code: "private-device-code",
            user_code: "ABCD-EFGH",
            verification_uri: "https://dashboard.example.com/oauth/device",
            expires_in: 600,
            interval: 0.001,
          }),
        );
        onAuthorization?.();
      } else if (req.url === "/oauth/token/") {
        if (body.get("grant_type") === "refresh_token") {
          res.end(
            JSON.stringify({
              access_token: "refreshed-access",
              refresh_token: "rotated-refresh",
              expires_in: 3600,
            }),
          );
        } else if (tokenError || polls++ === 0) {
          res.statusCode = 400;
          res.end(
            JSON.stringify({ error: tokenError ?? "authorization_pending" }),
          );
        } else {
          res.end(
            JSON.stringify({
              access_token: "device-access",
              refresh_token: "device-refresh",
              expires_in: 3600,
              scope: "read",
            }),
          );
        }
      } else if (req.url === "/oauth/revoke/") {
        res.end("{}");
      } else {
        res.statusCode = 404;
        res.end("{}");
      }
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Missing test port");
    issuer = `http://127.0.0.1:${address.port}`;
    const settings = await import("../src/utils/settings.ts");
    settings.saveProfile({ basePath: `${issuer}/api/v1` });
  });

  afterEach(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("polls through pending approval, saves the session and uses it for refresh and logout", async () => {
    const settings = await import("../src/utils/settings.ts");
    settings.saveProfile({
      authMode: "apiKey",
      clientId: "old-client",
      consumerKey: "old-key",
      userId: "old-user",
      userSecret: "old-secret",
      oauthEmail: "old@example.com",
      lastAccountId: "old-account",
    });
    const { loginCommand } = await import("../src/commands/login.ts");
    const output = captureConsole();
    await parseCommand(loginCommand(), ["login", "--use-device-code"]);

    const profile = settings.getProfile();
    expect(profile).toMatchObject({
      authMode: "oauth",
      accountType: "personal",
      oauthFlow: "device",
      oauthClientId: "public-device-client",
      oauthAccessToken: "device-access",
      oauthRefreshToken: "device-refresh",
      oauthScope: "read",
    });
    for (const key of [
      "clientId",
      "consumerKey",
      "userId",
      "userSecret",
      "oauthEmail",
      "lastAccountId",
    ]) {
      expect(profile).not.toHaveProperty(key);
    }
    expect(new Date(profile.oauthExpiresAt!).getTime()).toBeGreaterThan(
      Date.now(),
    );
    expect(polls).toBe(2);
    expect(output.all()).toContain(
      "https://dashboard.example.com/oauth/device",
    );
    expect(output.all()).toContain("ABCD-EFGH");
    for (const secret of [
      "private-device-code",
      "device-access",
      "device-refresh",
    ]) {
      expect(output.all()).not.toContain(secret);
    }
    const open = (await import("open")).default;
    expect(open).not.toHaveBeenCalled();
    expect(requests[0].body.get("scope")).toBe("read");
    const clientId = requests[0].body.get("client_id");
    expect(clientId).toBe("public-device-client");

    // Changing the environment must not rebind an existing grant.
    vi.stubEnv("SNAPTRADE_OAUTH_DEVICE_CLIENT_ID", "another-device-client");
    settings.saveProfile({ oauthExpiresAt: "2000-01-01T00:00:00Z" });
    const { refreshOAuthToken } = await import("../src/utils/oauth.ts");
    expect(await refreshOAuthToken()).toBe("refreshed-access");
    expect(settings.getProfile().oauthRefreshToken).toBe("rotated-refresh");
    expect(settings.getProfile().oauthScope).toBe("read");
    const { logoutCommand } = await import("../src/commands/logout.ts");
    await parseCommand(logoutCommand(), ["logout"]);
    const revoked = requests.filter((r) => r.path === "/oauth/revoke/");
    expect(revoked.map((r) => r.body.get("token"))).toEqual([
      "rotated-refresh",
      "refreshed-access",
    ]);
    for (const request of requests.filter(
      (r) => r.path !== "/.well-known/oauth-authorization-server",
    )) {
      expect(request.body.get("client_id")).toBe(clientId);
    }
    expect(settings.getProfile()).toEqual({
      basePath: `${issuer}/api/v1`,
      authMode: "oauth",
      accountType: "personal",
      oauthFlow: "device",
      oauthClientId: "public-device-client",
    });
  });

  it.each([
    ["access_denied", "authorization was denied"],
    ["expired_token", "device code expired"],
    ["unauthorized_client", "public client registered for the Device Code grant"],
  ])(
    "preserves the previous profile when approval fails with %s",
    async (error, message) => {
      tokenError = error;
      const settings = await import("../src/utils/settings.ts");
      settings.saveProfile({ authMode: "apiKey", consumerKey: "existing-key" });
      const before = settings.getProfile();
      const { loginWithDeviceOAuth } = await import("../src/utils/oauth.ts");
      captureConsole();

      const failure = await loginWithDeviceOAuth().catch(
        (reason: unknown) => reason,
      );

      expect(failure).toBeInstanceOf(Error);
      expect((failure as Error).message).toContain(message);
      expect(failure).not.toHaveProperty("config");

      expect(settings.getProfile()).toEqual(before);
      expect(requests.filter((r) => r.path === "/oauth/token/")).toHaveLength(
        1,
      );
    },
  );

  it("cancels polling on Ctrl+C without saving a session or leaking a signal listener", async () => {
    const settings = await import("../src/utils/settings.ts");
    const before = settings.getProfile();
    const listeners = process.listenerCount("SIGINT");
    onAuthorization = () => process.emit("SIGINT");
    const { loginWithDeviceOAuth } = await import("../src/utils/oauth.ts");
    captureConsole();

    await expect(loginWithDeviceOAuth()).rejects.toThrow(
      "device login cancelled",
    );

    expect(settings.getProfile()).toEqual(before);
    expect(process.listenerCount("SIGINT")).toBe(listeners);
  });

  it("uses device login again after logout instead of opening a browser", async () => {
    const settings = await import("../src/utils/settings.ts");
    settings.saveProfile({
      authMode: "oauth",
      oauthFlow: "device",
      oauthClientId: "saved-device-client",
    });
    vi.stubEnv("SNAPTRADE_OAUTH_DEVICE_CLIENT_ID", "");
    const { ensureOAuthLogin } = await import("../src/utils/oauth.ts");
    captureConsole();

    await ensureOAuthLogin();

    expect(settings.getProfile().oauthAccessToken).toBe("device-access");
    expect(requests[0].body.get("client_id")).toBe("saved-device-client");
    expect((await import("open")).default).not.toHaveBeenCalled();
  });

  it("requires a registered device client before making any requests", async () => {
    vi.stubEnv("SNAPTRADE_OAUTH_DEVICE_CLIENT_ID", "");
    const { loginWithDeviceOAuth } = await import("../src/utils/oauth.ts");

    await expect(loginWithDeviceOAuth()).rejects.toThrow(
      "Set SNAPTRADE_OAUTH_DEVICE_CLIENT_ID",
    );

    expect(requests).toHaveLength(0);
  });

  it("rejects trading on a device profile without starting browser consent", async () => {
    const settings = await import("../src/utils/settings.ts");
    settings.saveProfile({
      authMode: "oauth",
      oauthFlow: "device",
      oauthScope: "read",
    });
    const { ensureOAuthLogin } = await import("../src/utils/oauth.ts");

    await expect(ensureOAuthLogin("trade")).rejects.toThrow("snaptrade login");

    expect(requests).toHaveLength(0);
    expect((await import("open")).default).not.toHaveBeenCalled();
  });
});
