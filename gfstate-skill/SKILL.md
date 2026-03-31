---
name: gfstate-skill
description: Guide for using gfstate, a React fine-grained state management library based on Proxy + useSyncExternalStore. Covers gfstate() for creating reactive stores, useStore() for component-scoped stores, and the plugin system (logger, persist, devtools). Use this skill whenever the user wants to manage React state with gfstate, create reactive stores, handle fine-grained per-property subscriptions, use Proxy-based state management, persist state to storage, add logging/devtools to stores, write custom gfstate plugins, or mentions gfstate in any context. Also use when the user is working with React state management and could benefit from per-property reactivity instead of whole-state re-renders.
---

# gfstate - React Fine-Grained State Management

gfstate is a React state management library using ES6 Proxy + `useSyncExternalStore`. Each property has its own subscription — components only re-render when the properties they actually read change.

**Requirements:** React 18+

## Installation

```bash
npm install gfstate
# or
pnpm add gfstate
# or
yarn add gfstate
```

## Two Usage Modes

| Mode         | Scope                    | When to Use                                  |
| ------------ | ------------------------ | -------------------------------------------- |
| `gfstate()`  | Global / cross-component | Shared state across multiple components      |
| `useStore()` | Component-level          | State tied to a single component's lifecycle |

## Quick Start

### Mode 1: gfstate() — Global Store

```tsx
import { gfstate } from 'gfstate';

// Create a store (outside components = shared across all components)
const store = gfstate({
  count: 0,
  name: 'World',
  increment() {
    store.count++;
  },
});

function Counter() {
  // Only re-renders when store.count changes, NOT when store.name changes
  return (
    <div>
      <p>Count: {store.count}</p>
      <button onClick={store.increment}>+1</button>
    </div>
  );
}

function Greeting() {
  // Only re-renders when store.name changes
  return <h1>Hello, {store.name}!</h1>;
}
```

### Mode 2: useStore() — Component Store

```tsx
import { useStore } from 'gfstate';

function TodoApp() {
  const store = useStore({
    state: { items: [] as string[], input: '' },
    action: {
      add() {
        if (store.state.input.trim()) {
          store.state.items = [...store.state.items, store.state.input];
          store.state.input = '';
        }
      },
    },
  });

  return (
    <div>
      <input
        value={store.state.input}
        onChange={(e) => {
          store.state.input = e.target.value;
        }}
      />
      <button onClick={store.action.add}>Add</button>
      <ul>
        {store.state.items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
```

## gfstate() Core API

### Creating a Store

```tsx
import { gfstate } from 'gfstate';

// Object literal
const store = gfstate({ count: 0, name: 'Alice' });

// Factory function (lazy init)
const store = gfstate(() => ({
  timestamp: Date.now(),
  items: [],
}));
```

### Four Update Patterns

```tsx
const store = gfstate({ count: 0, name: 'Alice' });

// 1. Direct assignment
store.count = 10;
store.count += 1;

// 2. Key-value call
store('count', 100);
store('count', (prev) => prev + 5); // updater function

// 3. Batch object update (multiple keys at once)
store({ count: 99, name: 'Bob' });

// 4. Functional batch update
store(({ count }) => ({ count: count * 2 }));
```

### Actions (Functions)

Functions in the store become **actions** with stable references — safe to pass directly as event handlers or props without `useCallback`:

```tsx
const store = gfstate({
  count: 0,
  increment() {
    store.count++;
  },
  decrement() {
    store.count--;
  },
  incrementBy(n: number) {
    store.count += n;
  },
});

// Safe: onClick={store.increment} — reference never changes
```

### Nested Objects

Plain objects are automatically wrapped as child stores with independent reactivity:

```tsx
const store = gfstate({
  user: {
    name: 'Alice',
    address: { city: 'Beijing', street: 'Main St' },
  },
});

// Deep update — only components reading `city` re-render
store.user.address.city = 'Shanghai';

// Batch update a sub-store
store.user({ name: 'Bob', address: store.user.address });
```

### Arrays — CRITICAL RULE

Arrays use reference comparison. **In-place mutations do NOT trigger updates.** Always replace the entire array:

```tsx
const store = gfstate({ items: ['a', 'b'] });

// WRONG — will NOT trigger re-render
store.items.push('c');
store.items.splice(0, 1);

// CORRECT — creates new reference
store.items = [...store.items, 'c']; // add
store.items = store.items.filter((_, i) => i !== 0); // remove
store.items = store.items.map((item) => item.toUpperCase()); // transform
store.items = []; // clear
```

