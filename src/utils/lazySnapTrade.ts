import type { SnaptradeClient } from "./snaptradeClient.ts";

type Builder = () => SnaptradeClient | Promise<SnaptradeClient>;

/**
 * Create a Snaptrade object that initializes on first method call.
 * Usage: const st = createLazySnapTrade(async () => initializeSnaptrade(...));
 */
export function createLazySnapTrade(builder: Builder): SnaptradeClient {
  let ready: Promise<SnaptradeClient> | null = null;
  const ensure = () => (ready ??= Promise.resolve().then(builder));

  const proxy = (path: (string | symbol)[] = []) =>
    new Proxy(function () {}, {
      // Keep chaining properties until something is called.
      get(_t: unknown, prop: string | symbol) {
        // Make sure no one mistakes this for a Promise
        if (prop === "then" || prop === "catch" || prop === "finally")
          return undefined;
        return proxy([...path, prop]);
      },
      // When called, init (once) and invoke the real method with correct `this`.
      async apply(
        _t: unknown,
        _thisArg: unknown,
        args: unknown[],
      ): Promise<unknown> {
        const real = await ensure();
        let parent: unknown = real;
        let value: unknown = real;
        for (const key of path) {
          parent = value;
          value = (value as Record<string | symbol, unknown>)[key];
        }
        if (typeof value !== "function") {
          throw new TypeError(
            `Property ${String(path[path.length - 1])} is not a function`,
          );
        }
        return (value as (...args: unknown[]) => unknown).apply(
          parent,
          args as unknown[],
        );
      },
    });

  return proxy() as unknown as SnaptradeClient;
}
