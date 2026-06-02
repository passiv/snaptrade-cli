import {
  type Account,
  type BrokerageAuthorization,
} from "snaptrade-typescript-sdk";
import type { SnaptradeClient } from "./snaptradeClient.ts";
import type { User } from "./user.ts";

export type AccountsByConnection = {
  connection: BrokerageAuthorization;
  accounts: Account[];
};

export async function listAccountsByConnection(
  snaptrade: SnaptradeClient,
  user: User,
): Promise<AccountsByConnection[]> {
  const [connections, accounts] = await Promise.all([
    snaptrade.connections
      .listBrokerageAuthorizations(user)
      .then((response) => response.data),
    snaptrade.accountInformation
      .listUserAccounts(user)
      .then((response) => response.data),
  ]);

  const accountsByConnectionId = new Map<string, Account[]>();
  for (const account of accounts) {
    const connectionAccounts =
      accountsByConnectionId.get(account.brokerage_authorization) ?? [];
    connectionAccounts.push(account);
    accountsByConnectionId.set(
      account.brokerage_authorization,
      connectionAccounts,
    );
  }

  return connections.map((connection) => ({
    connection,
    accounts: connection.id
      ? (accountsByConnectionId.get(connection.id) ?? [])
      : [],
  }));
}
