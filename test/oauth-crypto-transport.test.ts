import axios, { type InternalAxiosRequestConfig } from "axios";
import type { SnaptradeClient } from "../src/utils/snaptradeClient.ts";
import { Snaptrade, SnaptradeAuth } from "snaptrade-typescript-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ refreshOAuthToken: vi.fn() }));
vi.mock("../src/utils/oauth.ts", () => auth);
const originalAdapter = axios.defaults.adapter;
beforeEach(async () => {
  vi.resetModules();
  axios.interceptors.request.clear();
  axios.interceptors.response.clear();
  auth.refreshOAuthToken.mockReset();
  const { installAxiosPatch } = await import("../src/utils/axios.ts");
  installAxiosPatch();
});
afterEach(() => {
  axios.defaults.adapter = originalAdapter;
  axios.interceptors.request.clear();
  axios.interceptors.response.clear();
});

function captureTransport() {
  const requests: InternalAxiosRequestConfig[] = [];
  axios.defaults.adapter = async (config) => {
    requests.push(config);
    return { config, data: {}, headers: {}, status: 200, statusText: "OK" };
  };
  return requests;
}

const order = {
  accountId: "local-account",
  instrument: { symbol: "BTC-USD", type: "CRYPTOCURRENCY_PAIR" as const },
  side: "BUY" as const,
  type: "LIMIT" as const,
  amount: "0.001",
  limit_price: "1",
  time_in_force: "GTC" as const,
};

describe("CLI startup OAuth transport for SDK crypto methods", () => {
  it("supplies current bearer tokens for crypto and cancellation despite omitted SDK headers", async () => {
    const requests = captureTransport();
    auth.refreshOAuthToken
      .mockResolvedValueOnce("first-local-token")
      .mockResolvedValueOnce("second-local-token")
      .mockResolvedValue("third-local-token");
    const client = new Snaptrade({
      auth: SnaptradeAuth.personalOAuth({
        accessToken: async () => "sdk-token",
      }),
      basePath: "http://localhost:9000/api/v1",
    }) as SnaptradeClient;
    await client.trading.previewCryptoOrder(order);
    await client.trading.placeCryptoOrder(order);
    await client.trading.getCryptocurrencyPairQuote({
      accountId: "local-account",
      instrumentSymbol: "BTC-USD",
    });
    await client.trading.searchCryptocurrencyPairInstruments({
      accountId: "local-account",
    });
    await client.trading.cancelOrder({
      accountId: "local-account",
      brokerage_order_id: "simulated-order",
    });
    expect(
      requests.map((request) => request.headers.get("Authorization")),
    ).toEqual([
      "Bearer first-local-token",
      "Bearer second-local-token",
      "Bearer third-local-token",
      "Bearer third-local-token",
      "Bearer third-local-token",
    ]);
    for (const request of requests) {
      expect(request.headers.has("Signature")).toBe(false);
      expect(request.url).not.toMatch(/clientId|userId|userSecret/);
    }
  });

  it("preserves commercial SDK signing when there is no OAuth profile", async () => {
    const requests = captureTransport();
    auth.refreshOAuthToken.mockResolvedValue(null);
    const client = new Snaptrade({
      auth: SnaptradeAuth.commercialApiKey({
        clientId: "local-client",
        consumerKey: "local-secret",
      }),
      basePath: "http://localhost:9000/api/v1",
    }) as SnaptradeClient;
    await client.trading.previewCryptoOrder({
      ...order,
      userId: "local-user",
      userSecret: "local-user-secret",
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].headers.has("Authorization")).toBe(false);
    expect(requests[0].headers.get("Signature")).toBeTruthy();
    expect(requests[0].url).toContain("clientId=local-client");
  });

  it("does not send or retry an order when the local token provider rejects", async () => {
    const requests = captureTransport();
    auth.refreshOAuthToken.mockRejectedValue(new Error("Local auth denied"));
    const client = new Snaptrade({
      auth: SnaptradeAuth.personalOAuth({
        accessToken: async () => "sdk-token",
      }),
      basePath: "http://localhost:9000/api/v1",
    }) as SnaptradeClient;
    await expect(client.trading.placeCryptoOrder(order)).rejects.toThrow(
      "Local auth denied",
    );
    expect(auth.refreshOAuthToken).toHaveBeenCalledTimes(1);
    expect(requests).toHaveLength(0);
  });
});

describe("quote command SDK transport", () => {
  it("routes Robinhood BTC to the selected account's crypto quote URL with OAuth", async () => {
    const { captureConsole, parseCommand } = await import("./helpers/cli.ts");
    vi.doMock("../src/utils/user.ts", () => ({
      loadOrRegisterUser: vi.fn().mockResolvedValue({}),
    }));
    vi.doMock("../src/utils/selectAccount.ts", () => ({
      selectAccount: vi
        .fn()
        .mockResolvedValue({
          id: "selected-account",
          brokerage_authorization: "selected-auth",
          institution_name: "Robinhood Agentic Trading",
        }),
    }));
    auth.refreshOAuthToken.mockResolvedValue("local-quote-token");
    const requests: InternalAxiosRequestConfig[] = [];
    axios.defaults.adapter = async (config) => {
      requests.push(config);
      const pathname = new URL(config.url!, config.baseURL).pathname;
      const data = pathname.endsWith("/authorizations/selected-auth")
        ? { brokerage: { allows_cryptocurrency_and_regular_securities: true } }
        : pathname.endsWith("/cryptocurrencyPairs")
          ? { items: [{ base: "BTC", quote: "USD", symbol: "BTC-USD" }] }
          : { bid: "82396.09", ask: "83965.6794085", mid: "83180.88470425" };
      return { config, data, headers: {}, status: 200, statusText: "OK" };
    };
    const client = new Snaptrade({
      auth: SnaptradeAuth.personalOAuth({
        accessToken: async () => "sdk-token",
      }),
      basePath: "http://localhost:9000/api/v1",
    }) as SnaptradeClient;
    const { quoteCommand } = await import("../src/commands/quote.ts");
    captureConsole();
    await parseCommand(quoteCommand(client), ["quote", "BTC"]);
    const paths = requests.map(
      (request) => new URL(request.url!, request.baseURL).pathname,
    );
    expect(paths).toEqual([
      "/api/v1/authorizations/selected-auth",
      "/api/v1/accounts/selected-account/trading/instruments/cryptocurrencyPairs",
      "/api/v1/accounts/selected-account/trading/instruments/cryptocurrencyPairs/BTC-USD/quote",
    ]);
    for (const request of requests) {
      expect(request.headers.get("Authorization")).toBe(
        "Bearer local-quote-token",
      );
      expect(request.headers.has("Signature")).toBe(false);
      expect(request.url).not.toMatch(/clientId|userId|userSecret/);
    }
  });
});
