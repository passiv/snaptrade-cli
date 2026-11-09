import { readFileSync } from "node:fs";

export type OAuthPageStatus = "authorized" | "denied" | "invalid";

// Embed assets: the callback server closes after sending this one response.
const asset = (name: string) =>
  readFileSync(new URL(`../assets/oauth/${name}`, import.meta.url)).toString(
    "base64",
  );

let assets: { font: string; snaptrade: string; cli: string } | undefined;

const pages = {
  authorized: {
    title: "Authorization received",
    message: "Return to your terminal to finish signing in to SnapTrade CLI.",
    hint: "You can close this tab.",
  },
  denied: {
    title: "Authorization failed",
    message:
      "SnapTrade CLI could not complete authorization. Return to your terminal and try signing in again.",
    hint: "You can close this tab.",
  },
  invalid: {
    title: "Unable to verify this sign-in",
    message:
      "This sign-in response could not be verified. Return to your terminal and start a new sign-in.",
    hint: "You can close this tab.",
  },
} satisfies Record<
  OAuthPageStatus,
  { title: string; message: string; hint: string }
>;

export function renderOAuthPage(status: OAuthPageStatus): string {
  assets ??= {
    font: asset("PPNeueMontreal-Regular.otf"),
    snaptrade: asset("snaptrade.png"),
    cli: asset("cli.svg"),
  };
  const page = pages[status];
  const artwork =
    status === "authorized"
      ? `<div class="app-pair" role="img" aria-label="SnapTrade CLI authorization received">
        <img class="app-icon cli-icon" src="data:image/svg+xml;base64,${assets.cli}" alt="" width="64" height="64">
        <span class="connector" aria-hidden="true">
          <span class="dots"><i></i><i></i></span>
          <span class="check"><svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg></span>
          <span class="dots"><i></i><i></i></span>
        </span>
        <span class="app-icon snaptrade-icon"><img src="data:image/png;base64,${assets.snaptrade}" alt="" width="36" height="36"></span>
      </div>`
      : `<div class="status-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M10.3 4.1 2.8 17a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.7 4.1a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4m0 3h.01"/></svg>
      </div>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="referrer" content="no-referrer">
  <title>${page.title} · SnapTrade CLI</title>
  <style>
    @font-face {
      font-family: "PPNeueMontreal";
      src: url("data:font/otf;base64,${assets.font}") format("opentype");
      font-style: normal;
      font-weight: 400;
      font-display: swap;
    }
    :root {
      font-family: "PPNeueMontreal", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #202020;
      background: #fff;
      font-synthesis: none;
      -webkit-font-smoothing: antialiased;
    }
    * { box-sizing: border-box; }
    body { margin: 0; }
    ::selection { color: #045856; background: #d4f0f0; }
    main {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      place-items: center;
      min-height: 100vh;
      min-height: 100svh;
      padding: 40px 24px;
    }
    .status { width: 100%; min-width: 0; max-width: 500px; text-align: center; }
    .app-pair { display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 24px; }
    .app-icon { display: flex; align-items: center; justify-content: center; width: 64px; height: 64px; border-radius: 16px; }
    .cli-icon { display: block; }
    .snaptrade-icon, .status-icon { border: 1px solid #e8e8e8; background: #f7f7f5; }
    .snaptrade-icon img { object-fit: contain; }
    .connector, .dots { display: flex; align-items: center; }
    .connector { gap: 6px; }
    .dots { gap: 4px; }
    .dots i { width: 4px; height: 4px; border-radius: 50%; background: #c8c8c8; }
    .check { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 50%; background: #e7f6ef; color: #13935f; }
    svg { fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
    .check svg { width: 18px; height: 18px; }
    .status-icon { display: grid; place-items: center; width: 56px; height: 56px; border-radius: 16px; color: #646464; margin: 0 auto 24px; }
    .status-icon svg { width: 32px; height: 32px; }
    h1 { margin: 0 0 8px; font-size: 2rem; line-height: 1.15; font-weight: 400; letter-spacing: -0.04em; text-wrap: balance; }
    p { margin: 0 auto; max-width: 38ch; color: #666; font-size: 1rem; line-height: 1.55; text-wrap: pretty; }
    .retry { margin-top: 20px; }
    code { display: inline-block; padding: 8px 14px; border: 1px solid #e8e8e8; border-radius: 8px; background: #f7f7f5; color: #344054; font: 0.875rem/1.5 ui-monospace, SFMono-Regular, Consolas, monospace; user-select: all; }
    .hint { margin-top: 24px; font-size: 0.875rem; }
    @media (max-width: 360px) { h1 { font-size: 1.75rem; } }
  </style>
</head>
<body>
  <main>
    <section class="status" aria-labelledby="status-title">
      ${artwork}
      <h1 id="status-title">${page.title}</h1>
      <p>${page.message}</p>
      ${status === "authorized" ? "" : '<p class="retry"><code>snaptrade status</code></p>'}
      <p class="hint">${page.hint}</p>
    </section>
  </main>
</body>
</html>`;
}
