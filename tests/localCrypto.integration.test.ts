/** Opt-in real local backend integration. Only prompts/account choice are stubbed. */
import { Command } from "commander";
import { Snaptrade, SnaptradeAuth } from "snaptrade-typescript-sdk";
import { describe, expect, it, vi } from "vitest";
import type { SnaptradeClient } from "../src/utils/snaptradeClient.ts";
import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const simulation = process.env.CRYPTO_LOCAL_SIMULATION === "1";
vi.mock("@inquirer/prompts", () => ({ confirm: vi.fn(async () => true) }));
vi.mock("../src/utils/selectAccount.ts", () => ({
  selectAccount: vi.fn(async () => ({ id: process.env.CRYPTO_LOCAL_ACCOUNT,
    name: "SIMULATED BTC", institution_name: "Mocked Robinhood Agentic", balance: { total: { amount: 1000, currency: "USD" } } })),
}));

// Never read the user's normal configuration, refresh tokens or discover a destination.
function localProfile() {
  const root = process.env.XDG_CONFIG_HOME;
  if (!simulation || !root || !root.includes("crypto-cli-config-"))
    throw new Error("Requires disposable simulation config");
  const settings = JSON.parse(readFileSync(join(root, "snaptrade/settings.json"), "utf8"));
  const profile = settings.profiles.simulation;
  const url = new URL(profile.basePath);
  if (url.protocol !== "http:" || url.hostname !== "localhost" || url.pathname !== "/api/v1" ||
      url.username || url.password || url.search || url.hash || !url.port || profile.oauthRefreshToken)
    throw new Error("Refusing non-local simulation destination");
  return profile;
}

describe.skipIf(!simulation)("local CLI crypto simulation", () => {
  it("previews, places a resting BUY, reads status and cancels through Django", async () => {
    const profile = localProfile();
    // Guard all SDK destinations, including redirects, before importing commands.
    const { default: axios } = await import("axios");
    axios.defaults.maxRedirects = 0;
    const starts = new WeakMap<object, number>();
    const timings: Array<{ method?: string; path: string; status: number; ms: number }> = [];
    axios.interceptors.request.use((config) => {
      const url = new URL(config.url!, config.baseURL);
      if (url.origin !== new URL(profile.basePath).origin)
        throw new Error("External destination blocked");
      starts.set(config, performance.now());
      return config;
    });
    function record(config: object & { method?: string; url?: string }, status: number) {
      timings.push({ method: config.method, path: new URL(config.url!, profile.basePath).pathname,
        status, ms: performance.now() - starts.get(config)! });
    }
    axios.interceptors.response.use((response) => { record(response.config, response.status); return response; },
      (error) => { if (error.response) record(error.config, error.response.status); return Promise.reject(error); });
    const { cryptoCommand } = await import("../src/commands/trade/crypto.ts");
    const { cancelOrderCommand } = await import("../src/commands/cancelOrder.ts");
    const sdk = new Snaptrade({ auth: SnaptradeAuth.commercialApiKey({ clientId: profile.clientId, consumerKey: profile.consumerKey }),
      basePath: profile.basePath });
    const { tradeCommand } = await import("../src/commands/trade/index.ts");
    const cli = new Command().option("--useLastAccount", "use seeded account", true);
    cli.addCommand(tradeCommand(sdk as SnaptradeClient));
    cli.addCommand(cancelOrderCommand(sdk as SnaptradeClient));
    // A low limit is only meaningful here because execution is entirely simulated.
    await cli.parseAsync(["trade", "--ticker", "BTC-USD", "--action", "BUY", "--orderType", "Limit",
      "--limitPrice", "1", "crypto", "--amount", "0.001"], { from: "user" });
    const orders = await sdk.accountInformation.getUserAccountOrders({ userId: profile.userId, userSecret: profile.userSecret, accountId: process.env.CRYPTO_LOCAL_ACCOUNT!, state: "all" });
    const order = orders.data[0];
    expect(order).toBeDefined();
    expect(order.status).not.toBe("EXECUTED");
    const id = order.brokerage_order_id;
    expect(id).toBeTruthy();
    await cli.parseAsync(["cancel-order", "--orderId", id!], { from: "user" });
    const terminal = await sdk.accountInformation.getUserAccountOrderDetail({ userId: profile.userId, userSecret: profile.userSecret, accountId: process.env.CRYPTO_LOCAL_ACCOUNT!, brokerage_order_id: id! });
    expect(terminal.data.status).toBe("CANCELED");
    expect(cryptoCommand).toBeDefined();
    const invalid = ["trade", "--ticker", "BTC-USD", "--action", "BUY", "--orderType", "Limit", "--limitPrice", "1", "crypto", "--amount", "0"];
    await expect(cli.parseAsync(invalid, { from: "user" })).rejects.toThrow("positive decimal");
    await expect(cli.parseAsync([...invalid.slice(0, -1), "999"], { from: "user" })).rejects.toThrow();
    await expect(cli.parseAsync([...invalid.slice(0, -1), "0.002"], { from: "user" })).rejects.toThrow();
    expect(timings.length).toBeGreaterThan(5);
    writeFileSync(join(process.env.XDG_CONFIG_HOME!, "api-timings.json"), JSON.stringify(timings));
  }, 45000);
});
