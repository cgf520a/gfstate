---
title: API 参考
order: 4
---

# API 参考

本页包含 gfstate 和 useStore 的完整 API 参考。

## gfstate()

### 函数签名

```typescript
function gfstate<
  Data extends Record<string, unknown>,
  ExcludeKeys extends keyof Data = never,
  Computed extends Record<string, (state: Data) => any> = Record<
    string,
    (state: Data) => any
  >,
>(
  paramData: Data | (() => Data),
  options?: Options<Data, ExcludeKeys, Computed>,
): StoreWithComputed<Data, ExcludeKeys, Computed>;
```

### 参数

#### paramData

- **类型**: `Data | (() => Data)`
- **描述**: 初始状态对象，或返回初始状态的工厂函数。必须是普通对象。

```typescript
// 直接传对象
const store = gfstate({ count: 0 });

// 使用工厂函数
const store = gfstate(() => ({
  items: [],
  timestamp: Date.now(),
}));
```

#### options

- **类型**: `Options<Data, ExcludeKeys, Computed>`
- **可选**: 是
- **描述**: 配置选项对象

```typescript
interface Options<Data, ExcludeKeys, Computed> {
  computed?: Computed & Record<string, (state: Data) => any>;
  watch?: Partial<
    Record<keyof Data, (newVal: any, oldVal: any, store: any) => void>
  >;
  created?: (store: StoreWithComputed<Data, ExcludeKeys, Computed>) => void;
  noGfstateKeys?: ExcludeKeys[];
}
```

##### options.computed

- **类型**: `Record<string, (state: Data) => any>`
- **可选**: 是
- **描述**: 计算属性。每个属性是一个函数，接收 state，返回计算值。计算属性只读，自动缓存，依赖变化时重新计算。

```typescript
const store = gfstate(
  { firstName: 'John', lastName: 'Doe' },
  {
    computed: {
      fullName: (state) => `${state.firstName} ${state.lastName}`,
    },
  },
);
console.log(store.fullName); // "John Doe"
```

##### options.watch

- **类型**: `Partial<Record<keyof Data, (newVal: any, oldVal: any, store: any) => void>>`
- **可选**: 是
- **描述**: 监听器。当指定的状态属性值变化时执行回调。

```typescript
const store = gfstate(
  { count: 0 },
  {
    watch: {
      count: (newVal, oldVal) => {
        console.log(`count from ${oldVal} to ${newVal}`);
      },
    },
  },
);
```

##### options.created

- **类型**: `(store: StoreWithComputed<Data, ExcludeKeys, Computed>) => void`
- **可选**: 是
- **描述**: 生命周期钩子。store 创建后立即调用，可用于初始化逻辑。

```typescript
const store = gfstate(
  { items: [] },
  {
    created: (store) => {
      fetch('/api/items')
        .then((res) => res.json())
        .then((items) => {
          store.items = items;
        });
    },
  },
);
```

##### options.noGfstateKeys

- **类型**: `ExcludeKeys[]`
- **可选**: 是
- **描述**: 不应被自动包装为子 store 的属性名数组。

```typescript
const store = gfstate(
  {
    config: { theme: 'dark' },
    data: { value: 100 },
  },
  {
    noGfstateKeys: ['config'],
  },
);
// config 相当于普通对象，不能进行细粒度更新
// data 会被自动包装为子 store
```

### 返回值

返回一个 Store 对象，既可以作为数据对象使用，也可以作为函数调用来更新状态。

```typescript
type Store<Data> = Data & {
  <K extends keyof Data>(
    key: K,
    val: Data[K] | ((prev: Data[K]) => Data[K]),
  ): void;
  (payload: Partial<Data> | ((prev: Data) => Partial<Data>)): void;
};

type StoreWithComputed<Data, ExcludeKeys, Computed> = Store<
  TransformData<Data, ExcludeKeys>
> &
  ComputedValues<Computed>;
```

## Store 使用

### 读取属性

```typescript
const store = gfstate({ count: 0, name: 'Alice' });
console.log(store.count); // 0
console.log(store.name); // "Alice"
```

### 更新方式

#### 直接赋值

```typescript
store.count = 5;
store.count += 1; // 现在是 6
```

#### store(key, value)

```typescript
store('count', 10);
// 使用 updater 函数
store('count', (prev) => prev + 1);
```

#### store({ ...payload })

```typescript
store({ count: 100, name: 'Bob' });
```

#### store(prev => ({ ...payload }))

```typescript
store(({ count }) => ({ count: count * 2 }));
```

### 调用 Action

直接调用函数属性：

