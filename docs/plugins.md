---
title: 插件系统
order: 5
---

# 插件系统

gfstate 提供了灵活的插件系统，可以在 store 的各个生命周期节点注入逻辑。支持全局插件（对所有 store 生效）和局部插件（仅对特定 store 生效）。

## 插件接口

```typescript
interface GfstatePlugin {
  name: string; // 插件名称（唯一标识，用于去重和调试）
  onInit?: (context: PluginContext) => void | (() => void);
  onBeforeSet?: (
    key,
    newVal,
    oldVal,
    context,
  ) => void | { value: unknown } | false;
  onAfterSet?: (key, newVal, oldVal, context) => void;
  onSubscribe?: (key: string | null, context) => void;
  onDestroy?: (context: PluginContext) => void;
}

interface PluginContext {
  store: any; // Store 实例
  storeName: string; // Store 名称
  getSnapshot: () => Record<string, unknown>; // 获取当前状态快照
  getInitialData: () => Record<string, unknown>; // 获取初始数据
}
```

## 全局插件 vs 局部插件

```tsx
import React from 'react';
import { gfstate } from 'gfstate';
import type { GfstatePlugin } from 'gfstate';

// 定义一个简单的日志插件
const myLogger: GfstatePlugin = {
  name: 'my-logger',
  onAfterSet(key, newVal, oldVal, context) {
    console.log(`[${context.storeName}] ${key}: ${oldVal} → ${newVal}`);
  },
};

// 方式一：全局注册 — 对所有后续创建的 store 生效
gfstate.use(myLogger);

// 方式二：局部注册 — 只对当前 store 生效
const store = gfstate(
  { count: 0 },
  {
    plugins: [myLogger],
    storeName: 'counter', // 可选：为 store 命名
  },
);

export default () => {
  return (
    <div>
      <p>count: {store.count}</p>
      <button onClick={() => store.count++}>+1（查看控制台日志）</button>
    </div>
  );
};
```

## 生命周期钩子

### onInit — 初始化

在 store 创建完成后（created 生命周期之后）调用。可返回清理函数，在 destroy 时自动执行。

```tsx
import React from 'react';
import { gfstate } from 'gfstate';
import type { GfstatePlugin } from 'gfstate';

const timerPlugin: GfstatePlugin = {
  name: 'timer',
  onInit(context) {
    console.log(`Store "${context.storeName}" 初始化完成`);
    console.log('初始状态:', context.getSnapshot());

    // 返回清理函数
    const timer = setInterval(() => {
      console.log('当前状态:', context.getSnapshot());
    }, 5000);

    return () => {
      clearInterval(timer);
      console.log('定时器已清理');
    };
  },
};

const store = gfstate(
  { count: 0 },
  { plugins: [timerPlugin], storeName: 'demo' },
);

export default () => {
  return (
    <div>
      <p>count: {store.count}</p>
      <button onClick={() => store.count++}>+1</button>
      <button onClick={() => store.destroy()}>销毁 Store（清理定时器）</button>
    </div>
  );
};
```

### onBeforeSet — 设置前拦截

在值被设置前调用，可以替换值或取消设置。

```tsx
import React from 'react';
import { gfstate } from 'gfstate';
import type { GfstatePlugin } from 'gfstate';

// 数值范围校验插件
const rangeValidator: GfstatePlugin = {
  name: 'range-validator',
  onBeforeSet(key, newVal, oldVal, context) {
    if (key === 'count' && typeof newVal === 'number') {
      // 取消设置（返回 false）
      if (newVal < 0) {
        console.warn('count 不能小于 0，已取消设置');
        return false;
      }
      // 替换值（返回 { value: X }）
      if (newVal > 100) {
        console.warn('count 不能超过 100，已限制为 100');
        return { value: 100 };
      }
    }
    // 返回 void：不干预
  },
};

const store = gfstate({ count: 50 }, { plugins: [rangeValidator] });

export default () => {
  return (
    <div>
      <p>count: {store.count}（范围 0~100）</p>
      <button onClick={() => store.count++}>+1</button>
      <button onClick={() => store.count--}>-1</button>
      <button onClick={() => (store.count = -10)}>设为 -10（被拦截）</button>
      <button onClick={() => (store.count = 200)}>
        设为 200（限制为 100）
      </button>
    </div>
  );
};
```

