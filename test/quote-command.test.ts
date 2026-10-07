import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  captureConsole,
  createMockSnaptrade,
  parseCommand,
  stripAnsi,
  useIsolatedConfigHome,
} from "./helpers/cli.ts";

const equityAccount = {
  id: "equity-account",
  institution_name: "Schwab",
  brokerage_authorization: "auth-1",
};

const cryptoAccount = {
  id: "crypto-account",
  institution_name: "Coinbase",
  brokerage_authorization: "auth-2",
};

describe("quote command output", () => {
  beforeEach(() => {
    vi.resetModules();
    useIsolatedConfigHome();
    vi.doMock("../src/utils/user.ts", () => ({
      loadOrRegisterUser: vi.fn().mockResolvedValue({
        userId: "user",
        userSecret: "secret",
      }),
    }));
  });

  it("requests equity quotes with explicit symbols and prints bid/ask/last", async () => {
    vi.doMock("../src/utils/selectAccount.ts", () => ({
      selectAccount: vi.fn().mockResolvedValue(equityAccount),
    }));
    const snaptrade = createMockSnaptrade();
    vi.mocked(snaptrade.trading.getUserAccountQuotes).mockResolvedValue({
      data: [
        {
          symbol: { symbol: "AAPL", currency: { code: "USD" } },
          bid_price: 101,
          bid_size: 2,
          ask_price: 102,
          ask_size: 3,
          last_trade_price: 101.5,
        },
      ],
    });
    const { quoteCommand } = await import("../src/commands/quote.ts");
    const consoleOutput = captureConsole();

    await parseCommand(quoteCommand(snaptrade), ["quote", "AAPL"]);

    expect(snaptrade.trading.getUserAccountQuotes).toHaveBeenCalledWith({
      userId: "user",
      userSecret: "secret",
      accountId: "equity-account",
      symbols: "AAPL",
      useTicker: true,
    });
    const output = stripAnsi(consoleOutput.log.join("\n"));
    expect(output).toContain("AAPL");
    expect(output).toContain("$101.00 x2");
    expect(output).toContain("$102.00 x3");
    expect(output).toContain("$101.50");
  });

  it("uses cryptocurrency quote endpoint for crypto accounts", async () => {
    vi.doMock("../src/utils/selectAccount.ts", () => ({
      selectAccount: vi.fn().mockResolvedValue(cryptoAccount),
    }));
    const snaptrade = createMockSnaptrade();
    vi.mocked(snaptrade.trading.getCryptocurrencyPairQuote).mockResolvedValue({
      data: { bid: "100", ask: "102", mid: "101" },
    });
    const { quoteCommand } = await import("../src/commands/quote.ts");
    const consoleOutput = captureConsole();

    await parseCommand(quoteCommand(snaptrade), ["quote", "BTC-USD"]);

    expect(snaptrade.trading.getCryptocurrencyPairQuote).toHaveBeenCalledWith({
      userId: "user",
      userSecret: "secret",
      accountId: "crypto-account",
      instrumentSymbol: "BTC-USD",
    });
    const output = stripAnsi(consoleOutput.log.join("\n"));
    expect(output).toContain("BTC-USD");
    expect(output).toContain("100");
    expect(output).toContain("102");
    expect(output).toContain("101");
  });

  it("preserves interactive crypto pair discovery when no symbol is supplied", async () => {
    vi.doMock("../src/utils/selectAccount.ts", () => ({
      selectAccount: vi.fn().mockResolvedValue(cryptoAccount),
    }));
    const search = vi.fn().mockResolvedValue("BTC-USD");
    vi.doMock("@inquirer/prompts", () => ({ search }));
    const snaptrade = createMockSnaptrade();
    snaptrade.trading.searchCryptocurrencyPairInstruments.mockResolvedValue({
      data: { items: [{ symbol: "BTC-USD", base: "BTC", quote: "USD" }] },
    });
    snaptrade.trading.getCryptocurrencyPairQuote.mockResolvedValue({
      data: { bid: "100", ask: "102" },
    });
    const { quoteCommand } = await import("../src/commands/quote.ts");
    captureConsole();
    await parseCommand(quoteCommand(snaptrade), ["quote", "--crypto"]);
    expect(
      snaptrade.trading.searchCryptocurrencyPairInstruments,
    ).toHaveBeenCalledExactlyOnceWith({
      userId: "user",
      userSecret: "secret",
      accountId: cryptoAccount.id,
    });
    expect(search).toHaveBeenCalledTimes(1);
    expect(snaptrade.trading.getCryptocurrencyPairQuote).toHaveBeenCalledWith(
      expect.objectContaining({ instrumentSymbol: "BTC-USD" }),
    );
  });

  it.each([false, true])(
    "preserves Robinhood stock routing and uses explicit crypto context (%s)",
    async (crypto) => {
      const selectAccount = vi.fn().mockResolvedValue({
        ...equityAccount,
        institution_name: "Robinhood Agentic Trading",
      });
      vi.doMock("../src/utils/selectAccount.ts", () => ({ selectAccount }));
      const snaptrade = createMockSnaptrade();
      snaptrade.trading.getUserAccountQuotes.mockResolvedValue({ data: [] });
      snaptrade.trading.getCryptocurrencyPairQuote.mockResolvedValue({
        data: { bid: "100", ask: "102" },
      });
      const { quoteCommand } = await import("../src/commands/quote.ts");
      captureConsole();
      await parseCommand(quoteCommand(snaptrade), [
        "quote",
        ...(crypto ? ["--crypto", "BTC-USD"] : ["AAPL"]),
      ]);
      expect(selectAccount).toHaveBeenCalledWith(
        expect.objectContaining(
          crypto ? { context: "crypto_trade" } : { useLastAccount: false },
        ),
      );
      expect(
        snaptrade.trading.getCryptocurrencyPairQuote,
      ).toHaveBeenCalledTimes(crypto ? 1 : 0);
      expect(snaptrade.trading.getUserAccountQuotes).toHaveBeenCalledTimes(
        crypto ? 0 : 1,
      );
    },
  );

  it("prints the no-instruments message when equity symbol search has no instruments", async () => {
    vi.doMock("../src/utils/selectAccount.ts", () => ({
      selectAccount: vi.fn().mockResolvedValue(equityAccount),
    }));
    vi.doMock("../src/utils/withDebouncedSpinner.ts", () => ({
      withDebouncedSpinner: vi.fn(
        async (_message: string, callback: () => unknown) => callback(),
      ),
    }));
    const snaptrade = createMockSnaptrade();
    vi.mocked(
      snaptrade.connections.detailBrokerageAuthorization,
    ).mockResolvedValue({
      data: { brokerage: { display_name: "Schwab", slug: "SCHWAB" } },
    });
    vi.mocked(
      snaptrade.referenceData.listAllBrokerageInstruments,
    ).mockResolvedValue({
      data: { instruments: [] },
    });
    const { quoteCommand } = await import("../src/commands/quote.ts");
    const consoleOutput = captureConsole();

    await parseCommand(quoteCommand(snaptrade), ["quote"]);

    expect(stripAnsi(consoleOutput.error.join("\n"))).toContain(
      "No instruments found.",
    );
    expect(snaptrade.trading.getUserAccountQuotes).not.toHaveBeenCalled();
  });
});
