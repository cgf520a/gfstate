---
title: 快速上手
order: 1
---

# 快速上手

## 安装

```bash
npm install gfstate
# 或
pnpm add gfstate
# 或
yarn add gfstate
```

gfstate 需要 React 18+ 作为 peer dependency。

## 核心概念

gfstate 提供两种使用方式：

- **`gfstate()`** — 创建全局/跨组件共享的 store
- **`useStore()`** — 创建组件级别的 store（随组件生命周期创建和销毁）

## 第一个示例：计数器

### 全局 Store 方式

```tsx
import React from 'react';
import { gfstate } from 'gfstate';

// 在组件外部创建 store，多个组件可共享
const counter = gfstate({ count: 0 });

export default () => {
  return (
    <div>
      <h3>计数器：{counter.count}</h3>
      <button onClick={() => counter.count++}>+1</button>
      <button onClick={() => counter.count--}>-1</button>
      <button onClick={() => (counter.count = 0)}>重置</button>
    </div>
  );
};
```

### 组件级 Store 方式

```tsx
import React from 'react';
import { useStore } from 'gfstate';

export default () => {
  const store = useStore({
    state: { count: 0 },
  });

  return (
    <div>
      <h3>计数器：{store.state.count}</h3>
      <button onClick={() => store.state.count++}>+1</button>
      <button onClick={() => store.state.count--}>-1</button>
      <button onClick={() => (store.state.count = 0)}>重置</button>
    </div>
  );
};
```

## 下一步

- [gfstate 核心 API](/gfstate) — 全局 store 的完整用法和示例
- [useStore Hook](/use-store) — 组件级 store 的完整用法和示例
- [API 参考](/api) — 完整的类型签名和参数说明