### onAfterSet — 设置后回调

在值设置完成（已触发 UI 更新和通知）后调用。

```tsx
import React from 'react';
import { gfstate } from 'gfstate';
import type { GfstatePlugin } from 'gfstate';

// 变更审计插件
const audit: GfstatePlugin = {
  name: 'audit',
  onAfterSet(key, newVal, oldVal, context) {
    const entry = {
      store: context.storeName,
      key,
      from: oldVal,
      to: newVal,
      at: new Date().toISOString(),
    };
    console.table([entry]);
  },
};

const store = gfstate(
  { username: 'Alice', role: 'user' },
  { plugins: [audit], storeName: 'user-store' },
);

export default () => {
  return (
    <div>
      <p>username: {store.username}</p>
      <p>role: {store.role}</p>
      <button onClick={() => (store.username = 'Bob')}>改名</button>
      <button onClick={() => (store.role = 'admin')}>升级为 admin</button>
      <p style={{ color: '#999', fontSize: 12 }}>打开控制台查看审计日志</p>
    </div>
  );
};
```

### onSubscribe — 订阅监控

在 `store.subscribe()` 被调用时触发，`key` 为 `null` 表示全局订阅。

```tsx | pure
import { gfstate } from 'gfstate';
import type { GfstatePlugin } from 'gfstate';

const subscribeMonitor: GfstatePlugin = {
  name: 'subscribe-monitor',
  onSubscribe(key, context) {
    if (key === null) {
      console.log(`[${context.storeName}] 新增全局订阅`);
    } else {
      console.log(`[${context.storeName}] 新增订阅: ${key}`);
    }
  },
};
```

### onDestroy — 销毁前清理

在 store 销毁时调用（在清理订阅之前）。

```tsx | pure
import { gfstate } from 'gfstate';
import type { GfstatePlugin } from 'gfstate';

const cleanupPlugin: GfstatePlugin = {
  name: 'cleanup',
  onDestroy(context) {
    console.log(`Store "${context.storeName}" 即将销毁`);
    // 可以做最后一次数据持久化等清理操作
    const finalState = context.getSnapshot();
    console.log('最终状态:', finalState);
  },
};
```

## 内置插件

gfstate 提供三个开箱即用的内置插件。

### logger — 日志插件

记录所有 state 变更到控制台。

```tsx
import React from 'react';
import { gfstate, logger } from 'gfstate';

const store = gfstate(
  {
    count: 0,
    name: 'Alice',
    nested: { x: 1 },
  },
  {
    plugins: [logger()],
    storeName: 'app',
  },
);

export default () => {
  return (
    <div>
      <p>count: {store.count}</p>
      <p>name: {store.name}</p>
      <p>nested.x: {store.nested.x}</p>
      <button onClick={() => store.count++}>count +1</button>
      <button onClick={() => (store.name = 'Bob')}>改名</button>
      <button onClick={() => store.nested.x++}>nested.x +1</button>
      <p style={{ color: '#999', fontSize: 12 }}>打开控制台查看变更日志</p>
    </div>
  );
};
```

#### logger 选项

```typescript
interface LoggerOptions {
  include?: string[]; // 只记录这些 key 的变更
  exclude?: string[]; // 排除这些 key
  collapsed?: boolean; // 是否折叠 group，默认 true
  logger?: { log; group; groupCollapsed; groupEnd }; // 自定义 logger
  enabled?: boolean; // 是否启用，默认 true
  formatter?: (key, newVal, oldVal) => string; // 自定义格式化
  timestamp?: boolean; // 是否包含时间戳，默认 true
}
```

