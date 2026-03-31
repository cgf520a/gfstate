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
- Cannot depend on other computed properties or nested child store properties
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
- Only monitors direct state properties (not computed, not nested child store keys)
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