### Options: computed, watch, created, noGfstateKeys

```tsx
const store = gfstate(
  { firstName: 'John', lastName: 'Doe', price: 100, quantity: 3 },
  {
    // Computed: auto-cached, recalculates only when deps change
    computed: {
      fullName: (state) => `${state.firstName} ${state.lastName}`,
      total: (state) => state.price * state.quantity,
    },

    // Watch: callback when specific keys change
    watch: {
      price: (newVal, oldVal, store) => {
        console.log(`Price changed: ${oldVal} -> ${newVal}`);
      },
    },

    // Created: runs once after store creation (can be async)
    created: (store) => {
      // e.g., fetch initial data
    },

    // noGfstateKeys: prevent auto-wrapping of specific object keys
    noGfstateKeys: ['config'],
  },
);

// Read computed: store.fullName, store.total
// Computed is READ-ONLY — assigning throws in dev mode
```

### `ref` — Non-Reactive Storage

The key `ref` is reserved and bypasses the reactive system entirely:

```tsx
const store = gfstate({
  count: 0,
  ref: { renderCount: 0, timerId: null as any },
});

// Mutations to ref do NOT trigger re-renders
store.ref.renderCount++;
```

### `syncWrapper` — Sync Computed Initial Values

Use `syncWrapper` when you want gfstate to treat a function's **return value** as the initial value (instead of treating the function as an action):

```tsx
import { gfstate, syncWrapper } from 'gfstate';

const store = gfstate({
  expensiveValue: syncWrapper(() => {
    let sum = 0;
    for (let i = 0; i < 1000; i++) sum += i;
    return sum;
  }),
});
// store.expensiveValue === 499500 (a number, not a function)
```

### Batch Updates Configuration

At your app entry point, configure batching for better performance:

```tsx
import ReactDOM from 'react-dom';
import { gfstate } from 'gfstate';

gfstate.config({ batch: ReactDOM.unstable_batchedUpdates });
```

### Utility: isGfstateStore

```tsx
import { gfstate, isGfstateStore } from 'gfstate';
const store = gfstate({ count: 0 });
isGfstateStore(store); // true
isGfstateStore({}); // false
```

### External Subscribe — `store.subscribe(cb)`

Subscribe to store changes from outside React components. Fires for state, computed, and nested child store changes.

```tsx
const store = gfstate({ count: 0, nested: { x: 1 } }, {
  computed: { double: (s) => s.count * 2 },
});

// Listen to all changes
const unsub = store.subscribe((key, newVal, oldVal) => {
  console.log(`${key}: ${oldVal} → ${newVal}`);
});

store.count = 1; // logs "count: 0 → 1" and "double: 0 → 2"
store.nested.x = 2; // logs "nested.x: 1 → 2"

// Listen to specific key
store.subscribe('count', (newVal, oldVal) => { ... });

unsub(); // unsubscribe
```

> `subscribe` is a reserved property name. Nested child store changes use dot-path keys (e.g. `nested.x`).

### `store.reset()` — Reset State to Initial Values

Resets state back to the deep-cloned initial data. Triggers computed recalculation and watch callbacks. Nested child stores are recursively reset.

```tsx
const store = gfstate({ count: 0, name: 'Alice', nested: { x: 1 } });

store.count = 99;
store.name = 'Bob';
store.nested.x = 42;

// Reset all keys to initial values
store.reset();
// store.count === 0, store.name === 'Alice', store.nested.x === 1

// Reset a single key
store.count = 50;
store.reset('count');
// store.count === 0, store.name still unchanged
```

**Rules:**

- `store.reset()` resets all keys to the deep-cloned initial data
- `store.reset('key')` resets a single key
- Triggers computed recalculation and watch callbacks
- Nested child stores are recursively reset
- No-op if the current value is already equal to the initial value
- Calling `reset()` on a destroyed store produces a dev warning

### `store.destroy()` — Clean Up Store

Cleans up all subscriptions, watch listeners, and computed listeners. Use this when a store is no longer needed to free resources.

```tsx
const store = gfstate({ count: 0, nested: { x: 1 } });

// Clean up everything
store.destroy();

// After destroy: reads/writes produce dev warnings
store.count; // dev warning
store.count = 5; // dev warning
```

**Rules:**

