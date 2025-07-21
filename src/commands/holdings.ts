import Table from "cli-table3";
import { Command } from "commander";
import { Snaptrade } from "snaptrade-typescript-sdk";
import { selectAccount } from "../utils/selectAccount.ts";
import { loadOrRegisterUser } from "../utils/user.ts";

type Holding = {
    symbol: string;
    quantity: number;
    price: string;
    value: string;
    type: string;
};

type Balance = {
    currency: string;
    cash: string;
    buyingPower: string;
};

type Order = {
    symbol: string;
    action: string;
    quantity: number;
    status: string;
    price: string;
    type: string;
};

export function holdingsCommand(snaptrade: Snaptrade): Command {
    return new Command("holdings")
        .description("List all holdings for a given account (balances, positions, and recent orders)")
        .action(async (opts, command) => {
            const user = await loadOrRegisterUser(snaptrade);
            const account = await selectAccount({
                snaptrade,
                context: "holdings",
                useLastAccount: command.parent.opts().useLastAccount,
            });

            const holdings = await snaptrade.accountInformation.getUserHoldings({
                ...user,
                accountId: account.id,
            });

            // Display account summary
            const accountName = holdings.data.account?.name || "Unknown Account";
            const institutionName = holdings.data.account?.institution_name || "Unknown Institution";
            console.log(`\n📊 Account: ${accountName}`);
            console.log(`🏦 Institution: ${institutionName}`);
            console.log(`💰 Total Value: ${holdings.data.total_value?.value?.toLocaleString("en-US", {
                style: "currency",
                currency: holdings.data.total_value?.currency || "USD",
            }) || "N/A"}\n`);

            // Display balances
            if (holdings.data.balances && holdings.data.balances.length > 0) {
                console.log("💵 Balances:");
                const balanceTable = new Table({
                    head: ["Currency", "Cash", "Buying Power"],
                });

                for (const balance of holdings.data.balances) {
                    const currencyCode = balance.currency?.code || "USD";
                    balanceTable.push([
                        currencyCode,
                        balance.cash?.toLocaleString("en-US", {
                            style: "currency",
                            currency: currencyCode,
                        }) || "N/A",
                        balance.buying_power?.toLocaleString("en-US", {
                            style: "currency",
                            currency: currencyCode,
                        }) || "N/A",
                    ]);
                }
                console.log(balanceTable.toString());
                console.log();
            }

            // Display positions
            if (holdings.data.positions && holdings.data.positions.length > 0) {
                console.log("📈 Positions:");
                const positionTable = new Table({
                    head: ["Symbol", "Quantity", "Price", "Value", "Type"],
                });

                const positions: Holding[] = [];
                for (const position of holdings.data.positions) {
                    const symbol = position.symbol?.symbol?.symbol || position.symbol?.option_symbol?.ticker || "Unknown";
                    const quantity = position.units || 0;
                    const price = position.price || 0;
                    const value = quantity * price;
                    const type = position.symbol?.option_symbol ? "Option" : "Equity";

                    positions.push({
                        symbol,
                        quantity,
                        price: price.toLocaleString("en-US", {
                            style: "currency",
                            currency: position.currency?.code || "USD",
                        }),
                        value: value.toLocaleString("en-US", {
                            style: "currency",
                            currency: position.currency?.code || "USD",
                        }),
                        type,
                    });
                }

                // Sort by symbol
                positions.sort((a, b) => a.symbol.localeCompare(b.symbol));

                for (const position of positions) {
                    positionTable.push([position.symbol, position.quantity, position.price, position.value, position.type]);
                }
                console.log(positionTable.toString());
                console.log();
            }

            // Display recent orders
            if (holdings.data.orders && holdings.data.orders.length > 0) {
                console.log("📋 Recent Orders:");
                const orderTable = new Table({
                    head: ["Symbol", "Action", "Quantity", "Status", "Price", "Type"],
                });

                const orders: Order[] = [];
                for (const order of holdings.data.orders) {
                    const symbol = order.universal_symbol?.symbol || order.option_symbol?.ticker || "Unknown";
                    const action = order.action || "Unknown";
                    const quantity = order.total_quantity || 0;
                    const status = order.status || "Unknown";
                    const price = order.execution_price || order.limit_price || 0;
                    const type = order.option_symbol ? "Option" : "Equity";

                    orders.push({
                        symbol,
                        action,
                        quantity,
                        status,
                        price: price.toLocaleString("en-US", {
                            style: "currency",
                            currency: order.quote_currency?.code || "USD",
                        }),
                        type,
                    });
                }

                // Sort by time (most recent first)
                orders.sort((a, b) => {
                    // For now, just sort by symbol since we don't have time in our simplified structure
                    return a.symbol.localeCompare(b.symbol);
                });

                for (const order of orders) {
                    orderTable.push([order.symbol, order.action, order.quantity, order.status, order.price, order.type]);
                }
                console.log(orderTable.toString());
            }

            if (!holdings.data.balances?.length && !holdings.data.positions?.length && !holdings.data.orders?.length) {
                console.log("No holdings data available for this account.");
            }
        });
} 