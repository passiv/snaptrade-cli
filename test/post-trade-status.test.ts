import { describe, expect, it, vi } from "vitest";
import { handlePostTrade } from "../src/utils/trading.ts";
import { captureConsole, createMockSnaptrade, stripAnsi } from "./helpers/cli.ts";

const response = {
  headers: { "x-request-id": "request-1" },
  data: { brokerage_order_id: "order-1" },
} as Parameters<typeof handlePostTrade>[1];

const account = {
  id: "account-1",
  institution_name: "Robinhood Agentic Trading",
  brokerage_authorization: "authorization-1",
} as Parameters<typeof handlePostTrade>[2];

const user = {
  userId: "user-1",
  userSecret: "secret-1",
} as Parameters<typeof handlePostTrade>[3];

describe("post-trade order status", () => {
  it("reads the order directly without refreshing the connection", async () => {
    const snaptrade = createMockSnaptrade();
    const refresh = vi.fn();
    Object.assign(snaptrade.connections, { refreshBrokerageAuthorization: refresh });
    vi.mocked(
      snaptrade.accountInformation.getUserAccountOrderDetail,
    ).mockResolvedValue({
      data: { status: "PENDING" },
    });
    const output = captureConsole();

    await expect(
      handlePostTrade(snaptrade, response, account, user, "trade"),
    ).resolves.toBeUndefined();

    expect(snaptrade.accountInformation.getUserAccountOrderDetail).toHaveBeenCalledWith({
      ...user,
      accountId: "account-1",
      brokerage_order_id: "order-1",
    });
    expect(stripAnsi(output.log.join("\n"))).toContain("Order ID: order-1");
    expect(output.log.join("\n")).toContain("Current order status: PENDING");
    expect(refresh).not.toHaveBeenCalled();
    expect(output.warn).toEqual([]);
  });

  it("reports a status lookup failure separately from the accepted order", async () => {
    const snaptrade = createMockSnaptrade();
    vi.mocked(
      snaptrade.accountInformation.getUserAccountOrderDetail,
    ).mockRejectedValue({ status: 503 });
    const output = captureConsole();

    await expect(
      handlePostTrade(snaptrade, response, account, user, "trade"),
    ).resolves.toBeUndefined();

    expect(output.warn.join("\n")).toContain(
      "Order status lookup failed (HTTP 503). The order request was accepted",
    );
  });
});
