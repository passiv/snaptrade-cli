import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  captureConsole,
  createMockSnaptrade,
  stripAnsi,
  useIsolatedConfigHome,
} from "./helpers/cli.ts";

describe("account list and selection", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("groups cached accounts by brokerage authorization while loading connection metadata", async () => {
    useIsolatedConfigHome();
    const snaptrade = createMockSnaptrade();
    vi.mocked(
      snaptrade.connections.listBrokerageAuthorizations,
    ).mockResolvedValue({
      data: [
        { id: "conn-1", brokerage: { name: "Broker One", slug: "SCHWAB" } },
        { id: "conn-2", brokerage: { name: "Broker Two", slug: "COINBASE" } },
        { id: "conn-3", brokerage: { name: "Empty", slug: "EMPTY" } },
      ],
    });
    vi.mocked(snaptrade.accountInformation.listUserAccounts).mockResolvedValue({
      data: [
        { id: "acct-1", brokerage_authorization: "conn-1" },
        { id: "acct-2", brokerage_authorization: "conn-2" },
      ],
    });

    const { listAccountsByConnection } = await import(
      "../src/utils/accounts.ts"
    );

    await expect(
      listAccountsByConnection(snaptrade, {
        userId: "user",
        userSecret: "secret",
      }),
    ).resolves.toEqual([
      {
        connection: {
          id: "conn-1",
          brokerage: { name: "Broker One", slug: "SCHWAB" },
        },
        accounts: [{ id: "acct-1", brokerage_authorization: "conn-1" }],
      },
      {
        connection: {
          id: "conn-2",
          brokerage: { name: "Broker Two", slug: "COINBASE" },
        },
        accounts: [{ id: "acct-2", brokerage_authorization: "conn-2" }],
      },
      {
        connection: { id: "conn-3", brokerage: { name: "Empty", slug: "EMPTY" } },
        accounts: [],
      },
    ]);
    expect(
      snaptrade.connections.listBrokerageAuthorizations,
    ).toHaveBeenCalledTimes(1);
    expect(snaptrade.accountInformation.listUserAccounts).toHaveBeenCalledTimes(
      1,
    );
  });

  it("preserves connection-derived disabled/read-only gating for trade selectors", async () => {
    useIsolatedConfigHome();
    vi.doMock("../src/utils/user.ts", () => ({
      loadOrRegisterUser: vi.fn().mockResolvedValue({
        userId: "user",
        userSecret: "secret",
      }),
    }));
    vi.doMock("../src/utils/accounts.ts", () => ({
      listAccountsByConnection: vi.fn().mockResolvedValue([
        {
          connection: {
            id: "disabled",
            disabled: true,
            type: "trade",
            brokerage: { name: "Disabled Broker", slug: "SCHWAB" },
          },
          accounts: [
            {
              id: "acct-disabled",
              name: "Disabled",
              institution_name: "Disabled Broker",
              balance: { total: { amount: 1, currency: "USD" } },
            },
          ],
        },
        {
          connection: {
            id: "read-only",
            disabled: false,
            type: "read",
            brokerage: { name: "Read Broker", slug: "SCHWAB" },
          },
          accounts: [
            {
              id: "acct-read",
              name: "Read Only",
              institution_name: "Read Broker",
              balance: { total: { amount: 2, currency: "USD" } },
            },
          ],
        },
        {
          connection: {
            id: "valid",
            disabled: false,
            type: "trade",
            brokerage: { name: "Valid Broker", slug: "SCHWAB" },
          },
          accounts: [
            {
              id: "acct-valid",
              name: "Valid",
              institution_name: "Valid Broker",
              balance: { total: { amount: 3, currency: "USD" } },
            },
          ],
        },
      ]),
    }));

    const selectMock = vi.fn().mockResolvedValue("acct-valid");
    vi.doMock("@inquirer/prompts", () => ({
      select: selectMock,
    }));

    const { selectAccount } = await import("../src/utils/selectAccount.ts");

    await expect(
      selectAccount({
        snaptrade: createMockSnaptrade(),
        useLastAccount: false,
        context: "equity_trade",
      }),
    ).resolves.toMatchObject({ id: "acct-valid" });

    const choices = selectMock.mock.calls[0][0].choices;
    const disabledChoice = choices.find(
      (choice: { value?: string }) => choice.value === "acct-disabled",
    );
    const readOnlyChoice = choices.find(
      (choice: { value?: string }) => choice.value === "acct-read",
    );
    const validChoice = choices.find(
      (choice: { value?: string }) => choice.value === "acct-valid",
    );
    expect(disabledChoice.disabled).toBe("Connection disabled");
    expect(readOnlyChoice.disabled).toBe("Read-only connection");
    expect(validChoice.disabled).toBe(false);
  });

  it("prints the no-valid-accounts message when crypto gating rejects all choices", async () => {
    useIsolatedConfigHome();
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });
    vi.doMock("../src/utils/user.ts", () => ({
      loadOrRegisterUser: vi.fn().mockResolvedValue({}),
    }));
    vi.doMock("../src/utils/accounts.ts", () => ({
      listAccountsByConnection: vi.fn().mockResolvedValue([
        {
          connection: {
            id: "non-crypto",
            disabled: false,
            type: "trade",
            brokerage: { name: "Equity Broker", slug: "SCHWAB" },
          },
          accounts: [
            {
              id: "acct",
              name: "Equity",
              institution_name: "Equity Broker",
              balance: { total: { amount: 1, currency: "USD" } },
            },
          ],
        },
      ]),
    }));
    vi.doMock("@inquirer/prompts", () => ({
      select: vi.fn(),
    }));
    const consoleOutput = captureConsole();

    const { selectAccount } = await import("../src/utils/selectAccount.ts");

    await expect(
      selectAccount({
        snaptrade: createMockSnaptrade(),
        useLastAccount: false,
        context: "crypto_trade",
      }),
    ).rejects.toThrow("process.exit");
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(stripAnsi(consoleOutput.error.join("\n"))).toContain(
      "No valid accounts available. Connect an account with snaptrade connect",
    );
  });
});
