import { mkdirSync } from "fs";
import { join } from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  captureConsole,
  createMockSnaptrade,
  parseCommand,
  stripAnsi,
  useIsolatedConfigHome,
} from "./helpers/cli.ts";

// A personal api-key profile short-circuits loadOrRegisterUser, so the command
// under test never reaches the registration prompt or the network.
async function usePersonalProfile() {
  const configHome = useIsolatedConfigHome();
  mkdirSync(join(configHome, "snaptrade"), { recursive: true });
  const settings = await import("../src/utils/settings.ts");
  settings.saveProfile({ authMode: "apiKey", accountType: "personal" });
}

describe("reconnect command", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("upgrades an active read-only connection when --connection-type trade is passed", async () => {
    await usePersonalProfile();
    const handleConnect = vi.fn();
    vi.doMock("../src/utils/connect.ts", () => ({ handleConnect }));

    const snaptrade = createMockSnaptrade();
    vi.mocked(
      snaptrade.connections.listBrokerageAuthorizations,
    ).mockResolvedValue({
      data: [
        {
          id: "conn-read",
          type: "read",
          disabled: false,
          brokerage: { display_name: "Alpaca" },
        },
      ],
    });

    const { reconnectCommand } = await import("../src/commands/reconnect.ts");
    await parseCommand(reconnectCommand(snaptrade), [
      "reconnect",
      "--connection-type",
      "trade",
    ]);

    expect(handleConnect).toHaveBeenCalledTimes(1);
    expect(handleConnect.mock.calls[0][0]).toMatchObject({
      existingConnectionId: "conn-read",
      connectionType: "trade",
    });
  });

  it("forwards an explicit connection id and type without listing connections", async () => {
    await usePersonalProfile();
    const handleConnect = vi.fn();
    vi.doMock("../src/utils/connect.ts", () => ({ handleConnect }));

    const snaptrade = createMockSnaptrade();
    vi.mocked(
      snaptrade.connections.detailBrokerageAuthorization,
    ).mockResolvedValue({
      data: { brokerage: { display_name: "Alpaca", allows_trading: true } },
    });

    const { reconnectCommand } = await import("../src/commands/reconnect.ts");
    await parseCommand(reconnectCommand(snaptrade), [
      "reconnect",
      "2e582a27-82cc-4453-8b75-6a93a37b2bc8",
      "--connection-type",
      "trade",
    ]);

    expect(
      snaptrade.connections.listBrokerageAuthorizations,
    ).not.toHaveBeenCalled();
    expect(handleConnect.mock.calls[0][0]).toMatchObject({
      existingConnectionId: "2e582a27-82cc-4453-8b75-6a93a37b2bc8",
      connectionType: "trade",
    });
  });

  it("ignores healthy read-only connections when no upgrade was requested", async () => {
    await usePersonalProfile();
    const handleConnect = vi.fn();
    vi.doMock("../src/utils/connect.ts", () => ({ handleConnect }));

    const snaptrade = createMockSnaptrade();
    vi.mocked(
      snaptrade.connections.listBrokerageAuthorizations,
    ).mockResolvedValue({
      data: [
        {
          id: "conn-read",
          type: "read",
          disabled: false,
          brokerage: { display_name: "Alpaca" },
        },
      ],
    });
    const consoleOutput = captureConsole();

    const { reconnectCommand } = await import("../src/commands/reconnect.ts");
    await parseCommand(reconnectCommand(snaptrade), ["reconnect"]);

    expect(handleConnect).not.toHaveBeenCalled();
    const output = stripAnsi(consoleOutput.log.join("\n"));
    expect(output).toContain("No disabled connections found");
    // The dead end that sent SNAP-9604's reporter in circles: say what to do next.
    expect(output).toContain("snaptrade reconnect --connection-type trade");
  });

  it("refuses to upgrade a brokerage that cannot trade, instead of a raw API error", async () => {
    await usePersonalProfile();
    const handleConnect = vi.fn();
    vi.doMock("../src/utils/connect.ts", () => ({ handleConnect }));
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });

    const snaptrade = createMockSnaptrade();
    vi.mocked(
      snaptrade.connections.detailBrokerageAuthorization,
    ).mockResolvedValue({
      data: {
        brokerage: {
          display_name: "Interactive Brokers Flex",
          allows_trading: false,
        },
      },
    });
    const consoleOutput = captureConsole();

    const { reconnectCommand } = await import("../src/commands/reconnect.ts");
    await expect(
      parseCommand(reconnectCommand(snaptrade), [
        "reconnect",
        "b922c247-fe01-4a6e-b08b-48e76f96a8e8",
        "--connection-type",
        "trade",
      ]),
    ).rejects.toThrow("process.exit");
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(handleConnect).not.toHaveBeenCalled();
    expect(stripAnsi(consoleOutput.error.join("\n"))).toContain(
      "Interactive Brokers Flex does not support trading",
    );
  });

  it("skips trade-incapable brokerages when listing upgrade candidates", async () => {
    await usePersonalProfile();
    const handleConnect = vi.fn();
    vi.doMock("../src/utils/connect.ts", () => ({ handleConnect }));

    const snaptrade = createMockSnaptrade();
    vi.mocked(
      snaptrade.connections.listBrokerageAuthorizations,
    ).mockResolvedValue({
      data: [
        {
          id: "conn-flex",
          type: "read",
          disabled: false,
          brokerage: {
            display_name: "Interactive Brokers Flex",
            allows_trading: false,
          },
        },
        {
          id: "conn-alpaca",
          type: "read",
          disabled: false,
          brokerage: { display_name: "Alpaca", allows_trading: true },
        },
      ],
    });

    const { reconnectCommand } = await import("../src/commands/reconnect.ts");
    await parseCommand(reconnectCommand(snaptrade), [
      "reconnect",
      "--connection-type",
      "trade",
    ]);

    // Only one viable candidate, so it is selected without prompting.
    expect(handleConnect.mock.calls[0][0]).toMatchObject({
      existingConnectionId: "conn-alpaca",
    });
  });

  it("offers active trade connections when downgrading to read", async () => {
    await usePersonalProfile();
    const handleConnect = vi.fn();
    vi.doMock("../src/utils/connect.ts", () => ({ handleConnect }));

    const snaptrade = createMockSnaptrade();
    vi.mocked(
      snaptrade.connections.listBrokerageAuthorizations,
    ).mockResolvedValue({
      data: [
        {
          id: "conn-trade",
          type: "trade",
          disabled: false,
          brokerage: { display_name: "Alpaca", allows_trading: true },
        },
        // Already read-only: nothing to change, so it must not be a candidate.
        {
          id: "conn-read",
          type: "read",
          disabled: false,
          brokerage: { display_name: "Moomoo", allows_trading: true },
        },
      ],
    });

    const { reconnectCommand } = await import("../src/commands/reconnect.ts");
    await parseCommand(reconnectCommand(snaptrade), [
      "reconnect",
      "--connection-type",
      "read",
    ]);

    expect(handleConnect.mock.calls[0][0]).toMatchObject({
      existingConnectionId: "conn-trade",
      connectionType: "read",
    });
  });

  it("does not offer connections that already have the requested level", async () => {
    await usePersonalProfile();
    const handleConnect = vi.fn();
    vi.doMock("../src/utils/connect.ts", () => ({ handleConnect }));

    const snaptrade = createMockSnaptrade();
    vi.mocked(
      snaptrade.connections.listBrokerageAuthorizations,
    ).mockResolvedValue({
      data: [
        {
          id: "conn-trade",
          type: "trade",
          disabled: false,
          brokerage: { display_name: "Alpaca", allows_trading: true },
        },
      ],
    });
    const consoleOutput = captureConsole();

    const { reconnectCommand } = await import("../src/commands/reconnect.ts");
    await parseCommand(reconnectCommand(snaptrade), [
      "reconnect",
      "--connection-type",
      "trade",
    ]);

    expect(handleConnect).not.toHaveBeenCalled();
    expect(stripAnsi(consoleOutput.log.join("\n"))).toContain(
      "No connections found that need upgrading to trading.",
    );
  });

  it("rejects an unknown connection type", async () => {
    await usePersonalProfile();
    vi.doMock("../src/utils/connect.ts", () => ({ handleConnect: vi.fn() }));
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });
    const consoleOutput = captureConsole();

    const { reconnectCommand } = await import("../src/commands/reconnect.ts");
    await expect(
      parseCommand(reconnectCommand(createMockSnaptrade()), [
        "reconnect",
        "--connection-type",
        "trade-if-available",
      ]),
    ).rejects.toThrow("process.exit");
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(stripAnsi(consoleOutput.error.join("\n"))).toContain(
      "Allowed values are: read, trade",
    );
  });
});

