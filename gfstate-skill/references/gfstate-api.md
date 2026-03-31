# gfstate() API Reference

## Function Signature

```typescript
function gfstate<Data, ExcludeKeys extends keyof Data, Computed>(
  paramData: Data | (() => Data),
  options?: Options<Data, ExcludeKeys, Computed>,
): StoreWithComputed<Data, ExcludeKeys, Computed>;
```

### Parameters

- **paramData**: A plain object or a factory function returning a plain object. Must be a plain object (`Object.getPrototypeOf(obj) === Object.prototype` or `null`). Class instances will throw an error.
- **options**: Optional configuration object.

### Return Value

A `Proxy`-based store that is both:

- An object — read/write properties directly: `store.count`, `store.count = 5`
- A callable function — update via: `store('key', val)`, `store({...})`, `store(fn)`

## Options Interface

```typescript
interface Options<Data, ExcludeKeys, Computed> {
  computed?: Computed & Record<string, (state: Data) => any>;
  watch?: Partial<
    Record<keyof Data, (newVal: any, oldVal: any, store: Store<Data>) => void>
  >;
  created?: (store: Store<Data>) => void;
  noGfstateKeys?: ExcludeKeys[];
  plugins?: GfstatePlugin[];
  storeName?: string;
}
```

### computed

Define derived values that auto-cache and recalculate only when their dependencies change.

```tsx
const store = gfstate(
  { price: 100, quantity: 3, taxRate: 0.1 },
  {
    computed: {
      subtotal: (state) => state.price * state.quantity,
      tax: (state) => state.price * state.quantity * state.taxRate,
      total: (state) => state.price * state.quantity * (1 + state.taxRate),
    },
  },
);

// Read: store.subtotal, store.tax, store.total
// Computed properties appear in Object.keys(store)
```

**Rules:**

- Read-only — assigning to a computed property throws in development mode
- Dependencies are auto-tracked via a lightweight Proxy during first evaluation
- Supports depending on other computed properties (must be defined in dependency order) and nested child store properties
- Dynamic dependency re-subscription: if a computed conditionally reads different keys, new dependencies are automatically subscribed on recompute
- If a dependency key conflicts with a state key, a warning is logged in dev mode

### watch

Execute callbacks when specific state properties change:

```tsx
const store = gfstate(
  { count: 0, name: 'Alice' },
  {
    watch: {
      count: (newVal, oldVal, store) => {
        console.log(`count: ${oldVal} -> ${newVal}`);
        // store is the full store instance
      },
      name: (newVal, oldVal) => {
        document.title = newVal;
      },
    },
  },
);
```

**Rules:**

- Only fires when value actually changes (referential equality `===`)
- Monitors state properties, computed properties, and nested child store keys
- Watching a non-existent key logs a warning in dev mode
- Errors in watch callbacks are caught and logged, not propagated

### created

Lifecycle hook that runs once after store creation:

```tsx
const store = gfstate(
  { users: [] as User[], loading: false },
  {
    created: async (store) => {
      store.loading = true;
      const res = await fetch('/api/users');
      store.users = await res.json();
      store.loading = false;
    },
  },
);
```

### noGfstateKeys

Prevent specific object-type keys from being auto-wrapped as child stores:

```tsx
const store = gfstate(
  {
    formData: { name: '', email: '' }, // auto-wrapped as child store
    config: { theme: 'dark', locale: 'en' }, // treated as plain value
  },
  { noGfstateKeys: ['config'] as const },
);

// formData is a child store — store.formData.name = 'Bob' triggers re-render
// config is NOT a child store — must replace entirely: store.config = { ...newConfig }
```

Use cases: third-party data objects, configuration objects, form schemas.

## Data Type Behaviors

| Type                          | Behavior                                               | Update Method           |
| ----------------------------- | ------------------------------------------------------ | ----------------------- |
| `string`, `number`, `boolean` | Direct state, per-property subscription                | `store.key = newVal`    |
| `null`, `undefined`           | Direct state                                           | `store.key = newVal`    |
| `bigint`                      | Direct state                                           | `store.key = newVal`    |
| `symbol`                      | State, but **WARNING**: each access triggers re-render | Avoid using             |
| Plain object `{}`             | Auto-wrapped as child gfstate store                    | `store.child.key = val` |
| Array `[]`                    | Reference comparison                                   | Replace entire array    |
| Function                      | Wrapped as action (stable reference)                   | `store.fn = newFn`      |
| `Date`, `RegExp`              | Stored as-is, reference comparison                     | Replace entire object   |
| `Map`, `Set`                  | Stored as-is, reference comparison                     | Replace entire object   |
| `Promise`                     | Stored as-is                                           | Replace entirely        |
| React Element                 | Stored as-is                                           | Replace entirely        |
| Class instance                | **Throws error** at creation                           | Use plain objects       |
| `Object.create(null)`         | Treated as plain object, auto-wrapped                  | Same as plain object    |

