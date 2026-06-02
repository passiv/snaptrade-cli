import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Command } from "commander";
import { afterEach, vi } from "vitest";
import type { Mock } from "vitest";
import type { SnaptradeClient } from "../../src/utils/snaptradeClient.ts";

type ConsoleMethod = "log" | "error" | "warn";

export type CapturedConsole = {
  log: string[];
  error: string[];
  warn: string[];
  all: () => string;
};

const tempDirs: string[] = [];

type AsyncMock = Mock<(...args: unknown[]) => Promise<unknown>>;

type MockSnaptradeClient = SnaptradeClient & {
  authentication: SnaptradeClient["authentication"] & {
    registerSnapTradeUser: AsyncMock;
    deleteSnapTradeUser: AsyncMock;
  };
  accountInformation: SnaptradeClient["accountInformation"] & {
    listUserAccounts: AsyncMock;
    getUserAccountDetails: AsyncMock;
    getAllAccountPositions: AsyncMock;
    getUserAccountBalance: AsyncMock;
  };
  connections: SnaptradeClient["connections"] & {
    listBrokerageAuthorizations: AsyncMock;
    detailBrokerageAuthorization: AsyncMock;
  };
  referenceData: SnaptradeClient["referenceData"] & {
    getPartnerInfo: AsyncMock;
    listAllBrokerageInstruments: AsyncMock;
  };
  trading: SnaptradeClient["trading"] & {
    getUserAccountQuotes: AsyncMock;
    getCryptocurrencyPairQuote: AsyncMock;
    searchCryptocurrencyPairInstruments: AsyncMock;
    placeForceOrder: AsyncMock;
    replaceOrder: AsyncMock;
  };
};

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
  delete process.env.XDG_CONFIG_HOME;
});

export function useIsolatedConfigHome(): string {
  const dir = mkdtempSync(join(tmpdir(), "snaptrade-cli-test-"));
  tempDirs.push(dir);
  process.env.XDG_CONFIG_HOME = dir;
  return dir;
}

export function captureConsole(): CapturedConsole {
  const output: Record<ConsoleMethod, string[]> = {
    log: [],
    error: [],
    warn: [],
  };

  for (const method of Object.keys(output) as ConsoleMethod[]) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      output[method].push(args.map(String).join(" "));
    });
  }

  return {
    ...output,
    all: () => [...output.log, ...output.error, ...output.warn].join("\n"),
  };
}

export function stripAnsi(value: string): string {
  return value.replace(new RegExp(String.raw`\x1B\[[0-9;]*m`, "g"), "");
}

export function createMockSnaptrade(
  overrides: Partial<MockSnaptradeClient> = {},
): MockSnaptradeClient {
  const client = {
    authentication: {
      registerSnapTradeUser: vi.fn(),
      deleteSnapTradeUser: vi.fn(),
    },
    accountInformation: {
      listUserAccounts: vi.fn(),
      getUserAccountDetails: vi.fn(),
      getAllAccountPositions: vi.fn(),
      getUserAccountBalance: vi.fn(),
    },
    connections: {
      listBrokerageAuthorizations: vi.fn(),
      detailBrokerageAuthorization: vi.fn(),
    },
    referenceData: {
      getPartnerInfo: vi.fn(),
      listAllBrokerageInstruments: vi.fn(),
    },
    trading: {
      getUserAccountQuotes: vi.fn(),
      getCryptocurrencyPairQuote: vi.fn(),
      searchCryptocurrencyPairInstruments: vi.fn(),
      placeForceOrder: vi.fn(),
      replaceOrder: vi.fn(),
    },
    ...overrides,
  };

  return client as unknown as MockSnaptradeClient;
}

export function createProgramWithCommand(command: Command): Command {
  const program = new Command();
  program.exitOverride();
  program
    .option("--useLastAccount", "Use last account", false)
    .option("--verbose", "Enable verbose output", false);
  program.addCommand(command);
  return program;
}

export async function parseCommand(command: Command, args: string[]) {
  const program = createProgramWithCommand(command);
  await program.parseAsync(args, { from: "user" });
  return program;
}
