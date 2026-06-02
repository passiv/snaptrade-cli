import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  captureConsole,
  createMockSnaptrade,
  parseCommand,
  stripAnsi,
  useIsolatedConfigHome,
} from "./helpers/cli.ts";

describe("positions command regressions", () => {
  beforeEach(() => {
    vi.resetModules();
    useIsolatedConfigHome();
    vi.doMock("ora", () => ({
      default: vi.fn(() => ({
        start: vi.fn().mockReturnThis(),
        stop: vi.fn(),
        text: "",
      })),
    }));
    vi.doMock("../src/utils/user.ts", () => ({
      loadOrRegisterUser: vi.fn().mockResolvedValue({
        userId: "user",
        userSecret: "secret",
      }),
    }));
  });

  it("aggregates all-account positions and falls back to brokerage prices when Yahoo has no quote", async () => {
    vi.doMock("../src/utils/accounts.ts", () => ({
      listAccountsByConnection: vi.fn().mockResolvedValue([
        {
          connection: { id: "conn-1", brokerage: { slug: "SCHWAB" } },
          accounts: [{ id: "acct-1" }, { id: "acct-2" }],
        },
      ]),
    }));
    vi.doMock("../src/utils/quotes.ts", () => ({
      getLastQuotes: vi.fn().mockResolvedValue({}),
    }));

    const snaptrade = createMockSnaptrade();
    vi.mocked(
      snaptrade.accountInformation.getAllAccountPositions,
    ).mockImplementation(async (request) => {
      const { accountId } = request as { accountId: string };
      return {
        data: {
          results:
            accountId === "acct-1"
              ? [
                  {
                    units: 1,
                    cost_basis: 100,
                    price: 100,
                    currency: "USD",
                    instrument: {
                      kind: "equity",
                      raw_symbol: "AAPL",
                      symbol: "AAPL",
                      currency: "USD",
                    },
                  },
                ]
              : [
                  {
                    units: 2,
                    cost_basis: 100,
                    price: 100,
                    currency: "USD",
                    instrument: {
                      kind: "equity",
                      raw_symbol: "AAPL",
                      symbol: "AAPL",
                      currency: "USD",
                    },
                  },
                ],
        },
      };
    });

    const { positionsCommand } = await import("../src/commands/positions.ts");
    const consoleOutput = captureConsole();

    await parseCommand(positionsCommand(snaptrade), ["positions", "--all"]);

    const output = stripAnsi(consoleOutput.log.join("\n"));
    expect(output).toContain("AAPL");
    expect(output).toContain("3");
    expect(output).toContain("$100.00");
    expect(output).toContain("$300.00");
    expect(output).toContain("$0.00");
    expect(snaptrade.accountInformation.getAllAccountPositions).toHaveBeenCalledTimes(
      2,
    );
  });
});

describe("Yahoo quote helpers", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("../src/utils/quotes.ts");
    vi.doUnmock("../src/utils/yahooFinance.ts");
  });

  it("maps sanitized symbols like BRK.B back to original quote keys", async () => {
    const quoteMock = vi.fn().mockResolvedValue({
      "BRK-B": { regularMarketPrice: 430.12, currency: "USD" },
    });
    vi.doMock("../src/utils/yahooFinance.ts", () => ({
      yf: { quote: quoteMock },
    }));

    const { getLastQuotes } = await import("../src/utils/quotes.ts");

    await expect(getLastQuotes(["BRK.B"])).resolves.toEqual({
      "BRK.B": { last: 430.12, currency: "USD" },
    });
    expect(quoteMock).toHaveBeenCalledWith(
      ["BRK-B"],
      expect.objectContaining({ return: "object" }),
      expect.objectContaining({ validateResult: false }),
    );
  });
});