```typescript
const store = gfstate({
  count: 0,
  increment() {
    store.count++;
  },
});

store.increment(); // count 变为 1
```

## gfstate.config()

### 函数签名

```typescript
function config(options: { batch: (fn: () => void) => void }): void;
```

### 参数

#### options.batch

- **类型**: `(fn: () => void) => void`
- **描述**: 批量更新函数。将多个同步更新合并为一次通知。通常传 `ReactDOM.unstable_batchedUpdates`。

```typescript
import ReactDOM from 'react-dom';
import { gfstate } from 'gfstate';

// 在应用入口调用一次
gfstate.config({ batch: ReactDOM.unstable_batchedUpdates });

const store = gfstate({ a: 0, b: 0 });

store.a++;
store.b++; // 两次更新会被合并为一次渲染
```

## useStore()

### 函数签名

```typescript
function useStore<
  State extends Record<string, any> = Record<string, any>,
  Props extends Record<string, any> = Record<string, any>,
  Action extends Record<string, any> = Record<string, any>,
  Ref extends Record<string, any> = Record<string, any>,
  ExcludeKeys extends keyof State = never,
>({
  state,
  props,
  action,
  ref,
  lifecycle,
  options,
}: {
  state?: State;
  props?: Props;
  action?: Action;
  ref?: Ref;
  lifecycle?: LifecycleProps<
    StoreWithStateAndProps<State, Props, Action, Ref, ExcludeKeys>
  >;
  options?: Options<State, ExcludeKeys>;
}): Store<StoreWithStateAndProps<State, Props, Action, Ref, ExcludeKeys>>;
```

### 参数

#### state

- **类型**: `State`
- **可选**: 是（默认 `{}`）
- **描述**: 组件可变状态。通过 `gfstate(state, options)` 内部包装。访问通过 `store.state`。

#### props

- **类型**: `Props`
- **可选**: 是（默认 `{}`）
- **描述**: 来自父组件的只读数据。会在每次渲染时自动同步更新。访问通过 `store.props`。

#### action

- **类型**: `Action`
- **可选**: 是（默认 `{}`）
- **描述**: 方法和函数。会在每次渲染时自动同步更新。访问通过 `store.action`。

#### ref

- **类型**: `Ref`
- **可选**: 是（默认 `{}`）
- **描述**: 非响应式数据。存储在 `useRef`，修改不触发重渲染。访问通过 `store.ref`。

#### lifecycle

- **类型**: `LifecycleProps<StoreWithStateAndProps<...>>`
- **可选**: 是
- **描述**: 生命周期钩子对象

```typescript
interface LifecycleProps<T = Record<string, any>> {
  beforeCreate?: () => void;
  created?: (store: Store<T>) => void;
  mounted?: (store: Store<T>) => void;
  unmounted?: (store: Store<T>) => void;
}
```

##### lifecycle.beforeCreate

- **类型**: `() => void`
- **可选**: 是
- **描述**: 在 store 创建前调用，运行在渲染阶段。在 React 严格模式下可能被多次调用，应保持同步且无副作用。

##### lifecycle.created

- **类型**: `(store: Store<T>) => void`
- **可选**: 是
- **描述**: store 创建后立即调用，仅在首次渲染执行。适合异步初始化。

##### lifecycle.mounted

- **类型**: `(store: Store<T>) => void`
- **可选**: 是
- **描述**: 组件挂载后调用（useEffect 内）。适合执行副作用、订阅等。

##### lifecycle.unmounted

- **类型**: `(store: Store<T>) => void`
- **可选**: 是
- **描述**: 组件卸载时调用（useEffect 清理函数）。用于清理资源。

#### options

- **类型**: `Options<State, ExcludeKeys>`
- **可选**: 是
- **描述**: 传递给内部 `gfstate(state, options)` 的配置。支持 `computed`、`watch` 和 `noGfstateKeys`。

### 返回值

返回 `Store<StoreWithStateAndProps<State, Props, Action, Ref, ExcludeKeys>>`，包含以下属性：

- `store.state` — 可变状态（从 `state` 参数创建）
- `store.props` — 只读 props（从 `props` 参数创建）
- `store.action` — 方法（从 `action` 参数创建）
- `store.ref` — 非响应式数据（来自 `ref` 参数）

## 工具函数

### isGfstateStore()

检查一个值是否是 gfstate store。

```typescript
function isGfstateStore(obj: any): obj is Store<Record<string, unknown>>;
```

**示例**:

```typescript
import { gfstate, isGfstateStore } from 'gfstate';

const store = gfstate({ count: 0 });
const plain = { count: 0 };

console.log(isGfstateStore(store)); // true
console.log(isGfstateStore(plain)); // false
```

### syncWrapper()

同步执行函数并返回其返回值。用于在对象初始化时执行函数而不将其识别为 action。

```typescript
function syncWrapper<T>(fn: () => T): T;
```

**示例**:

```typescript
import { gfstate, syncWrapper } from 'gfstate';

const store = gfstate({
  // 计算初始值（不是 action）
  computedValue: syncWrapper(() => {
    let sum = 0;
    for (let i = 0; i < 1000; i++) sum += i;
    return sum;
  }),
  // 这是 action
  increment() {
    store.something++;
  },
});
```

### EMPTY_ARRAY

共享的空数组常量。当状态初始化为 `[]` 时，gfstate 会用 `EMPTY_ARRAY` 替换它以避免引用不稳定。

```typescript
export declare const EMPTY_ARRAY: ReadonlyArray<any>;
```

**示例**:

```typescript
import { gfstate, EMPTY_ARRAY } from 'gfstate';

const store = gfstate({ items: [] });
console.log(store.items === EMPTY_ARRAY); // true
```

## 类型导出

### Store<Data>

```typescript
type Store<Data> = Data & SetStore<Data>;
```

一个既是数据对象，又可以作为函数调用来执行更新的类型。

### TransformData<Data, ExcludeKeys>

```typescript
type TransformData<Data, ExcludeKeys> = {
  [K in keyof Data]: K extends 'ref'
    ? Data[K]
    : K extends ExcludeKeys
    ? Data[K]
    : IsPlainObject<Data[K]> extends true
    ? Store<TransformData<Data[K]>>
    : Data[K];
};
```

递归地将普通对象属性转换为 Store 类型，排除 `ref` 和 `noGfstateKeys` 中的属性。

### StoreWithComputed<Data, ExcludeKeys, Computed>

```typescript
type StoreWithComputed<Data, ExcludeKeys, Computed> = Store<
  TransformData<Data, ExcludeKeys>
> &
  ComputedValues<Computed>;
```

包含计算属性的 Store 类型。

### StoreWithStateAndProps<State, Props, Action, Ref, ExcludeKeys>

```typescript
interface StoreWithStateAndProps<
  State extends Record<string, any> = Record<string, any>,
  Props extends Record<string, any> = Record<string, any>,
  Action extends Record<string, any> = Record<string, any>,
  Ref extends Record<string, any> = Record<string, any>,
  ExcludeKeys extends keyof State = never,
> {
  state: Store<TransformData<State, ExcludeKeys>>;
  props: Store<Props>;
  action: Store<Action>;
  ref: Ref;
}
```

useStore 返回值的结构。

### Options<Data, ExcludeKeys, Computed>

```typescript
interface Options<Data, ExcludeKeys, Computed> {
  computed?: Computed & Record<string, (state: Data) => any>;
  watch?: Partial<
    Record<keyof Data, (newVal: any, oldVal: any, store: any) => void>
  >;
  created?: (store: StoreWithComputed<Data, ExcludeKeys, Computed>) => void;
  noGfstateKeys?: ExcludeKeys[];
}
```

gfstate 和 useStore 的配置选项。

## 常量导出

### IS_GFSTATE_STORE

```typescript
export declare const IS_GFSTATE_STORE: unique symbol;
```

gfstate 内部使用的标记符号。每个 gfstate store 对象在访问这个符号时返回 `true`。

## 支持的数据类型

gfstate 支持以下数据类型作为状态值：

| 类型                                                                 | 行为                                       |
| -------------------------------------------------------------------- | ------------------------------------------ |
| 基本类型（string, number, boolean, null, undefined, bigint, symbol） | 响应式，直接比较                           |
| 普通对象 `{}`                                                        | 自动递归包装为子 store                     |
| 普通对象（在 noGfstateKeys 中）                                      | 作为不可分割的值，只能整体替换             |
| 数组                                                                 | 响应式但引用比较，需要替换整个数组触发更新 |
| 函数                                                                 | 识别为 action，函数引用稳定                |
| Date, RegExp, Map, Set                                               | 引用比较，不可分割                         |
| Promise, 其他对象                                                    | 作为普通值存储                             |

## React 版本要求

- **对等依赖**: React ^18.0.0, ReactDOM ^18.0.0
- **内部依赖**: use-sync-external-store（防止并发模式中的 tearing）

## 构建输出

- **模块格式**: ES2015 module
- **类型定义**: `es/index.d.ts`
- **入口**: `es/index.js`
