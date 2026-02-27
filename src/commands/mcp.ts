import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Command } from "commander";
import type { OptionsPosition, Position } from "snaptrade-typescript-sdk";
import { Snaptrade } from "snaptrade-typescript-sdk";
import * as z from "zod/v4";
import { loadOrRegisterUser } from "../utils/user.ts";

export function mcpCommand(snaptrade: Snaptrade): Command {
  return new Command("mcp")
    .description("Start a local MCP server")
    .action(async () => {
      const user = await loadOrRegisterUser(snaptrade);

      const server = new McpServer({
        name: "SnapTrade MCP",
        version: "0.1.0",
      });

      server.registerTool(
        "list_connections",
        {
          title: "List all broker connections",
          description:
            "List brokerage connections that the user has already configured via the SnapTrade CLI. Connections being disabled just means the data is potentially stale and the user should reestablish the connection via the CLI. The data returned from the connection (accounts, positions, balances, orders, historical transcations, etc) are still accurate and relevant to the user.",
          inputSchema: {},
        },
        async () => {
          const connections = (
            await snaptrade.connections.listBrokerageAuthorizations(user)
          ).data;

          return {
            content: connections.map((conn) => ({
              type: "text",
              text: JSON.stringify(conn, undefined, 2),
            })),
          };
        }
      );

      server.registerTool(
        "list_accounts",
        {
          title: "List all broker accounts",
          description:
            "List all broker accounts that the user has already configured via the SnapTrade CLI. The result can be used to calculate net worth.",
          inputSchema: {},
        },
        async () => {
          const accounts = (
            await snaptrade.accountInformation.listUserAccounts(user)
          ).data;

          return {
            content: accounts.map((account) => ({
              type: "text",
              text: JSON.stringify(account, undefined, 2),
            })),
          };
        }
      );

      server.registerTool(
        "list_positions",
        {
          title: "List positions for an account",
          description:
            "List all positions for a specific broker account. The result can be used to calculate asset allocation. Equity, option, and crypto positions are supported. Use list_accounts first to get the account ID.",
          inputSchema: {
            account_id: z.string().describe("Account ID to list positions for (required)"),
          },
        },
        async (params) => {
          const accounts = (
            await snaptrade.accountInformation.listUserAccounts(user)
          ).data;

          const filteredAccounts = accounts.filter((account) => account.id === params.account_id);

          const positionResponse = await Promise.all(
            filteredAccounts.map(
              async (account) =>
                await Promise.all([
                  snaptrade.accountInformation.getUserAccountPositions({
                    ...user,
                    accountId: account.id,
                  }),
                  snaptrade.options.listOptionHoldings({
                    ...user,
                    accountId: account.id,
                  }),
                ])
            )
          );
          const positions: (Position | OptionsPosition)[] = [];
          for (const [
            equityPositionResponses,
            optionPositionResponses,
          ] of positionResponse) {
            positions.push(...equityPositionResponses.data);
            positions.push(...optionPositionResponses.data);
          }
          return {
            content: positions.map((position) => ({
              type: "text",
              text: JSON.stringify(position, undefined, 2),
            })),
          };
        }
      );

      server.registerTool(
        "refresh_connection",
        {
          title: "Refresh a broker connection",
          description:
            "Trigger a data refresh for a broker connection. This forces the broker to sync the latest account data (positions, balances, orders, etc.). Use list_connections first to get the connection ID.",
          inputSchema: {
            connection_id: z.string().describe("Connection ID to refresh (use list_connections to get the ID)"),
          },
        },
        async (params) => {
          const response =
            await snaptrade.connections.refreshBrokerageAuthorization({
              ...user,
              authorizationId: params.connection_id,
            });

          const detail = (response.data as any)?.detail;
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    status: "success",
                    connection_id: params.connection_id,
                    ...(detail ? { detail } : {}),
                  },
                  undefined,
                  2
                ),
              },
            ],
          };
        }
      );

      // Start receiving messages on stdin and sending messages on stdout
      const transport = new StdioServerTransport();
      await server.connect(transport);
    });
}
