import { Snaptrade } from "snaptrade-typescript-sdk";

type Builder = () => Snaptrade | Promise<Snaptrade>;

/**
 * Create a Snaptrade object that initializes on first method call.
 * Usage: const st = createLazySnapTrade(async () => initializeSnaptrade(...));
 */
export function createLazySnapTrade(builder: Builder): Snaptrade {
  let ready: Promise<Snaptrade> | null = null;
  const ensure = () => (ready ??= Promise.resolve().then(builder));

  const proxy = (path: (string | symbol)[] = []) =>
    new Proxy(function () {}, {
      // Keep chaining properties until something is called.
      get(_t, prop) {
        // Make sure no one mistakes this for a Promise
        if (prop === "then" || prop === "catch" || prop === "finally")
          return undefined;
        return proxy([...path, prop]);
      },
      // When called, init (once) and invoke the real method with correct `this`.
      async apply(_t, _thisArg, args) {
        const real = await ensure();
        let parent: any = real;
        let value: any = real;
        for (const key of path) {
          parent = value;
          value = value[key];
        }
        if (typeof value !== "function") {
          throw new TypeError(
            `Property ${String(path[path.length - 1])} is not a function`
          );
        }
        return value.apply(parent, args);
      },
    });

  return proxy() as unknown as Snaptrade;
}
