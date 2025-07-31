# SnapTrade CLI

`snaptrade` is the quickest way to get started with the [SnapTrade](https://snaptrade.com/) API. Link your own brokerage accounts, manage your portfolios, and execute live trades all from the command line!

## 🚀 Quick Start

Install the CLI globally using npm:

```bash
npm install -g @snaptrade/snaptrade-cli
```

Then run the CLI:

```bash
snaptrade
```

When you run `snaptrade` for the first time, you need to provide your SnapTrade client ID and consumer key

<img width="1260" height="1098" src="/docs/snaptrade.png" />

---

Once the credentials are set, call `snaptrade connect` to connect a new account. This will register a new SnapTrade user and open the connection portal in your default browser.

<img width="1260" height="1098" src="/docs/snaptrade-connect.png" />

---

Once connected, call `snaptrade connections` to list all connections

<img width="1696" height="647" src="/docs/snaptrade-connections.png" />

---

Use `snaptrade positions` to list all positions for an account. You'll be prompted to select an account first.
<img width="1077" height="789" src="/docs/snaptrade-account-prompt.png" />

<img width="1042" height="1126" src="/docs/snaptrade-positions.png" />

---

To submit an equity trade, use `snaptrade trade equity`. It'll prompt you for confirmation before continuing.

You can pass `--useLastAccount` to skip the account selector and use the previously selected account instead.

<img width="1077" height="789" src="/docs/snaptrade-trade-equity.png" />

---

To submit a multi-leg option order, use `snaptrade trade option`. It'll prompt you for confirmation before continuing.

<img width="1315" height="824" src="/docs/snaptrade-trade-option.png" />

---

To cancel an order, use `snaptrade cancel-order`. It'll prompt you for confirmation before continuing.

<img width="1315" height="824" src="/docs/snaptrade-cancel-order.png" />

## 📚 Commands

```
Usage: snaptrade [options] [command]

CLI tool to interact with SnapTrade API

Options:
  -V, --version              output the version number
  --useLastAccount           Use the last selected account for account specific commands (default: false)
  --verbose                  Enable verbose output (default: false)
  -h, --help                 display help for command

Commands:
  status                     Get current status of your SnapTrade API credentials
  brokers                    List all brokers available to connect
  connect [options]          Establish a new broker connection
  reconnect [connectionId]   Re-establish an existing disabled connection
  disconnect <connectionId>  Remove an existing broker connection
  connections                List all broker connections
  accounts                   List all connected accounts
  positions [options]        List all positions for a given account
  recent-orders              List the most recent orders (within last 24 hours) for a given account
  orders                     List all orders for a given account
  instruments                Get a list of available instruments from a broker
  quote [symbols]            Get the latest market quote
  trade [options]            Execute different types of trades (equity, options, crypto)
  cancel-order [options]     Cancel an existing order
  help [command]             display help for command
```

## ☕️ Development

You need the following before getting started:

- [mise](https://mise.jdx.dev/) - manages the project specific node version

To run the cli locally:

```
npm install
npm link
snaptrade
```