## Static Method: gfstate.config()

```typescript
gfstate.config({ batch: (fn: () => void) => void });
```

Configure a batching function for coalescing multiple synchronous state updates:

```tsx
import ReactDOM from 'react-dom';
import { gfstate } from 'gfstate';

// Call once at app entry
gfstate.config({ batch: ReactDOM.unstable_batchedUpdates });
```

## Dynamic Property Addition

Properties can be added at runtime. If a component reads a key before it exists, it subscribes to that key and re-renders when the key is later set:

```tsx
const store = gfstate({ count: 0 }) as any;

// Later, in a handler or effect:
store.newProp = 'hello';
// Components reading store.newProp will re-render
```

## EMPTY_ARRAY Constant

When initializing state with `[]`, gfstate replaces it with a shared `EMPTY_ARRAY` constant for reference stability:

```tsx
import { EMPTY_ARRAY } from 'gfstate';

const store = gfstate({ items: [] });
console.log(store.items === EMPTY_ARRAY); // true (outside React)
```

## syncWrapper

Execute a function synchronously at init time and use its return value as state (instead of treating it as an action):

```typescript
function syncWrapper<T>(fn: () => T): T;
```

```tsx
import { gfstate, syncWrapper } from 'gfstate';

const store = gfstate({
  // Without syncWrapper: gfstate treats this as an action (function)
  // With syncWrapper: gfstate uses the return value (499500) as initial state
  total: syncWrapper(() => {
    let sum = 0;
    for (let i = 0; i < 1000; i++) sum += i;
    return sum;
  }),
});
```

## isGfstateStore

```typescript
function isGfstateStore(obj: any): obj is Store<Record<string, unknown>>;
```

Runtime type guard to check if an object is a gfstate store:

```tsx
import { gfstate, isGfstateStore } from 'gfstate';

const store = gfstate({ count: 0 });
isGfstateStore(store); // true
isGfstateStore({}); // false
isGfstateStore(store.nested); // true (if nested is a plain object)
```

## store.subscribe() — External Subscription

Subscribe to store changes from outside React components. Supports state, computed, and nested child store changes.

```typescript
type SubscribeFn = {
  (cb: (key: string, newVal: unknown, oldVal: unknown) => void): () => void;
  (key: string, cb: (newVal: unknown, oldVal: unknown) => void): () => void;
};
```

### Listen to all changes

```tsx
const store = gfstate(
  { count: 0, nested: { x: 1 } },
  {
    computed: { double: (s) => s.count * 2 },
  },
);

const unsub = store.subscribe((key, newVal, oldVal) => {
  console.log(`${key}: ${oldVal} → ${newVal}`);
});

store.count = 1; // logs "count: 0 → 1" and "double: 0 → 2"
store.nested.x = 2; // logs "nested.x: 1 → 2"

unsub(); // unsubscribe
```

### Listen to a specific key

```tsx
store.subscribe('count', (newVal, oldVal) => {
  console.log(`count: ${oldVal} → ${newVal}`);
});

// Nested child store changes use dot-path keys
store.subscribe('nested.x', (newVal, oldVal) => { ... });
```

**Rules:**

- `subscribe` is a reserved property name — cannot be used as a state key
- `reset`, `destroy`, and `snapshot` are also reserved property names
- Returns an unsubscribe function
- Nested child store changes use dot-notation key path (e.g. `nested.x`)

## store.reset() — Reset State

Resets state to the deep-cloned initial data. Triggers computed recalculation and watch callbacks.

```typescript
type ResetFn = {
  (): void; // reset all keys
  (key: string): void; // reset a single key
};
```

### Reset all keys

```tsx
const store = gfstate({ count: 0, name: 'Alice', nested: { x: 1 } });

store.count = 99;
store.name = 'Bob';
store.nested.x = 42;

store.reset();
// count === 0, name === 'Alice', nested.x === 1
```

