#!/usr/bin/env node
import { Command } from "commander";
import { Snaptrade } from "snaptrade-typescript-sdk";
import { registerCommands } from "./commands/index.ts";

const snaptrade = new Snaptrade({
  consumerKey: process.env.SNAPTRADE_CONSUMER_KEY,
  clientId: process.env.SNAPTRADE_CLIENT_ID,
});

const program = new Command();

program
  .name("snaptrade")
  .description("CLI tool to interact with SnapTrade API")
  .version("0.1.0")
  .option(
    "--useLastAccount",
    "Use the last selected account for account specific commands",
    false
  );

registerCommands(program, snaptrade);

program.parse(process.argv);