- Recursively destroys nested child stores
- Marks store as destroyed; subsequent reads/writes produce dev warnings
- Idempotent — safe to call multiple times
- After destroy, `reset()` and `snapshot()` also produce dev warnings

### `store.snapshot()` — Deep Clone Current State

Returns a deep-cloned plain JS object of the current store state, with no Proxy. Safe to serialize (e.g., `JSON.stringify`), log, or send over the network.

```tsx
const store = gfstate(
  { count: 0, nested: { x: 1 }, ref: { timerId: null } },
  { computed: { double: (s) => s.count * 2 } },
);

store.count = 5;
store.nested.x = 10;

const snap = store.snapshot();
// snap === { count: 5, nested: { x: 10 }, double: 10, ref: { timerId: null } }
// snap is a plain object — no Proxy, safe to serialize
```

**Rules:**

- Includes computed values and nested child store values
- Includes `ref` values
- Returned object has no Proxy
- Returns `{}` if the store is destroyed

> `reset`, `destroy`, and `snapshot` are reserved property names (like `ref` and `subscribe`).

## Plugin System

gfstate has a plugin system for injecting logic at store lifecycle hooks. Plugins can be registered globally (all stores) or per-store. For full details, read `references/gfstate-api.md`.

### Registering Plugins

```tsx
import { gfstate } from 'gfstate';
import type { GfstatePlugin } from 'gfstate';

const myPlugin: GfstatePlugin = {
  name: 'my-plugin',
  onAfterSet(key, newVal, oldVal, context) {
    console.log(`[${context.storeName}] ${key}: ${oldVal} → ${newVal}`);
  },
};

// Global — affects all stores created after this call
gfstate.use(myPlugin);

// Per-store — only this store
const store = gfstate(
  { count: 0 },
  { plugins: [myPlugin], storeName: 'counter' },
);
```

### Plugin Interface

```typescript
interface GfstatePlugin {
  name: string; // unique identifier (deduplication + debugging)
  onInit?: (ctx: PluginContext) => void | (() => void); // after store creation; return cleanup fn
  onBeforeSet?: (key, newVal, oldVal, ctx) => void | { value: X } | false; // intercept/replace/cancel
  onAfterSet?: (key, newVal, oldVal, ctx) => void; // after value is set
  onSubscribe?: (key: string | null, ctx) => void; // when subscribe() is called
  onDestroy?: (ctx: PluginContext) => void; // before store cleanup
}

interface PluginContext {
  store: any;
  storeName: string;
  getSnapshot: () => Record<string, unknown>;
  getInitialData: () => Record<string, unknown>;
}
```

### Built-in Plugins

gfstate ships three ready-to-use plugins, all imported from `'gfstate'`:

#### logger — Console logging

```tsx
import { gfstate, logger } from 'gfstate';

const store = gfstate(
  { count: 0, name: 'Alice' },
  {
    plugins: [logger({ exclude: ['name'] })],
    storeName: 'app',
  },
);
// Logs state changes to console with timestamps, grouped by key
```

Options: `include`, `exclude`, `collapsed` (default true), `logger`, `enabled` (default true), `formatter`, `timestamp` (default true).

#### persist — State persistence

```tsx
import { gfstate, persist } from 'gfstate';

const store = gfstate(
  { theme: 'light', fontSize: 14 },
  {
    plugins: [
      persist({
        key: 'app-settings', // localStorage key (required)
        include: ['theme'],   // only persist these keys
        version: 1,           // for migration
        migrate: (old, v) => v < 1 ? { ...old, fontSize: 14 } : old,
      }),
    ],
  },
);
// State auto-saved to localStorage; auto-restored on page load
```

Options: `key` (required), `storage` (default localStorage), `include`, `exclude`, `version`, `migrate`, `serialize`, `deserialize`, `debounce` (default 100ms), `onRehydrated`.

Supports async storage adapters (e.g., React Native AsyncStorage).

#### devtools — Redux DevTools

```tsx
import { gfstate, devtools } from 'gfstate';

const store = gfstate(
  { count: 0 },
  {
    plugins: [devtools({ name: 'my-store' })],
  },
);
// Connects to Redux DevTools Extension; supports time travel
```

Options: `name`, `enabled` (default: dev mode only), `maxAge` (default 50), `actionFormatter`.

### Combining Plugins

```tsx
import { gfstate, logger, persist, devtools } from 'gfstate';

const store = gfstate(
  { count: 0, theme: 'light' },
  {
    storeName: 'main',
    plugins: [
      logger(),
      persist({ key: 'main-store', include: ['theme'] }),
      devtools(),
    ],
  },
);
```

