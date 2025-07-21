import Table from "cli-table3";
import { Command } from "commander";
import { Snaptrade } from "snaptrade-typescript-sdk";
import { selectAccount } from "../utils/selectAccount.ts";
import { loadOrRegisterUser } from "../utils/user.ts";

type Activity = {
    date: string;
    type: string;
    symbol: string;
    description: string;
    quantity: string;
    price: string;
    amount: string;
    fee: string;
};

export function activitiesCommand(snaptrade: Snaptrade): Command {
    return new Command("activities")
        .description("List account activities/transactions")
        .option("-s, --start-date <date>", "Start date (YYYY-MM-DD)")
        .option("-e, --end-date <date>", "End date (YYYY-MM-DD)")
        .option("-t, --type <types>", "Filter by transaction types (comma-separated)")
        .option("-l, --limit <number>", "Number of transactions to return (default: 1000, max: 1000)", "1000")
        .option("-o, --offset <number>", "Starting point for pagination (default: 0)", "0")
        .action(async (opts, command) => {
            const user = await loadOrRegisterUser(snaptrade);
            const account = await selectAccount({
                snaptrade,
                context: "activities",
                useLastAccount: command.parent.opts().useLastAccount,
            });

            // Parse options
            const limit = Math.min(parseInt(opts.limit) || 1000, 1000);
            const offset = parseInt(opts.offset) || 0;
            const startDate = opts.startDate;
            const endDate = opts.endDate;
            const type = opts.type;

            const activities = await snaptrade.accountInformation.getAccountActivities({
                ...user,
                accountId: account.id,
                startDate,
                endDate,
                offset,
                limit,
                type,
            });

            // Display summary
            const activitiesData = activities.data.data || [];
            const pagination = activities.data.pagination;
            const total = pagination?.total || 0;

            console.log(`\n📊 Account Activities`);
            console.log(`📅 Showing ${activitiesData.length} of ${total} transactions`);
            console.log(`📋 Page ${Math.floor(offset / limit) + 1} (offset: ${offset}, limit: ${limit})\n`);

            if (activitiesData.length === 0) {
                console.log("No activities found for the specified criteria.");
                return;
            }

            const formattedActivities: Activity[] = [];
            for (const activity of activitiesData) {
                const symbol = activity.symbol?.symbol || activity.option_symbol?.ticker || "N/A";
                const quantity = activity.units || 0;
                const price = activity.price || 0;
                const amount = activity.amount || 0;
                const fee = activity.fee || 0;

                // Format date
                const tradeDate = activity.trade_date ? new Date(activity.trade_date) : null;
                const dateStr = tradeDate ? tradeDate.toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                }) : "N/A";

                // Format quantity with sign
                const quantityStr = quantity !== 0 ? (quantity > 0 ? `+${quantity}` : quantity.toString()) : "N/A";

                // Format price
                const priceStr = price > 0 ? price.toLocaleString("en-US", {
                    style: "currency",
                    currency: activity.currency?.code || "USD",
                }) : "N/A";

                // Format amount with sign
                const amountStr = amount !== 0 ? (amount > 0 ? `+${amount.toLocaleString("en-US", {
                    style: "currency",
                    currency: activity.currency?.code || "USD",
                })}` : amount.toLocaleString("en-US", {
                    style: "currency",
                    currency: activity.currency?.code || "USD",
                })) : "N/A";

                // Format fee
                const feeStr = fee > 0 ? fee.toLocaleString("en-US", {
                    style: "currency",
                    currency: activity.currency?.code || "USD",
                }) : "N/A";

                formattedActivities.push({
                    date: dateStr,
                    type: activity.type || "Unknown",
                    symbol,
                    description: activity.description || "N/A",
                    quantity: quantityStr,
                    price: priceStr,
                    amount: amountStr,
                    fee: feeStr,
                });
            }

            // Sort by date (most recent first)
            formattedActivities.sort((a, b) => {
                if (a.date === "N/A" && b.date === "N/A") return 0;
                if (a.date === "N/A") return 1;
                if (b.date === "N/A") return -1;
                return new Date(b.date).getTime() - new Date(a.date).getTime();
            });

            const table = new Table({
                head: ["Date", "Type", "Symbol", "Description", "Quantity", "Price", "Amount", "Fee"],
                colWidths: [12, 15, 12, 30, 12, 12, 15, 10],
            });

            for (const activity of formattedActivities) {
                table.push([
                    activity.date,
                    activity.type,
                    activity.symbol,
                    activity.description.length > 28 ? activity.description.substring(0, 25) + "..." : activity.description,
                    activity.quantity,
                    activity.price,
                    activity.amount,
                    activity.fee,
                ]);
            }

            console.log(table.toString());

            // Show pagination info if there are more results
            const currentCount = offset + activitiesData.length;

            if (currentCount < total) {
                console.log(`\n📄 Showing ${activitiesData.length} of ${total} transactions`);
                console.log(`💡 Use --offset ${offset + limit} to see the next page`);
                console.log(`💡 Use --limit <number> to change the page size (max: 1000)`);
            }

            // Show available transaction types
            const uniqueTypes = [...new Set(formattedActivities.map(a => a.type))];
            if (uniqueTypes.length > 0) {
                console.log(`\n📋 Available transaction types: ${uniqueTypes.join(", ")}`);
                console.log(`💡 Use --type <type> to filter by specific transaction type`);
            }
        });
} 