#### 过滤和自定义格式

```tsx | pure
import { gfstate, logger } from 'gfstate';

// 只记录特定 key
const store1 = gfstate(
  { count: 0, internal: '', name: 'Alice' },
  {
    plugins: [logger({ include: ['count', 'name'] })],
  },
);

// 排除某些 key
const store2 = gfstate(
  { count: 0, internal: '', name: 'Alice' },
  {
    plugins: [logger({ exclude: ['internal'] })],
  },
);

// 自定义格式化
const store3 = gfstate(
  { count: 0 },
  {
    plugins: [
      logger({
        formatter: (key, newVal, oldVal) =>
          `🔄 ${key}: ${JSON.stringify(oldVal)} → ${JSON.stringify(newVal)}`,
      }),
    ],
  },
);

// 生产环境禁用
const store4 = gfstate(
  { count: 0 },
  {
    plugins: [logger({ enabled: process.env.NODE_ENV !== 'production' })],
  },
);
```

### persist — 状态持久化插件

将 store 状态自动持久化到 localStorage（或自定义存储适配器），页面刷新后自动恢复。

```tsx
import React from 'react';
import { gfstate, persist } from 'gfstate';

const store = gfstate(
  {
    theme: 'light' as 'light' | 'dark',
    fontSize: 14,
    lang: 'zh-CN',
  },
  {
    plugins: [
      persist({
        key: 'app-settings', // localStorage 的 key（必填）
      }),
    ],
  },
);

export default () => {
  return (
    <div>
      <p>主题: {store.theme}</p>
      <p>字号: {store.fontSize}</p>
      <p>语言: {store.lang}</p>
      <button
        onClick={() =>
          (store.theme = store.theme === 'light' ? 'dark' : 'light')
        }
      >
        切换主题
      </button>
      <button onClick={() => store.fontSize++}>字号 +1</button>
      <button
        onClick={() =>
          (store.lang = store.lang === 'zh-CN' ? 'en-US' : 'zh-CN')
        }
      >
        切换语言
      </button>
      <p style={{ color: '#999', fontSize: 12 }}>
        修改后刷新页面，状态会自动恢复
      </p>
    </div>
  );
};
```

#### persist 选项

```typescript
interface PersistOptions {
  key: string; // 存储 key（必填）
  storage?: StorageAdapter; // 存储适配器，默认 localStorage
  include?: string[]; // 只持久化这些 key
  exclude?: string[]; // 排除这些 key
  version?: number; // 状态版本号，默认 0
  migrate?: (oldState, version) => newState; // 版本迁移函数
  serialize?: (data) => string; // 序列化函数，默认 JSON.stringify
  deserialize?: (str) => any; // 反序列化函数，默认 JSON.parse
  debounce?: number; // 写入防抖时间(ms)，默认 100
  onRehydrated?: (state) => void; // rehydration 完成回调
}

interface StorageAdapter {
  getItem: (key: string) => string | null | Promise<string | null>;
  setItem: (key: string, value: string) => void | Promise<void>;
  removeItem: (key: string) => void | Promise<void>;
}
```

#### 部分持久化

```tsx | pure
import { gfstate, persist } from 'gfstate';

// 只持久化 theme 和 fontSize，不持久化临时数据
const store = gfstate(
  {
    theme: 'light',
    fontSize: 14,
    tempData: null as any, // 这个不需要持久化
  },
  {
    plugins: [
      persist({
        key: 'settings',
        include: ['theme', 'fontSize'],
      }),
    ],
  },
);

// 或者排除不需要持久化的 key
const store2 = gfstate(
  {
    theme: 'light',
    fontSize: 14,
    tempData: null as any,
  },
  {
    plugins: [
      persist({
        key: 'settings-v2',
        exclude: ['tempData'],
      }),
    ],
  },
);
```

#### 版本迁移

