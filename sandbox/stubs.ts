// JavaScript-level network stubs. Imports nothing from app/.
// This is NOT OS isolation: access via process.binding or a handle obtained
// before installNetworkStubs() runs is not covered. See design.md "Network stubs".
import NodeModule from 'node:module';

export const BLOCKED_MODULES = [
  'http',
  'https',
  'net',
  'dgram',
  'tls',
  'dns',
  'dns/promises',
] as const;

const BLOCKED_SET: ReadonlySet<string> = new Set<string>([
  ...BLOCKED_MODULES,
  ...BLOCKED_MODULES.map((m) => `node:${m}`),
]);

export function isBlockedModule(request: string): boolean {
  return BLOCKED_SET.has(request);
}

export function createNetworkBlockedError(moduleName: string): Error {
  const err = new Error(`Network access is blocked in the sandbox: ${moduleName}`);
  err.name = 'NetworkBlockedError';
  return err;
}

/** A callable proxy: calling it or reading any member's call throws NetworkBlockedError. */
export function createStub(moduleName: string): unknown {
  const name = moduleName.replace(/^node:/, '');
  const thrower = (label: string) => {
    const fn = function (): never {
      throw createNetworkBlockedError(label);
    };
    return fn;
  };
  const target = thrower(name);
  return new Proxy(target, {
    get(_t, prop) {
      // Symbols and interop probes must not look like network entry points.
      if (typeof prop === 'symbol') return undefined;
      if (prop === 'then' || prop === '__esModule') return undefined;
      return thrower(`${name}.${prop}`);
    },
    apply() {
      throw createNetworkBlockedError(name);
    },
    construct() {
      throw createNetworkBlockedError(name);
    },
  });
}

type LoadFn = (request: string, parent: unknown, isMain: boolean) => unknown;

let installed = false;

/** Install once, before the package under test loads. Idempotent. */
export function installNetworkStubs(): void {
  if (installed) return;
  installed = true;

  const Module = NodeModule as unknown as { _load: LoadFn };
  const original = Module._load;
  const cache = new Map<string, unknown>();

  Module._load = function patchedLoad(request, parent, isMain) {
    if (typeof request === 'string' && isBlockedModule(request)) {
      const key = request.replace(/^node:/, '');
      let stub = cache.get(key);
      if (stub === undefined) {
        stub = createStub(key);
        cache.set(key, stub);
      }
      return stub;
    }
    return original.call(Module, request, parent, isMain);
  };

  const fetchStub = function fetch(): never {
    throw createNetworkBlockedError('fetch');
  };
  Object.defineProperty(globalThis, 'fetch', {
    value: fetchStub,
    writable: false,
    configurable: false,
    enumerable: true,
  });
}