### Writing Custom Plugins

```tsx
import type { GfstatePlugin } from 'gfstate';

// Example: range validation plugin
const rangeValidator: GfstatePlugin = {
  name: 'range-validator',
  onBeforeSet(key, newVal, oldVal, ctx) {
    if (key === 'count' && typeof newVal === 'number') {
      if (newVal < 0) return false; // cancel the set
      if (newVal > 100) return { value: 100 }; // clamp to max
    }
    // return void — no intervention
  },
};
```

**Plugin rules:**
- Global plugins execute before per-store plugins
- Same-name plugins are deduplicated (second registration is skipped)
- `gfstate.clearPlugins()` clears all global plugins (for testing)
- Plugin errors are caught and logged in dev mode, never propagated

## useStore() Hook

Creates a component-level store with four namespaces. For full details and examples, read `references/usestore-api.md`.

### Structure

```tsx
const store = useStore({
  state: {
    /* reactive state */
  },
  props: {
    /* synced parent props */
  },
  action: {
    /* methods */
  },
  ref: {
    /* non-reactive variables */
  },
  lifecycle: {
    beforeCreate() {}, // sync, render phase, no side effects
    created(store) {}, // after creation, runs once, can be async
    mounted(store) {}, // useEffect, DOM ready
    unmounted(store) {}, // cleanup
  },
  options: {
    computed: {
      /* derived values */
    },
    watch: {
      /* change listeners */
    },
    noGfstateKeys: [], // keys to exclude from auto-wrapping
  },
});

// Access: store.state.xxx, store.props.xxx, store.action.xxx, store.ref.xxx
```

### Props Auto-Sync

Parent props are automatically synchronized on every render:

```tsx
const Child: React.FC<{ name: string; onUpdate: () => void }> = (props) => {
  const store = useStore({
    props,
    state: { localCount: 0 },
  });
  // store.props.name always reflects the latest parent value
  return (
    <div>
      {store.props.name}: {store.state.localCount}
    </div>
  );
};
```

### Lifecycle Execution Order

1. `beforeCreate` — render phase (may run multiple times in StrictMode)
2. `created` — after store init, before mount, runs once
3. `mounted` — after DOM mount (in useEffect)
4. `unmounted` — on component unmount (useEffect cleanup)

## Critical Rules and Common Pitfalls

1. **Arrays: NEVER use push/pop/splice** — always replace the full reference
2. **Do NOT use Symbol values as state** — each access triggers a re-render
3. **Computed properties are read-only** — assigning throws in dev mode
4. **`ref`, `subscribe`, `reset`, `destroy`, `snapshot` are reserved** — cannot be used as state keys; `ref` bypasses the reactive system, mutations don't re-render
5. **Plain objects auto-wrap as child stores** — use `noGfstateKeys` to opt out
6. **Reading store outside React components** — returns raw data, no subscriptions
7. **Watch monitors state, computed, and nested child store keys** — use `subscribe()` for external (non-React) listening
8. **Action references are stable** — safe to pass as props, no `useCallback` needed

## Exported Types and Symbols

```typescript
import type {
  Store, // Data & callable setter
  TransformData, // Recursive type transform
  StoreWithComputed, // Store + computed properties
  Options, // gfstate options
  StoreWithStateAndProps, // useStore return type
  GfstatePlugin, // Plugin interface
  PluginContext, // Plugin context
  LoggerOptions, // logger plugin options
  PersistOptions, // persist plugin options
  StorageAdapter, // persist storage adapter
  DevToolsOptions, // devtools plugin options
} from 'gfstate';

import {
  gfstate, // core function
  useStore, // component hook
  isGfstateStore, // type guard
  syncWrapper, // sync init helper
  logger, // built-in logger plugin
  persist, // built-in persist plugin
  devtools, // built-in devtools plugin
  EMPTY_ARRAY, // Shared empty array constant
  RESET, // Symbol identifier for reset
  DESTROY, // Symbol identifier for destroy
  SNAPSHOT, // Symbol identifier for snapshot
} from 'gfstate';
```

## Reference Files

For detailed API signatures, type definitions, and comprehensive examples:

- `references/gfstate-api.md` — Full gfstate() API with all data type behaviors, plugin system details, and built-in plugin options
- `references/usestore-api.md` — Full useStore() API with lifecycle and real-world patterns