### Reset a single key

```tsx
store.count = 50;
store.name = 'Charlie';

store.reset('count');
// count === 0, name still 'Charlie'
```

**Rules:**

- Deep clones the initial data — original init values are never mutated
- Triggers computed recalculation for any computed properties depending on the reset keys
- Triggers watch callbacks for any watched keys whose values changed
- Nested child stores are recursively reset (their initial data is preserved independently)
- No-op if the current value is already equal to the initial value
- Calling `reset()` on a destroyed store produces a dev warning and is a no-op
- `reset` is a reserved property name — cannot be used as a state key

## store.destroy() — Clean Up Store

Cleans up all subscriptions, watch listeners, computed listeners, and internal state. Use this to free resources when a store is no longer needed.

```typescript
type DestroyFn = () => void;
```

### Usage

```tsx
const store = gfstate(
  { count: 0, nested: { x: 1 } },
  {
    computed: { double: (s) => s.count * 2 },
    watch: {
      count: (newVal) => console.log('count changed to', newVal),
    },
  },
);

const unsub = store.subscribe((key, newVal) => {
  console.log(`${key} = ${newVal}`);
});

// Later, when the store is no longer needed:
store.destroy();

// After destroy:
store.count; // dev warning, returns undefined
store.count = 5; // dev warning, no-op
store.reset(); // dev warning, no-op
store.snapshot(); // dev warning, returns {}
```

**Rules:**

- Removes all watch listeners, computed listeners, and external subscriptions
- Recursively destroys nested child stores
- Marks the store as destroyed; subsequent reads and writes produce dev warnings
- Idempotent — safe to call multiple times, second call is a no-op
- `destroy` is a reserved property name — cannot be used as a state key

## store.snapshot() — Deep Clone Current State

Returns a deep-cloned plain JS object of the current store state. The returned object has no Proxy and is safe to serialize, log, or send over the network.

```typescript
type SnapshotFn = () => Record<string, unknown>;
```

### Usage

```tsx
const store = gfstate(
  { count: 0, name: 'Alice', nested: { x: 1 }, ref: { timerId: null } },
  {
    computed: {
      double: (s) => s.count * 2,
      greeting: (s) => `Hello, ${s.name}`,
    },
  },
);

store.count = 5;
store.nested.x = 10;

const snap = store.snapshot();
// {
//   count: 5,
//   name: 'Alice',
//   nested: { x: 10 },
//   double: 10,
//   greeting: 'Hello, Alice',
//   ref: { timerId: null },
// }

// Safe to serialize
JSON.stringify(snap);

// Mutating the snapshot does NOT affect the store
snap.count = 999;
// store.count is still 5
```

**Rules:**

- Includes all state values, computed values, nested child store values, and `ref` values
- Nested child stores are recursively snapshot'd into plain objects
- The returned object has no Proxy — it is a fully independent deep clone
- Mutating the snapshot does not affect the store
- Returns `{}` if the store is destroyed
- `snapshot` is a reserved property name — cannot be used as a state key

## Exported Symbols: RESET, DESTROY, SNAPSHOT

Symbol identifiers for programmatic access to the Phase 2 methods on store instances:

```typescript
import { RESET, DESTROY, SNAPSHOT } from 'gfstate';

const store = gfstate({ count: 0 });

// Equivalent to store.reset()
store[RESET]();

// Equivalent to store.destroy()
store[DESTROY]();

// Equivalent to store.snapshot()
store[SNAPSHOT]();
```

These symbols are useful when writing generic utilities that operate on any gfstate store without relying on string property names.

## Core Types

```typescript
// The store type — data properties + callable setter
type Store<Data> = Data & {
  <K extends keyof Data>(
    key: K,
    val: Data[K] | ((prev: Data[K]) => Data[K]),
  ): void;
  (payload: Partial<Data> | ((prev: Data) => Partial<Data>)): void;
};

// Recursive transform: plain object values become Store<TransformData<...>>
type TransformData<Data, ExcludeKeys = never> = {
  [K in keyof Data]: K extends 'ref' | ExcludeKeys
    ? Data[K]
    : IsPlainObject<Data[K]> extends true
    ? Store<TransformData<Data[K], ExcludeKeys>>
    : Data[K];
};

// Store with computed properties added as readonly
type StoreWithComputed<Data, ExcludeKeys, Computed> = Store<
  TransformData<Data, ExcludeKeys>
> &
  Readonly<{
    [K in keyof Computed]: Computed[K] extends (...args: any) => infer R
      ? R
      : never;
  }>;
```