```tsx | pure
import { gfstate, persist } from 'gfstate';

const store = gfstate(
  {
    displayName: '', // v2 中从 name 改名为 displayName
    email: '',
    age: 0,
  },
  {
    plugins: [
      persist({
        key: 'user-profile',
        version: 2,
        migrate: (oldState, oldVersion) => {
          if (oldVersion < 2) {
            // v1 -> v2: name -> displayName
            return {
              ...oldState,
              displayName: (oldState as any).name || '',
            };
          }
          return oldState;
        },
      }),
    ],
  },
);
```

#### 自定义存储适配器

```tsx | pure
import { gfstate, persist } from 'gfstate';
import type { StorageAdapter } from 'gfstate';

// 使用 sessionStorage
const sessionAdapter: StorageAdapter = {
  getItem: (key) => sessionStorage.getItem(key),
  setItem: (key, value) => sessionStorage.setItem(key, value),
  removeItem: (key) => sessionStorage.removeItem(key),
};

const store = gfstate(
  { token: '', userId: '' },
  {
    plugins: [
      persist({
        key: 'auth',
        storage: sessionAdapter,
      }),
    ],
  },
);
```

#### 异步存储适配器

persist 支持异步 storage 适配器，例如 React Native 的 AsyncStorage：

```tsx | pure
import { gfstate, persist } from 'gfstate';
import AsyncStorage from '@react-native-async-storage/async-storage';

const store = gfstate(
  { theme: 'light', notifications: true },
  {
    plugins: [
      persist({
        key: 'app-settings',
        storage: AsyncStorage, // AsyncStorage 的 API 兼容 StorageAdapter
      }),
    ],
  },
);
```

### devtools — Redux DevTools 连接

将 store 连接到浏览器的 Redux DevTools Extension，支持状态检查和时间旅行调试。

```tsx
import React from 'react';
import { gfstate, devtools } from 'gfstate';

const store = gfstate(
  {
    count: 0,
    name: 'Alice',
    items: ['React', 'Vue'],
  },
  {
    plugins: [devtools({ name: 'my-app' })],
    storeName: 'app',
  },
);

export default () => {
  return (
    <div>
      <p>count: {store.count}</p>
      <p>name: {store.name}</p>
      <p>items: {store.items.join(', ')}</p>
      <button onClick={() => store.count++}>count +1</button>
      <button onClick={() => (store.name = 'Bob')}>改名</button>
      <button onClick={() => (store.items = [...store.items, 'Angular'])}>
        添加 Angular
      </button>
      <p style={{ color: '#999', fontSize: 12 }}>
        安装 Redux DevTools Extension 后打开开发者工具查看
      </p>
    </div>
  );
};
```

#### devtools 选项

```typescript
interface DevToolsOptions {
  name?: string; // DevTools 中显示的名称
  enabled?: boolean; // 是否启用，默认开发模式启用
  maxAge?: number; // 最大记录数，默认 50
  actionFormatter?: (key: string) => string; // 自定义 action 类型格式化
}
```

#### 自定义 action 名称

```tsx | pure
import { gfstate, devtools } from 'gfstate';

const store = gfstate(
  { count: 0 },
  {
    plugins: [
      devtools({
        name: 'counter',
        actionFormatter: (key) => `COUNTER/${key.toUpperCase()}`,
        // DevTools 中显示: "COUNTER/COUNT" 而不是 "SET count"
      }),
    ],
  },
);
```

#### 生产环境禁用

```tsx | pure
import { gfstate, devtools } from 'gfstate';

const store = gfstate(
  { count: 0 },
  {
    plugins: [devtools({ enabled: false })], // 显式禁用
  },
);
```

## 组合多个插件

