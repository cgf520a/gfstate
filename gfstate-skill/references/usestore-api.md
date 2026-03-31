# useStore() API Reference

## Function Signature

```typescript
function useStore<State, Props, Action, Ref, ExcludeKeys>({
  state?: State,
  props?: Props,
  action?: Action,
  ref?: Ref,
  lifecycle?: LifecycleProps<StoreWithStateAndProps<State, Props, Action, Ref>>,
  options?: {
    computed?: Record<string, (state: State) => any>;
    watch?: Partial<Record<keyof State, (newVal: any, oldVal: any, store: any) => void>>;
    noGfstateKeys?: ExcludeKeys[];
  },
}): Store<StoreWithStateAndProps<State, Props, Action, Ref, ExcludeKeys>>;
```

## The Four Namespaces

### state — Reactive Component State

Created once via `useRef`, persisted across renders. Wrapped with `gfstate()` internally.

```tsx
const store = useStore({
  state: { count: 0, name: 'Alice', items: [] as string[] },
});

// Read
store.state.count;
store.state.name;

// Update (all gfstate update patterns work)
store.state.count++;
store.state.name = 'Bob';
store.state.items = [...store.state.items, 'new item'];

// Batch update the entire state namespace
store.state({ count: 10, name: 'Charlie' });
```

### props — Synced Parent Props

Automatically synchronized with the latest parent props on every render. Components reading `store.props.xxx` re-render when that prop changes.

```tsx
interface ItemProps {
  id: number;
  label: string;
  onDelete: (id: number) => void;
}

const TodoItem: React.FC<ItemProps> = (props) => {
  const store = useStore({
    props,
    state: { editing: false },
    action: {
      handleDelete() {
        store.props.onDelete(store.props.id);
      },
    },
  });

  return (
    <div>
      <span>{store.props.label}</span>
      <button onClick={store.action.handleDelete}>Delete</button>
    </div>
  );
};
```

### action — Methods

Functions with stable references. Can access the latest `state`, `props`, and `ref`:

```tsx
const store = useStore({
  state: { count: 0, items: [] as string[] },
  action: {
    increment() {
      store.state.count++;
    },
    reset() {
      store.state.count = 0;
    },
    addItem(item: string) {
      store.state.items = [...store.state.items, item];
    },
    getSummary() {
      return `Count: ${store.state.count}, Items: ${store.state.items.length}`;
    },
  },
});

// Action references are stable — safe to pass as props
<button onClick={store.action.increment}>+1</button>;
```

### ref — Non-Reactive Variables

Stored in a React `useRef`. Mutations do NOT trigger re-renders. Ideal for timer IDs, DOM refs, counters, etc.

```tsx
const store = useStore({
  state: { seconds: 0, running: false },
  ref: { timerId: null as NodeJS.Timeout | null, clickCount: 0 },
  action: {
    start() {
      if (store.ref.timerId) return;
      store.state.running = true;
      store.ref.timerId = setInterval(() => {
        store.state.seconds++;
      }, 1000);
    },
    stop() {
      if (store.ref.timerId) {
        clearInterval(store.ref.timerId);
        store.ref.timerId = null;
      }
      store.state.running = false;
    },
  },
  lifecycle: {
    unmounted() {
      if (store.ref.timerId) clearInterval(store.ref.timerId);
    },
  },
});
```

## Lifecycle Hooks

```typescript
interface LifecycleProps<T> {
  beforeCreate?: () => void;
  created?: (store: Store<T>) => void;
  mounted?: (store: Store<T>) => void;
  unmounted?: (store: Store<T>) => void;
}
```

### Execution Order

```
Component render
  └─ beforeCreate()     ← sync, render phase, may run multiple times in StrictMode
  └─ Store creation
  └─ created(store)     ← runs once, can be async
  └─ React commit
  └─ mounted(store)     ← useEffect, DOM is ready
  ...
Component unmount
  └─ unmounted(store)   ← useEffect cleanup
```

### beforeCreate

Runs in render phase before the store is created. Must be synchronous and free of side effects. May execute multiple times in React StrictMode.

```tsx
lifecycle: {
  beforeCreate() {
    console.log('About to create store');
    // Do NOT: fetch data, set timers, modify DOM
  },
}
```

### created

Runs once after store creation on the first render. The store is fully initialized. Can be async for data fetching:

```tsx
lifecycle: {
  created(store) {
    store.state.loading = true;
    fetch('/api/data')
      .then(res => res.json())
      .then(data => {
        store.state.items = data;
        store.state.loading = false;
      });
  },
}
```

### mounted

Runs inside `useEffect` after the component mounts and the DOM is ready. Ideal for subscriptions, timers, and DOM operations:

```tsx
lifecycle: {
  mounted(store) {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') store.state.visible = false;
    };
    document.addEventListener('keydown', handler);
    store.ref.cleanupKeyboard = () => document.removeEventListener('keydown', handler);
  },
}
```

### unmounted

Runs as `useEffect` cleanup when the component unmounts. Use for resource cleanup:

```tsx
lifecycle: {
  unmounted(store) {
    if (store.ref.timerId) clearInterval(store.ref.timerId);
    store.ref.cleanupKeyboard?.();
  },
}
```

## Options

### computed

Computed properties are attached to `store.state`. In TypeScript, you may need to cast via `as any`:

```tsx
const store = useStore({
  state: { price: 100, quantity: 2, discount: 0.1 },
  options: {
    computed: {
      subtotal: (state) => state.price * state.quantity,
      total: (state) => state.price * state.quantity * (1 - state.discount),
    },
  },
});

// Access computed (may need `as any` in strict TS)
const total = (store.state as any).total;
```

### watch

