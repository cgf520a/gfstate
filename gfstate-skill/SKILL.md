---
name: gfstate-skill
description: Guide for using gfstate, a React fine-grained state management library based on Proxy + useSyncExternalStore. Covers gfstate() for creating reactive stores and useStore() for component-scoped stores. Use this skill whenever the user wants to manage React state with gfstate, create reactive stores, handle fine-grained per-property subscriptions, use Proxy-based state management, or mentions gfstate in any context. Also use when the user is working with React state management and could benefit from per-property reactivity instead of whole-state re-renders.
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
4. **`ref` is reserved** — bypasses the reactive system, mutations don't re-render
5. **Plain objects auto-wrap as child stores** — use `noGfstateKeys` to opt out
6. **Reading store outside React components** — returns raw data, no subscriptions
7. **Watch only monitors direct state keys** — cannot watch computed or nested child store keys
8. **Action references are stable** — safe to pass as props, no `useCallback` needed

## Exported Types

```typescript
import type {
  Store, // Data & callable setter
  TransformData, // Recursive type transform
  StoreWithComputed, // Store + computed properties
  Options, // gfstate options
  StoreWithStateAndProps, // useStore return type
} from 'gfstate';
```

## Reference Files

For detailed API signatures, type definitions, and comprehensive examples:

- `references/gfstate-api.md` — Full gfstate() API with all data type behaviors
- `references/usestore-api.md` — Full useStore() API with lifecycle and real-world patterns
