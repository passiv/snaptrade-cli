/** Loaded only by the local mocked-broker harness, including bin's child process. */
import { registerHooks } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import net from "node:net";
import axios from "axios";

const root = process.env.XDG_CONFIG_HOME;
if (
  process.env.CRYPTO_LOCAL_SIMULATION !== "1" ||
  !root?.includes("crypto-cli-config-")
)
  throw new Error("Executable simulation requires disposable config");
const settings = JSON.parse(
  readFileSync(join(root, "snaptrade/settings.json"), "utf8"),
);
const profile = settings.profiles.simulation;
const destination = new URL(profile.basePath);
if (
  destination.protocol !== "http:" ||
  destination.hostname !== "localhost" ||
  destination.pathname !== "/api/v1" ||
  !destination.port ||
  destination.username ||
  destination.password ||
  destination.search ||
  destination.hash ||
  profile.oauthRefreshToken
)
  throw new Error("Executable simulation requires exact local destination");

const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const value = Array.isArray(args[0]) ? args[0][0] : args[0];
  const options =
    typeof value === "object" ? value : { port: value, host: args[1] };
  if (
    !options ||
    !["localhost", "127.0.0.1", "::1"].includes(options.host || "localhost") ||
    Number(options.port) !== Number(destination.port)
  )
    throw new Error("External socket blocked in executable simulation");
  return connect.apply(this, args);
};
const fetch = globalThis.fetch;
globalThis.fetch = (resource, options) => {
  if (
    new URL(resource instanceof Request ? resource.url : resource).origin !==
    destination.origin
  )
    throw new Error("External fetch blocked in executable simulation");
  return fetch(resource, options);
};
axios.defaults.maxRedirects = 0;
const starts = new WeakMap();
const timings = [];
axios.interceptors.request.use((config) => {
  if (new URL(config.url, config.baseURL).origin !== destination.origin)
    throw new Error(
      "External SDK destination blocked in executable simulation",
    );
  starts.set(config, performance.now());
  return config;
});
function record(config, status) {
  timings.push({
    method: config.method,
    path: new URL(config.url, profile.basePath).pathname,
    status,
    ms: performance.now() - starts.get(config),
  });
}
axios.interceptors.response.use(
  (response) => {
    record(response.config, response.status);
    return response;
  },
  (error) => {
    if (error.response) record(error.config, error.response.status);
    return Promise.reject(error);
  },
);
process.on("exit", () => {
  writeFileSync(
    join(root, `executable-timings-${process.pid}.json`),
    JSON.stringify(timings),
  );
});

// Confirm only known simulated trading prompts. Never accept login/consent/selection.
const promptModule = `
export async function confirm({message}) {
  if (message !== "Are you sure you want to place this trade?" && message !== "Are you sure you want to cancel this order?")
    throw new Error("Unexpected prompt in executable simulation");
  return true;
}
export async function input() { throw new Error("Unexpected input prompt"); }
export async function password() { throw new Error("Unexpected credentials prompt"); }
export async function select() { throw new Error("Unexpected account selection prompt"); }
export async function checkbox() { throw new Error("Unexpected checkbox prompt"); }
export async function search() { throw new Error("Unexpected search prompt"); }
`;
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "@inquirer/prompts")
      return {
        url: `data:text/javascript,${encodeURIComponent(promptModule)}`,
        shortCircuit: true,
      };
    return next(specifier, context);
  },
});
