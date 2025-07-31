# SnapTrade CLI

This is the quickest way to get started with the [SnapTrade](https://snaptrade.com/) API. Link your own brokerage accounts, manage your portfolios, and execute live trades all from the command line!

## 🚀 Quick Start

Install the CLI globally using npm:

```bash
npm install -g @snaptrade/snaptrade-cli
```

Then run the CLI:

```bash
snaptrade
```

## 📚 Commands

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

## ☕️ Development

You need the following before getting started:

- [mise](https://mise.jdx.dev/) - manages the project specific node version

To run the cli locally:

```
npm install
npm link
snaptrade
```