```tsx
options: {
  watch: {
    price: (newVal, oldVal) => {
      console.log(`Price: ${oldVal} -> ${newVal}`);
    },
  },
}
```

### noGfstateKeys

```tsx
options: {
  noGfstateKeys: ['config'],  // store.state.config won't be auto-wrapped
}
```

## Return Type

```typescript
type StoreWithStateAndProps<State, Props, Action, Ref, ExcludeKeys = never> = {
  state: TransformData<State, ExcludeKeys>;
  props: Props;
  action: Action;
  ref: Ref;
};

// The return is Store<StoreWithStateAndProps<...>>
// So it's both an object and callable
```

## Real-World Examples

### TodoList App

```tsx
import React from 'react';
import { useStore } from 'gfstate';

interface Todo {
  id: number;
  text: string;
  done: boolean;
}

function TodoApp() {
  const store = useStore({
    state: {
      todos: [] as Todo[],
      input: '',
      filter: 'all' as 'all' | 'active' | 'completed',
    },
    ref: { nextId: 1 },
    action: {
      addTodo() {
        if (!store.state.input.trim()) return;
        store.state.todos = [
          ...store.state.todos,
          { id: store.ref.nextId++, text: store.state.input, done: false },
        ];
        store.state.input = '';
      },
      toggleTodo(id: number) {
        store.state.todos = store.state.todos.map((t) =>
          t.id === id ? { ...t, done: !t.done } : t,
        );
      },
      removeTodo(id: number) {
        store.state.todos = store.state.todos.filter((t) => t.id !== id);
      },
    },
    options: {
      computed: {
        filteredTodos: (state) => {
          switch (state.filter) {
            case 'active':
              return state.todos.filter((t) => !t.done);
            case 'completed':
              return state.todos.filter((t) => t.done);
            default:
              return state.todos;
          }
        },
        activeCount: (state) => state.todos.filter((t) => !t.done).length,
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
        onKeyDown={(e) => e.key === 'Enter' && store.action.addTodo()}
      />
      <button onClick={store.action.addTodo}>Add</button>
      <ul>
        {((store.state as any).filteredTodos as Todo[]).map((todo) => (
          <li key={todo.id}>
            <input
              type="checkbox"
              checked={todo.done}
              onChange={() => store.action.toggleTodo(todo.id)}
            />
            <span
              style={{ textDecoration: todo.done ? 'line-through' : 'none' }}
            >
              {todo.text}
            </span>
            <button onClick={() => store.action.removeTodo(todo.id)}>x</button>
          </li>
        ))}
      </ul>
      <div>
        {['all', 'active', 'completed'].map((f) => (
          <button
            key={f}
            onClick={() => {
              store.state.filter = f as any;
            }}
          >
            {f}
          </button>
        ))}
        <span> {(store.state as any).activeCount} items left</span>
      </div>
    </div>
  );
}
```

### Form with Validation

```tsx
import React from 'react';
import { useStore } from 'gfstate';

function LoginForm() {
  const store = useStore({
    state: {
      email: '',
      password: '',
      errors: {} as Record<string, string>,
      submitting: false,
    },
    action: {
      validate() {
        const errors: Record<string, string> = {};
        if (!store.state.email) errors.email = 'Email is required';
        else if (!store.state.email.includes('@'))
          errors.email = 'Invalid email';
        if (!store.state.password) errors.password = 'Password is required';
        else if (store.state.password.length < 6)
          errors.password = 'Min 6 characters';
        store.state.errors = errors;
        return Object.keys(errors).length === 0;
      },
      async submit() {
        if (!store.action.validate()) return;
        store.state.submitting = true;
        try {
          await fetch('/api/login', {
            method: 'POST',
            body: JSON.stringify({
              email: store.state.email,
              password: store.state.password,
            }),
          });
        } finally {
          store.state.submitting = false;
        }
      },
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        store.action.submit();
      }}
    >
      <div>
        <input
          type="email"
          value={store.state.email}
          onChange={(e) => {
            store.state.email = e.target.value;
          }}
          placeholder="Email"
        />
        {store.state.errors.email && <span>{store.state.errors.email}</span>}
      </div>
      <div>
        <input
          type="password"
          value={store.state.password}
          onChange={(e) => {
            store.state.password = e.target.value;
          }}
          placeholder="Password"
        />
        {store.state.errors.password && (
          <span>{store.state.errors.password}</span>
        )}
      </div>
      <button type="submit" disabled={store.state.submitting}>
        {store.state.submitting ? 'Logging in...' : 'Login'}
      </button>
    </form>
  );
}
```

### Async Data Loading with mounted

```tsx
function UserList() {
  const store = useStore({
    state: {
      users: [] as { id: number; name: string }[],
      loading: true,
      error: null as string | null,
    },
    lifecycle: {
      async mounted(store) {
        try {
          const res = await fetch('/api/users');
          if (!res.ok) throw new Error('Failed to fetch');
          store.state.users = await res.json();
        } catch (e: any) {
          store.state.error = e.message;
        } finally {
          store.state.loading = false;
        }
      },
    },
  });

  if (store.state.loading) return <div>Loading...</div>;
  if (store.state.error) return <div>Error: {store.state.error}</div>;
  return (
    <ul>
      {store.state.users.map((u) => (
        <li key={u.id}>{u.name}</li>
      ))}
    </ul>
  );
}
```

### Multiple Independent Stores

You can call `useStore` multiple times in the same component. Each store is fully independent:

```tsx
function Dashboard() {
  const userStore = useStore({
    state: { name: '', avatar: '' },
  });

  const settingsStore = useStore({
    state: { theme: 'light', language: 'en' },
  });

  // userStore and settingsStore are completely independent
}
```
