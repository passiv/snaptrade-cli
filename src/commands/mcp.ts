import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Command } from "commander";
import type { OptionsPosition, Position } from "snaptrade-typescript-sdk";
import { Snaptrade } from "snaptrade-typescript-sdk";
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
          title: "List all positions",
          description:
            "List all positions across all broker accounts that the user has already configured via the SnapTrade CLI. The result can be used to calculate asset allocation. Equity, option, and crypto positions are supported.",
          inputSchema: {},
        },
        async () => {
          const accounts = (
            await snaptrade.accountInformation.listUserAccounts(user)
          ).data;
          const positionResponse = await Promise.all(
            accounts.map(
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

      // Start receiving messages on stdin and sending messages on stdout
      const transport = new StdioServerTransport();
      await server.connect(transport);
    });
}