## Multi-Component Sharing Pattern

```tsx
// store.ts — create once, import everywhere
import { gfstate } from 'gfstate';

export const appStore = gfstate({
  user: { name: '', role: '' },
  theme: 'light' as 'light' | 'dark',
  toggleTheme() {
    appStore.theme = appStore.theme === 'light' ? 'dark' : 'light';
  },
});

// Header.tsx — only re-renders when theme changes
import { appStore } from './store';
function Header() {
  return <header className={appStore.theme}>...</header>;
}

// Profile.tsx — only re-renders when user changes
import { appStore } from './store';
function Profile() {
  return <div>{appStore.user.name}</div>;
}
```

## Circular Reference Handling

gfstate detects circular references via a WeakSet and treats them as plain state values (no recursive wrapping):

```tsx
const obj: any = { name: 'root' };
obj.self = obj; // circular
const store = gfstate(obj);
// store.self is stored as a plain value, not wrapped
```

## Plugin System

gfstate provides a flexible plugin system that lets you inject logic at various store lifecycle points. Plugins can be registered globally (affecting all stores) or per-store.

### GfstatePlugin Interface

```typescript
interface GfstatePlugin {
  /** Unique plugin name — used for deduplication and debugging */
  name: string;

  /** Called after store creation (after the `created` lifecycle hook).
   *  Can optionally return a cleanup function that runs on destroy. */
  onInit?: (context: PluginContext) => void | (() => void);

  /** Called before a state value is set.
   *  - Return void: no intervention, value is set as-is
   *  - Return { value: X }: replace the value being set with X
   *  - Return false: cancel this set operation entirely */
  onBeforeSet?: (
    key: string,
    newVal: unknown,
    oldVal: unknown,
    context: PluginContext,
  ) => void | { value: unknown } | false;

  /** Called after a state value has been set (after UI update and global listeners) */
  onAfterSet?: (
    key: string,
    newVal: unknown,
    oldVal: unknown,
    context: PluginContext,
  ) => void;

  /** Called when store.subscribe() is invoked.
   *  key is null for global subscriptions, or the key string for specific subscriptions */
  onSubscribe?: (
    key: string | null,
    context: PluginContext,
  ) => void;

  /** Called when the store is destroyed (before subscription cleanup) */
  onDestroy?: (context: PluginContext) => void;
}
```

### PluginContext Interface

```typescript
interface PluginContext {
  /** The store instance */
  store: any;
  /** Store name (from options.storeName, defaults to 'anonymous') */
  storeName: string;
  /** Get a deep-cloned snapshot of current state */
  getSnapshot: () => Record<string, unknown>;
  /** Get a deep-cloned copy of initial data */
  getInitialData: () => Record<string, unknown>;
}
```

### Global vs Per-Store Plugins

```tsx
import { gfstate } from 'gfstate';
import type { GfstatePlugin } from 'gfstate';

const myPlugin: GfstatePlugin = {
  name: 'my-plugin',
  onAfterSet(key, newVal, oldVal, ctx) {
    console.log(`[${ctx.storeName}] ${key} changed`);
  },
};

// Global registration — all stores created after this call get this plugin
gfstate.use(myPlugin);

// Per-store registration — only this specific store
const store = gfstate(
  { count: 0 },
  {
    plugins: [myPlugin],
    storeName: 'counter', // optional: identifies this store in plugins
  },
);
```

### Static Methods

#### gfstate.use(plugin)

Register a global plugin. All stores created after this call will include the plugin. Duplicate registrations (same `name`) are silently skipped.

```tsx
gfstate.use(myPlugin);
```

#### gfstate.clearPlugins()

Clear all global plugins. Primarily for testing:

```tsx
beforeEach(() => {
  gfstate.clearPlugins();
});
```

### Execution Order

1. Global plugins execute before per-store plugins
2. Within each group, plugins execute in registration order
3. For `onBeforeSet`: if any plugin returns `false`, the set is cancelled and no subsequent plugins run; if a plugin returns `{ value: X }`, subsequent plugins see `X` as the new value

### Plugin Deduplication

Plugins with the same `name` are not registered twice. This applies both globally and within a single store:

