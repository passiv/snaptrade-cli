import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  captureConsole,
  createMockSnaptrade,
  parseCommand,
  stripAnsi,
} from "./helpers/cli.ts";

const account = {
  id: "crypto-account",
  name: "Robinhood account",
  institution_name: "Robinhood Agentic Trading",
  brokerage_authorization: "auth-1",
  balance: { total: { amount: 1000, currency: "CAD" } },
};
const user = { userId: "test-user", userSecret: "test-secret" };
const args = ["trade", "--ticker", "BTC-USD", "--action", "BUY"];

async function setup() {
  const confirm = vi.fn().mockResolvedValue(false);
  vi.doMock("@inquirer/prompts", () => ({ confirm }));
  vi.doMock("../src/utils/user.ts", () => ({
    loadOrRegisterUser: vi.fn().mockResolvedValue(user),
  }));
  vi.doMock("../src/utils/selectAccount.ts", () => ({
    selectAccount: vi.fn().mockResolvedValue(account),
  }));
  vi.doMock("../src/utils/withDebouncedSpinner.ts", () => ({
    withDebouncedSpinner: vi.fn(
      async (_message: string, callback: () => unknown) => callback(),
    ),
  }));
  const snaptrade = createMockSnaptrade();
  snaptrade.trading.searchCryptocurrencyPairInstruments.mockResolvedValue({
    data: { items: [{ symbol: "BTC-USD", base: "BTC", quote: "USD" }] },
  });
  snaptrade.trading.previewCryptoOrder.mockResolvedValue({
    data: { estimated_fee: { amount: "0", currency: "USD" } },
  });
  snaptrade.trading.getCryptocurrencyPairQuote.mockResolvedValue({
    data: { bid: "100", ask: "102", mid: "101" },
  });
  snaptrade.trading.placeCryptoOrder.mockResolvedValue({
    headers: { "x-request-id": "test-request" },
    data: { brokerage_order_id: "test-order" },
  });
  snaptrade.accountInformation.getUserAccountOrderDetail.mockResolvedValue({
    data: { status: "PENDING" },
  });
  const { tradeCommand } = await import("../src/commands/trade/index.ts");
  const output = captureConsole();
  return {
    snaptrade,
    confirm,
    output,
    run: (extra: string[] = []) =>
      parseCommand(tradeCommand(snaptrade), [
        ...args,
        ...extra,
        "crypto",
        "--amount",
        "0.00000001",
      ]),
  };
}

