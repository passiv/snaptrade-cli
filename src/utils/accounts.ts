import {
  Snaptrade,
  type Account,
  type BrokerageAuthorization,
} from "snaptrade-typescript-sdk";
import type { User } from "./user.ts";

export type AccountsByConnection = {
  connection: BrokerageAuthorization;
  accounts: Account[];
};

export async function listAccountsByConnection(
  snaptrade: Snaptrade,
  user: User,
): Promise<AccountsByConnection[]> {
  const connections = (
    await snaptrade.connections.listBrokerageAuthorizations(user)
  ).data;

  return Promise.all(
    connections.map(async (connection) => {
      const accounts = (
        await snaptrade.connections.listBrokerageAuthorizationAccounts({
          ...user,
          authorizationId: connection.id!,
        })
      ).data;

      return { connection, accounts };
    }),
  );
}
