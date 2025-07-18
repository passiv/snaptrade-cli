# Get Started

You need the following before getting started:

- [mise](https://mise.jdx.dev/) - manages the project specific node version

To run the cli locally:

```
# Install package dependencies
npm install
# Symlinks the snaptrade binary
npm link
# Invoke the CLI
snaptrade
```

---

When you run `snaptrade` for the first time, you need to provide your SnapTrade client ID and consumer key

<img width="1260" height="1098" alt="Screenshot 2025-07-17 at 6 04 40 PM" src="https://github.com/user-attachments/assets/649afa6e-db29-44e7-ba18-119c0a54e9ee" />


---

Once the credentials are set, call `snaptrade connect` to connect a new account. This will register a new SnapTrade user and open the connection portal in your default browser.

<img width="1260" height="1098" alt="Screenshot 2025-07-17 at 6 07 28 PM" src="https://github.com/user-attachments/assets/ee197094-fa73-4397-aa70-6372a16dea55" />


---

Once connected, call `snaptrade connections` to list all connections

<img width="1696" height="647" alt="Screenshot 2025-07-17 at 6 10 19 PM" src="https://github.com/user-attachments/assets/a2de8dae-0dcd-4d58-a23e-31013fa68d46" />


---

Use `snaptrade positions` to list all positions for an account. You'll be prompted to select an account first.
<img width="1077" height="789" alt="Screenshot 2025-07-17 at 6 13 45 PM" src="https://github.com/user-attachments/assets/bd1680c3-bdab-4e83-a9d8-0ea17c07e476" />

<img width="1042" height="1126" alt="Screenshot 2025-07-17 at 6 12 10 PM" src="https://github.com/user-attachments/assets/213d30d8-e55d-46d9-ac34-93bab92e4b98" />


---

To submit an equity trade, use `snaptrade trade equity`. It'll prompt you for confirmation before continuing.

You can pass `--useLastAccount` to skip the account selector and use the last previously selected account instead. 

<img width="1077" height="789" alt="Screenshot 2025-07-17 at 6 17 31 PM" src="https://github.com/user-attachments/assets/ba89a3ae-032c-4fe9-a427-8f95ebd7fb4b" />

---

To submit a multi-leg option order, use `snaptrade trade option`. It'll prompt you for confirmation before continuing.

<img width="1315" height="824" alt="Screenshot 2025-07-17 at 6 21 01 PM" src="https://github.com/user-attachments/assets/8b70284f-6024-4d52-bacf-22cce37a5f79" />

---

To cancel an order, use `snaptrade cancel-order`. It'll prompt you for confirmation before continuing.

<img width="1315" height="824" alt="Screenshot 2025-07-17 at 6 22 14 PM" src="https://github.com/user-attachments/assets/e46f168e-1387-430c-8061-952d69e2c545" />