describe("crypto trade preview and confirmation", () => {
  beforeEach(() => vi.resetModules());

  it("shows a readable preview with exact fractional units, quote currency and a valid zero fee before confirmation", async () => {
    const { run, output, confirm, snaptrade } = await setup();
    confirm.mockImplementation(async () => {
      const text = stripAnsi(output.log.join("\n"));
      expect(text).toContain("📄 Trade Preview");
      expect(text).toContain("🏦 Account");
      expect(text).toContain("$1,000.00");
      expect(text).toContain("0.00000001 BTC");
      expect(text).toContain("0.00000102 USD (before fees)");
      expect(text).toMatch(/Est\. Fee\s+0 USD/);
      expect(text).toContain("GTC");
      expect(text).not.toContain("[object Object]");
      expect(snaptrade.trading.placeCryptoOrder).not.toHaveBeenCalled();
      return false;
    });
    await run();
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({ default: false }),
    );
    expect(snaptrade.trading.placeCryptoOrder).not.toHaveBeenCalled();
    expect(output.log.join("\n")).toContain("❌ Trade cancelled by user.");
  });

  it.each([
    ["Market", [], "MARKET", {}],
    [
      "Limit",
      ["--limitPrice", "99.12345678"],
      "LIMIT",
      { limit_price: "99.12345678", post_only: false },
    ],
    ["Stop", ["--stopPrice", "98"], "STOP_LOSS_MARKET", { stop_price: "98" }],
    [
      "StopLimit",
      ["--limitPrice", "99", "--stopPrice", "98"],
      "STOP_LOSS_LIMIT",
      { limit_price: "99", stop_price: "98" },
    ],
  ])(
    "previews and submits identical %s parameters once after confirmation",
    async (orderType, prices, type, fields) => {
      const { run, snaptrade, confirm } = await setup();
      confirm.mockResolvedValue(true);
      await run(["--orderType", orderType as string, ...(prices as string[])]);
      const request = {
        ...user,
        accountId: account.id,
        instrument: { symbol: "BTC-USD", type: "CRYPTOCURRENCY_PAIR" },
        side: "BUY",
        type,
        time_in_force: "GTC",
        amount: "0.00000001",
        ...(fields as object),
      };
      expect(
        snaptrade.trading.previewCryptoOrder,
      ).toHaveBeenCalledExactlyOnceWith(request);
      expect(
        snaptrade.trading.placeCryptoOrder,
      ).toHaveBeenCalledExactlyOnceWith(request);
    },
  );

  it("estimates SELL proceeds from bid and retains the accepted order on status lookup failure", async () => {
    const { run, snaptrade, confirm, output } = await setup();
    confirm.mockResolvedValue(true);
    snaptrade.accountInformation.getUserAccountOrderDetail.mockRejectedValue({
      status: 503,
    });
    await run(["--action", "SELL"]);
    expect(stripAnsi(output.log.join("\n"))).toMatch(
      /Est\. Credit\s+0.000001 USD/,
    );
    expect(output.warn.join("\n")).toContain("The order request was accepted");
    expect(snaptrade.trading.placeCryptoOrder).toHaveBeenCalledTimes(1);
  });

  it("shows missing fees and quotes as unavailable without inventing zero values", async () => {
    const { run, snaptrade, output } = await setup();
    snaptrade.trading.previewCryptoOrder.mockResolvedValue({ data: {} });
    snaptrade.trading.getCryptocurrencyPairQuote.mockRejectedValue(
      new Error("quote unavailable"),
    );
    await run();
    const text = stripAnsi(output.log.join("\n"));
    expect(text).toMatch(/Est\. Fee\s+Unavailable/);
    expect(text).toMatch(/Est\. Cost\s+Unavailable/);
    expect(text).toMatch(/Quote\s+Unavailable/);
    expect(text).not.toContain("NaN");
  });

  it("preserves non-fiat fee currency and tiny fees", async () => {
    const { run, snaptrade, output } = await setup();
    snaptrade.trading.previewCryptoOrder.mockResolvedValue({
      data: { estimated_fee: { amount: "0.00000001", currency: "BTC" } },
    });
    await run();
    expect(stripAnsi(output.log.join("\n"))).toMatch(
      /Est\. Fee\s+0.00000001 BTC/,
    );
  });

  it.each(["0", "-1", "NaN", "Infinity", "1coin", "1e-8"])(
    "rejects invalid base quantity %s",
    async (amount) => {
      const { snaptrade, confirm } = await setup();
      const { tradeCommand } = await import("../src/commands/trade/index.ts");
      await expect(
        parseCommand(tradeCommand(snaptrade), [
          ...args,
          "crypto",
          "--amount",
          amount,
        ]),
      ).rejects.toThrow("positive decimal");
      expect(snaptrade.trading.previewCryptoOrder).not.toHaveBeenCalled();
      expect(confirm).not.toHaveBeenCalled();
    },
  );

  it("keeps the equity preview, Day default and stop submission unchanged", async () => {
    const { snaptrade, confirm, output } = await setup();
    vi.doMock("../src/utils/quotes.ts", () => ({
      getFullQuote: vi
        .fn()
        .mockResolvedValue({ bid: 100, ask: 102, last: 101, currency: "CAD" }),
    }));
    vi.resetModules();
    snaptrade.accountInformation.getUserAccountBalance.mockResolvedValue({
      data: [{ cash: 500, buying_power: 600, currency: { code: "CAD" } }],
    });
    snaptrade.trading.placeForceOrder.mockResolvedValue({
      headers: {},
      data: {},
    });
    confirm.mockResolvedValue(true);
    const { tradeCommand } = await import("../src/commands/trade/index.ts");
    await parseCommand(tradeCommand(snaptrade), [
      "trade",
      "--ticker",
      "AAPL",
      "--action",
      "BUY",
      "--orderType",
      "Stop",
      "--stopPrice",
      "90",
      "equity",
      "--shares",
      "2",
    ]);
    const text = stripAnsi(output.log.join("\n"));
    expect(text).toContain("📄 Trade Preview");
    expect(text).toMatch(/Shares\s+2/);
    expect(text).toContain("Day");
    expect(text).toContain("$202.00");
    expect(snaptrade.trading.placeForceOrder).toHaveBeenCalledWith(
      expect.objectContaining({ stop: 90, time_in_force: "Day", units: 2 }),
    );
    expect(snaptrade.trading.previewCryptoOrder).not.toHaveBeenCalled();
    vi.doUnmock("../src/utils/quotes.ts");
  });

  it("keeps option leg formatting and broker impact estimates unchanged", async () => {
    const { snaptrade, confirm, output } = await setup();
    vi.doMock("../src/utils/quotes.ts", () => ({
      getLastQuote: vi.fn().mockResolvedValue({ last: 100, currency: "CAD" }),
      formatAmount: ({ value }: { value: number }) => `$${value.toFixed(2)}`,
    }));
    vi.resetModules();
    Object.assign(snaptrade.trading, {
      getUserAccountOptionQuotes: vi
        .fn()
        .mockResolvedValue({ data: { synthetic_price: 2 } }),
    });
    confirm.mockResolvedValue(true);
    const { confirmTrade } = await import(
      "../src/commands/trade/option/index.ts"
    );
    await confirmTrade(
      snaptrade,
      user,
      account,
      "AAPL",
      [
        {
          action: "BUY",
          type: "CALL",
          quantity: 1,
          strike: 100,
          expiration: "2026-12-18",
        },
      ],
      "2",
      "Limit",
      "BUY",
      "Day",
      undefined,
      {
        estimated_cash_change: "200",
        estimated_fee_total: "1",
        cash_change_direction: "DEBIT",
      },
    );
    const text = stripAnsi(output.log.join("\n"));
    expect(text).toContain("🧩 Legs");
    expect(text).toContain("CALL");
    expect(text).toContain("Day");
    expect(text).toMatch(/Est. Cost\s+\$200.00/);
    expect(text).toMatch(/Total Cost\s+\$201.00/);
    expect(confirm).toHaveBeenCalledTimes(1);
    vi.doUnmock("../src/utils/quotes.ts");
  });

  it("stops before confirmation when the broker preview rejects the order", async () => {
    const { run, snaptrade, confirm } = await setup();
    snaptrade.trading.previewCryptoOrder.mockRejectedValue(
      new Error("preview rejected"),
    );
    await expect(run()).rejects.toThrow("preview rejected");
    expect(confirm).not.toHaveBeenCalled();
    expect(snaptrade.trading.placeCryptoOrder).not.toHaveBeenCalled();
  });

  it("does not retry an ambiguous placement failure", async () => {
    const { run, snaptrade, confirm } = await setup();
    confirm.mockResolvedValue(true);
    snaptrade.trading.placeCryptoOrder.mockRejectedValue(
      new Error("timed out"),
    );
    await expect(run()).rejects.toThrow("timed out");
    expect(snaptrade.trading.placeCryptoOrder).toHaveBeenCalledTimes(1);
    expect(
      snaptrade.accountInformation.getUserAccountOrderDetail,
    ).not.toHaveBeenCalled();
  });

  it.each([
    [["--tif", "Day"], "GTC only"],
    [["--action", "HOLD"], "BUY or SELL"],
    [["--orderType", "Limit"], "positive --limitPrice"],
    [["--orderType", "Stop"], "positive --stopPrice"],
    [["--orderType", "StopLimit", "--limitPrice", "1"], "positive --stopPrice"],
    [["--orderType", "Limit", "--limitPrice", "NaN"], "positive --limitPrice"],
    [["--stopPrice", "1"], "only valid for Stop"],
    [["--limitPrice", "1"], "only valid for Limit"],
    [["--replace", "old"], "not supported"],
  ])(
    "rejects unsupported or invalid parameters %j before preview",
    async (extra, message) => {
      const { run, snaptrade, confirm } = await setup();
      await expect(run(extra as string[])).rejects.toThrow(message as string);
      expect(snaptrade.trading.previewCryptoOrder).not.toHaveBeenCalled();
      expect(confirm).not.toHaveBeenCalled();
    },
  );
});