```tsx
gfstate.use(logger()); // registers 'gfstate:logger'
gfstate.use(logger()); // skipped — already registered

const store = gfstate(
  { count: 0 },
  { plugins: [logger()] }, // also skipped if globally registered
);
```

### onInit — Initialization Hook

Called after the store is fully created (after the `created` lifecycle). Can return a cleanup function that is called automatically during `destroy()`:

```tsx
const timerPlugin: GfstatePlugin = {
  name: 'auto-save',
  onInit(ctx) {
    const timer = setInterval(() => {
      console.log('Current state:', ctx.getSnapshot());
    }, 5000);

    // Cleanup function — called on store.destroy()
    return () => clearInterval(timer);
  },
};
```

### onBeforeSet — Intercept / Validate / Transform

The most powerful hook — intercept a value before it is actually set. Use cases: validation, clamping, transformation, cancellation.

```tsx
const clampPlugin: GfstatePlugin = {
  name: 'clamp',
  onBeforeSet(key, newVal, oldVal, ctx) {
    if (key === 'percentage' && typeof newVal === 'number') {
      if (newVal < 0) return { value: 0 };     // clamp to min
      if (newVal > 100) return { value: 100 };  // clamp to max
    }
    // Return void (or undefined) to not intervene
  },
};

const readonlyPlugin: GfstatePlugin = {
  name: 'readonly',
  onBeforeSet(key) {
    if (key === 'id') return false; // prevent setting 'id'
  },
};
```

### onAfterSet — Post-Set Hook

Called after the value has been set and UI updates have been triggered:

```tsx
const auditPlugin: GfstatePlugin = {
  name: 'audit',
  onAfterSet(key, newVal, oldVal, ctx) {
    auditLog.push({
      store: ctx.storeName,
      key,
      from: oldVal,
      to: newVal,
      timestamp: Date.now(),
    });
  },
};
```

### onSubscribe — Subscription Monitoring

Called when `store.subscribe()` is invoked. `key` is `null` for global subscriptions:

```tsx
const monitorPlugin: GfstatePlugin = {
  name: 'monitor',
  onSubscribe(key, ctx) {
    console.log(
      key === null
        ? `[${ctx.storeName}] new global subscription`
        : `[${ctx.storeName}] new subscription: ${key}`,
    );
  },
};
```

### onDestroy — Cleanup Hook

Called when `store.destroy()` is invoked, before subscriptions are cleaned up:

```tsx
const finalSavePlugin: GfstatePlugin = {
  name: 'final-save',
  onDestroy(ctx) {
    const finalState = ctx.getSnapshot();
    localStorage.setItem('backup', JSON.stringify(finalState));
  },
};
```

### Error Handling

Plugin hook errors are caught and logged in development mode. They never propagate to user code or break the store:

```tsx
const buggyPlugin: GfstatePlugin = {
  name: 'buggy',
  onAfterSet() {
    throw new Error('oops');
    // In dev: console.error('gfstate 插件 "buggy" onAfterSet 执行出错:', Error)
    // In prod: silently caught
  },
};
```

## Built-in Plugins

All built-in plugins are imported directly from `'gfstate'`.

### logger(options?)

Logs state changes to the console with timestamps, old/new values, and store name.

```typescript
import { logger } from 'gfstate';
import type { LoggerOptions } from 'gfstate';
```

```tsx
const store = gfstate(
  { count: 0, name: 'Alice', internal: '' },
  {
    plugins: [
      logger({
        include: ['count', 'name'], // only log these keys
        collapsed: true,             // use groupCollapsed (default)
        timestamp: true,             // include time (default)
      }),
    ],
    storeName: 'app',
  },
);
```

#### LoggerOptions

```typescript
interface LoggerOptions {
  /** Only log changes to these keys */
  include?: string[];
  /** Exclude these keys from logging */
  exclude?: string[];
  /** Use collapsed console group, default true */
  collapsed?: boolean;
  /** Custom logger object (must have log, group, groupCollapsed, groupEnd) */
  logger?: {
    log: (...args: any[]) => void;
    group: (...args: any[]) => void;
    groupCollapsed: (...args: any[]) => void;
    groupEnd: () => void;
  };
  /** Enable/disable, default true */
  enabled?: boolean;
  /** Custom format function — replaces the default group output */
  formatter?: (key: string, newVal: unknown, oldVal: unknown) => string;
  /** Include timestamp, default true */
  timestamp?: boolean;
}
```

