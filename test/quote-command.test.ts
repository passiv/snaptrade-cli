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
    snaptrade.connections.detailBrokerageAuthorization.mockResolvedValue({
      data: { brokerage: {} },
    });
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
    snaptrade.connections.detailBrokerageAuthorization.mockResolvedValue({
      data: { brokerage: {} },
    });
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
    snaptrade.connections.detailBrokerageAuthorization.mockResolvedValue({
      data: { brokerage: {} },
    });
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
      snaptrade.connections.detailBrokerageAuthorization.mockResolvedValue({
        data: { brokerage: {} },
      });
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
          crypto ? { context: "crypto_quote" } : { useLastAccount: false },
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
    snaptrade.connections.detailBrokerageAuthorization.mockResolvedValue({
      data: { brokerage: {} },
    });
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

describe("mixed account quote routing", () => {
  const account = {
    ...equityAccount,
    institution_name: "Robinhood Agentic Trading",
  };
  const btc = { base: "BTC", quote: "USD", symbol: "BTC-USD" };
  let snaptrade: ReturnType<typeof createMockSnaptrade>;

  beforeEach(() => {
    vi.resetModules();
    useIsolatedConfigHome();
    vi.doMock("../src/utils/user.ts", () => ({
      loadOrRegisterUser: vi
        .fn()
        .mockResolvedValue({ userId: "user", userSecret: "secret" }),
    }));
    vi.doMock("../src/utils/selectAccount.ts", () => ({
      selectAccount: vi.fn().mockResolvedValue(account),
    }));
    snaptrade = createMockSnaptrade();
    snaptrade.connections.detailBrokerageAuthorization.mockResolvedValue({
      data: {
        brokerage: {
          slug: "ROBINHOOD-AGENTIC",
          allows_cryptocurrency_and_regular_securities: true,
        },
      },
    });
    snaptrade.trading.searchCryptocurrencyPairInstruments.mockImplementation(
      async (params) => ({
        data: {
          items: (params as { base: string }).base === "BTC" ? [btc] : [],
        },
      }),
    );
    snaptrade.trading.getCryptocurrencyPairQuote.mockResolvedValue({
      data: {
        bid: "82396.09000001",
        ask: "83965.6794085",
        mid: "83180.88470425",
        timestamp: "2026-10-07T17:46:56.622000-04:00",
      },
    });
    snaptrade.trading.getUserAccountQuotes.mockResolvedValue({ data: [] });
    captureConsole();
  });

  async function run(args: string[]) {
    const { quoteCommand } = await import("../src/commands/quote.ts");
    return parseCommand(quoteCommand(snaptrade).exitOverride(), [
      "quote",
      ...args,
    ]);
  }

  it.each(["BTC", "BTC-USD", " btc ", "btc-usd"])(
    "automatically quotes Bitcoin for %s",
    async (symbol) => {
      await run([symbol]);
      expect(
        snaptrade.trading.getCryptocurrencyPairQuote,
      ).toHaveBeenCalledExactlyOnceWith({
        userId: "user",
        userSecret: "secret",
        accountId: account.id,
        instrumentSymbol: "BTC-USD",
      });
      expect(snaptrade.trading.getUserAccountQuotes).not.toHaveBeenCalled();
      expect(
        snaptrade.trading.searchCryptocurrencyPairInstruments,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          base: "BTC",
          ...(symbol.trim().includes("-") ? { quote: "USD" } : {}),
        }),
      );
    },
  );

  it.each(["AAPL", "BRK-B", " aapl , brk-b "])(
    "keeps equity routing for %s",
    async (symbol) => {
      await run([symbol]);
      expect(snaptrade.trading.getUserAccountQuotes).toHaveBeenCalledWith(
        expect.objectContaining({
          symbols: symbol
            .split(",")
            .map((s) => s.trim().toUpperCase())
            .join(","),
          accountId: account.id,
        }),
      );
      expect(
        snaptrade.trading.getCryptocurrencyPairQuote,
      ).not.toHaveBeenCalled();
    },
  );

  it("allows the explicit BTC equity override without crypto discovery", async () => {
    await run(["--equity", "btc"]);
    expect(snaptrade.trading.getUserAccountQuotes).toHaveBeenCalledWith(
      expect.objectContaining({ symbols: "BTC" }),
    );
    expect(
      snaptrade.connections.detailBrokerageAuthorization,
    ).not.toHaveBeenCalled();
    expect(
      snaptrade.trading.searchCryptocurrencyPairInstruments,
    ).not.toHaveBeenCalled();
  });

  it("resolves a bare crypto symbol to a unique non-USD pair", async () => {
    snaptrade.trading.searchCryptocurrencyPairInstruments.mockResolvedValue({
      data: { items: [{ ...btc, quote: "CAD", symbol: "BTC-CAD" }] },
    });
    await run(["--crypto", "btc"]);
    expect(snaptrade.trading.getCryptocurrencyPairQuote).toHaveBeenCalledWith(
      expect.objectContaining({ instrumentSymbol: "BTC-CAD" }),
    );
  });

  it.each([
    { items: [] },
    { items: [btc, { ...btc, quote: "CAD", symbol: "BTC-CAD" }] },
  ])(
    "rejects missing or ambiguous explicit crypto pairs (%j)",
    async ({ items }) => {
      snaptrade.trading.searchCryptocurrencyPairInstruments.mockResolvedValue({
        data: { items },
      });
      await expect(run(["--crypto", "BTC"])).rejects.toThrow(
        items.length
          ? "Specify a pair: BTC-USD, BTC-CAD"
          : "No crypto pair found",
      );
      expect(snaptrade.trading.getUserAccountQuotes).not.toHaveBeenCalled();
      expect(
        snaptrade.trading.getCryptocurrencyPairQuote,
      ).not.toHaveBeenCalled();
    },
  );

  it("requires a currency for ambiguous automatic crypto lookup", async () => {
    snaptrade.trading.searchCryptocurrencyPairInstruments.mockResolvedValue({
      data: { items: [btc, { ...btc, quote: "CAD", symbol: "BTC-CAD" }] },
    });
    await expect(run(["BTC"])).rejects.toThrow("Ambiguous crypto symbol");
    await run(["BTC-USD"]);
    expect(snaptrade.trading.getCryptocurrencyPairQuote).toHaveBeenCalledTimes(
      1,
    );
    expect(snaptrade.trading.getUserAccountQuotes).not.toHaveBeenCalled();
  });

  it.each(["metadata", "catalog", "quote"])(
    "does not fall back to equities when %s fails",
    async (failure) => {
      const method =
        failure === "metadata"
          ? snaptrade.connections.detailBrokerageAuthorization
          : failure === "catalog"
            ? snaptrade.trading.searchCryptocurrencyPairInstruments
            : snaptrade.trading.getCryptocurrencyPairQuote;
      method.mockRejectedValue(new Error("API unavailable"));
      await expect(run(["BTC"])).rejects.toThrow("API unavailable");
      expect(snaptrade.trading.getUserAccountQuotes).not.toHaveBeenCalled();
    },
  );

  it("rejects mixed crypto/equity lists before quoting", async () => {
    await expect(run(["BTC,AAPL"])).rejects.toThrow(
      "Request crypto and equity quotes separately",
    );
    expect(snaptrade.trading.getUserAccountQuotes).not.toHaveBeenCalled();
    expect(snaptrade.trading.getCryptocurrencyPairQuote).not.toHaveBeenCalled();
  });

  it("normalizes a comma-separated crypto pair list", async () => {
    await run(["--crypto", " btc-usd , eth-usd "]);
    expect(
      snaptrade.trading.getCryptocurrencyPairQuote.mock.calls.map(
        ([args]) => args.instrumentSymbol,
      ),
    ).toEqual(["BTC-USD", "ETH-USD"]);
    expect(
      snaptrade.trading.searchCryptocurrencyPairInstruments,
    ).not.toHaveBeenCalled();
  });

  it.each([
    "",
    " ",
    "BTC,",
    ",BTC",
    "BTC,,ETH",
    "BTC-USD-extra",
    "BTC-",
    "BTC USD",
  ])("rejects malformed input %j before API calls", async (symbol) => {
    await expect(run(["--crypto", symbol])).rejects.toThrow(
      /empty|Invalid quote symbol/,
    );
    expect(
      snaptrade.connections.detailBrokerageAuthorization,
    ).not.toHaveBeenCalled();
    expect(
      snaptrade.trading.searchCryptocurrencyPairInstruments,
    ).not.toHaveBeenCalled();
    expect(snaptrade.trading.getCryptocurrencyPairQuote).not.toHaveBeenCalled();
  });

  it("preserves decimal strings and labels the account, currency and quote timestamp", async () => {
    const output = captureConsole();
    await run(["BTC"]);
    const text = stripAnsi(output.log.join("\n"));
    for (const value of [
      "82396.09000001",
      "83965.6794085",
      "83180.88470425",
      "USD",
      "2026-10-07T17:46:56.622000-04:00",
      "Crypto quotes for Robinhood Agentic Trading account",
    ])
      expect(text).toContain(value);
  });

  it("labels missing mid and timestamp explicitly", async () => {
    const output = captureConsole();
    snaptrade.trading.getCryptocurrencyPairQuote.mockResolvedValue({
      data: { bid: "1", ask: "2" },
    });
    await run(["BTC"]);
    expect(output.log.join("\n")).toContain("N/A");
    expect(output.log.join("\n")).toContain("Unavailable");
  });

  it("rejects conflicting asset overrides", async () => {
    await expect(run(["--crypto", "--equity", "BTC"])).rejects.toThrow(
      /cannot be used/,
    );
    expect(snaptrade.trading.getUserAccountQuotes).not.toHaveBeenCalled();
  });
});