describe("handleConnect connection type", () => {
  beforeEach(() => {
    // The reconnect suite above doMocks this module and the registration
    // outlives resetModules, so drop it before exercising the real thing.
    vi.doUnmock("../src/utils/connect.ts");
    vi.resetModules();
  });

  async function callHandleConnect(args: Record<string, unknown>) {
    vi.doMock("open", () => ({ default: vi.fn() }));
    vi.useFakeTimers();
    const loginSnapTradeUser = vi.fn().mockResolvedValue({
      data: { redirectURI: "https://app.snaptrade.com/portal?token=t" },
    });
    const snaptrade = createMockSnaptrade({
      authentication: { loginSnapTradeUser },
    } as never);
    vi.mocked(
      snaptrade.connections.listBrokerageAuthorizations,
    ).mockResolvedValue({ data: [] });
    captureConsole();

    const { handleConnect } = await import("../src/utils/connect.ts");
    await handleConnect({ snaptrade, user: {}, ...args });
    vi.clearAllTimers();
    vi.useRealTimers();

    return loginSnapTradeUser.mock.calls[0][0] as Record<string, unknown>;
  }

  it("keeps the existing type when reconnecting without an explicit type", async () => {
    const payload = await callHandleConnect({
      existingConnectionId: "conn-1",
    });
    expect(payload.reconnect).toBe("conn-1");
    expect(payload.connectionType).toBeUndefined();
  });

  it("forwards an explicit type on reconnect so read-only can be upgraded", async () => {
    const payload = await callHandleConnect({
      existingConnectionId: "conn-1",
      connectionType: "trade",
    });
    expect(payload.connectionType).toBe("trade");
  });

  it("still defaults new connections to trade-if-available", async () => {
    const payload = await callHandleConnect({});
    expect(payload.connectionType).toBe("trade-if-available");
  });
});