```tsx
import React from 'react';
import { gfstate, logger, persist, devtools } from 'gfstate';

const store = gfstate(
  {
    count: 0,
    theme: 'light' as 'light' | 'dark',
    name: 'gfstate',
  },
  {
    storeName: 'main',
    plugins: [
      logger({ exclude: ['name'] }), // 日志（排除 name）
      persist({ key: 'main-store', include: ['theme'] }), // 只持久化 theme
      devtools({ name: 'main-store' }), // Redux DevTools
    ],
  },
);

export default () => {
  return (
    <div>
      <p>count: {store.count}</p>
      <p>theme: {store.theme}</p>
      <p>name: {store.name}</p>
      <button onClick={() => store.count++}>count +1</button>
      <button
        onClick={() =>
          (store.theme = store.theme === 'light' ? 'dark' : 'light')
        }
      >
        切换主题
      </button>
      <button onClick={() => (store.name = store.name + '!')}>修改名称</button>
    </div>
  );
};
```

## 编写自定义插件

### 示例：防抖插件

```tsx | pure
import { gfstate } from 'gfstate';
import type { GfstatePlugin } from 'gfstate';

function debouncePlugin(keys: string[], ms: number): GfstatePlugin {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const pendingValues = new Map<string, unknown>();

  return {
    name: 'debounce',
    onBeforeSet(key, newVal, oldVal, context) {
      if (!keys.includes(key)) return; // 不在列表中的 key 不拦截

      pendingValues.set(key, newVal);

      if (timers.has(key)) clearTimeout(timers.get(key)!);

      timers.set(
        key,
        setTimeout(() => {
          const value = pendingValues.get(key);
          pendingValues.delete(key);
          timers.delete(key);
          context.store[key] = value; // 延迟后真正设置
        }, ms),
      );

      return false; // 取消本次立即设置
    },
    onDestroy() {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
      pendingValues.clear();
    },
  };
}

// 使用：搜索输入防抖
const store = gfstate(
  { searchText: '', results: [] as string[] },
  {
    plugins: [debouncePlugin(['searchText'], 300)],
  },
);
```

### 示例：不可变历史记录插件

```tsx | pure
import { gfstate } from 'gfstate';
import type { GfstatePlugin } from 'gfstate';

function historyPlugin(maxHistory = 20): GfstatePlugin {
  const history: Record<string, unknown>[] = [];
  let currentIndex = -1;

  return {
    name: 'history',
    onInit(context) {
      history.push(context.getSnapshot());
      currentIndex = 0;
    },
    onAfterSet(key, newVal, oldVal, context) {
      // 如果在历史记录中间进行了新操作，截断后面的记录
      if (currentIndex < history.length - 1) {
        history.splice(currentIndex + 1);
      }
      history.push(context.getSnapshot());
      if (history.length > maxHistory) history.shift();
      currentIndex = history.length - 1;
    },
  };
}
```

## 插件去重

同名插件不会被重复注册：

```tsx | pure
import { gfstate, logger } from 'gfstate';

// 全局注册了 logger
gfstate.use(logger());

// 局部也指定了 logger — 不会重复执行
const store = gfstate(
  { count: 0 },
  {
    plugins: [logger()], // 同名 'gfstate:logger' 会被去重
  },
);
```

## 执行顺序

全局插件先于局部插件执行：

```tsx | pure
import { gfstate } from 'gfstate';
import type { GfstatePlugin } from 'gfstate';

const globalPlugin: GfstatePlugin = {
  name: 'global',
  onAfterSet() {
    console.log('1. 全局插件');
  },
};

const localPlugin: GfstatePlugin = {
  name: 'local',
  onAfterSet() {
    console.log('2. 局部插件');
  },
};

gfstate.use(globalPlugin);
const store = gfstate({ count: 0 }, { plugins: [localPlugin] });

store.count = 1;
// 输出:
// 1. 全局插件
// 2. 局部插件
```

## 测试中清理全局插件

```tsx | pure
import { gfstate } from 'gfstate';

// 在测试 setup/teardown 中
beforeEach(() => {
  gfstate.clearPlugins(); // 清除所有全局插件
});
```
