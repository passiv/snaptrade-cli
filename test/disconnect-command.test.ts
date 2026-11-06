import axios, { type InternalAxiosRequestConfig } from "axios";
import { Snaptrade, SnaptradeAuth } from "snaptrade-typescript-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { disconnectCommand } from "../src/commands/disconnect.ts";
import { saveProfile } from "../src/utils/settings.ts";
import type { SnaptradeClient } from "../src/utils/snaptradeClient.ts";
import {
  captureConsole,
  parseCommand,
  useIsolatedConfigHome,
} from "./helpers/cli.ts";

const user = vi.hoisted(() => ({ loadOrRegisterUser: vi.fn() }));
vi.mock("../src/utils/user.ts", () => user);
const originalAdapter = axios.defaults.adapter;

beforeEach(() => {
  useIsolatedConfigHome();
  captureConsole();
});
afterEach(() => {
  axios.defaults.adapter = originalAdapter;
});

describe("disconnect with the stable SDK", () => {
  it.each(["personal", "commercial"] as const)(
    "deletes a connection using a %s API-key profile",
    async (accountType) => {
      saveProfile({ authMode: "apiKey", accountType });
      user.loadOrRegisterUser.mockResolvedValue(
        accountType === "commercial"
          ? { userId: "local-user", userSecret: "local-user-secret" }
          : {},
      );
      const requests: InternalAxiosRequestConfig[] = [];
      axios.defaults.adapter = async (config) => {
        requests.push(config);
        return { config, data: {}, headers: {}, status: 200, statusText: "OK" };
      };
      const credentials = {
        clientId: "local-client",
        consumerKey: "local-secret",
      };
      const client = new Snaptrade({
        auth:
          accountType === "personal"
            ? SnaptradeAuth.personalApiKey(credentials)
            : SnaptradeAuth.commercialApiKey(credentials),
        basePath: "http://localhost:9000/api/v1",
      }) as SnaptradeClient;

      await parseCommand(disconnectCommand(client), [
        "disconnect",
        "local-connection",
      ]);

      expect(requests).toHaveLength(1);
      const request = requests[0];
      expect(request.method).toBe("delete");
      expect(new URL(request.url!, request.baseURL).pathname).toBe(
        "/api/v1/connection/local-connection",
      );
      expect(request.headers.has("Signature")).toBe(true);
      expect(request.headers.has("Authorization")).toBe(false);
    },
  );

  it("explains that OAuth disconnect is unsupported before sending a request", async () => {
    saveProfile({ authMode: "oauth", accountType: "personal" });
    user.loadOrRegisterUser.mockResolvedValue({});
    const adapter = vi.fn();
    axios.defaults.adapter = adapter;
    const client = new Snaptrade({
      auth: SnaptradeAuth.oauth({ accessToken: "local-token" }),
      basePath: "http://localhost:9000/api/v1",
    }) as SnaptradeClient;

    await expect(
      parseCommand(disconnectCommand(client), [
        "disconnect",
        "local-connection",
      ]),
    ).rejects.toThrow("Use an API-key profile.");
    expect(adapter).not.toHaveBeenCalled();
  });
});