Key matching supports dot-paths: `include: ['user']` matches `user`, `user.name`, `user.address.city`.

### persist(options)

Automatically saves store state to storage (localStorage by default) and restores it on page load. Supports version migration, key filtering, custom serialization, and async storage adapters.

```typescript
import { persist } from 'gfstate';
import type { PersistOptions, StorageAdapter } from 'gfstate';
```

```tsx
const store = gfstate(
  { theme: 'light', fontSize: 14, tempData: null },
  {
    plugins: [
      persist({
        key: 'app-settings',
        include: ['theme', 'fontSize'], // don't persist tempData
        version: 2,
        migrate: (oldState, oldVersion) => {
          if (oldVersion < 2) {
            return { ...oldState, fontSize: oldState.fontSize ?? 14 };
          }
          return oldState;
        },
        onRehydrated: (state) => {
          console.log('Restored state:', state);
        },
      }),
    ],
  },
);
```

#### PersistOptions

```typescript
interface PersistOptions {
  /** Storage key (required) */
  key: string;
  /** Storage adapter, defaults to localStorage */
  storage?: StorageAdapter;
  /** Only persist these keys */
  include?: string[];
  /** Exclude these keys */
  exclude?: string[];
  /** State version number, default 0 */
  version?: number;
  /** Migration function — called when stored version doesn't match current version */
  migrate?: (oldState: Record<string, unknown>, version: number) => Record<string, unknown>;
  /** Serialization function, default JSON.stringify */
  serialize?: (data: any) => string;
  /** Deserialization function, default JSON.parse */
  deserialize?: (str: string) => any;
  /** Write debounce time in ms, default 100 */
  debounce?: number;
  /** Called after rehydration completes */
  onRehydrated?: (state: Record<string, unknown>) => void;
}
```

#### StorageAdapter

```typescript
interface StorageAdapter {
  getItem: (key: string) => string | null | Promise<string | null>;
  setItem: (key: string, value: string) => void | Promise<void>;
  removeItem: (key: string) => void | Promise<void>;
}
```

Supports both sync (localStorage, sessionStorage) and async (React Native AsyncStorage) adapters:

```tsx
// sessionStorage adapter
const sessionAdapter: StorageAdapter = {
  getItem: (key) => sessionStorage.getItem(key),
  setItem: (key, value) => sessionStorage.setItem(key, value),
  removeItem: (key) => sessionStorage.removeItem(key),
};

// React Native AsyncStorage
import AsyncStorage from '@react-native-async-storage/async-storage';
persist({ key: 'settings', storage: AsyncStorage });
```

**Behavior details:**
- On init: reads from storage, deserializes, runs migration if needed, applies filtered state to store
- On state change: debounced write to storage (default 100ms)
- On destroy: one final synchronous write to storage

### devtools(options?)

Connects the store to the browser's Redux DevTools Extension for state inspection and time-travel debugging.

```typescript
import { devtools } from 'gfstate';
import type { DevToolsOptions } from 'gfstate';
```

```tsx
const store = gfstate(
  { count: 0, items: [] as string[] },
  {
    plugins: [devtools({ name: 'app-store', maxAge: 100 })],
  },
);
```

#### DevToolsOptions

```typescript
interface DevToolsOptions {
  /** Name shown in DevTools (defaults to context.storeName) */
  name?: string;
  /** Enable/disable, default: dev mode only (__DEV__) */
  enabled?: boolean;
  /** Max history entries, default 50 */
  maxAge?: number;
  /** Custom action type formatter (default: "SET <key>") */
  actionFormatter?: (key: string) => string;
}
```

**Features:**
- Initializes DevTools with full state snapshot
- Reports every state change as an action (`SET <key>` by default)
- Supports time travel — clicking "Jump to State" in DevTools applies that state to the store
- Silently does nothing if the Redux DevTools Extension is not installed
- Custom action names via `actionFormatter: (key) => \`COUNTER/\${key.toUpperCase()}\``

## Plugin Types (Exported)

```typescript
import type {
  GfstatePlugin,   // Core plugin interface
  PluginContext,    // Plugin context (store, storeName, getSnapshot, getInitialData)
  LoggerOptions,    // logger() options
  PersistOptions,   // persist() options
  StorageAdapter,   // persist storage adapter interface
  DevToolsOptions,  // devtools() options
} from 'gfstate';
```
