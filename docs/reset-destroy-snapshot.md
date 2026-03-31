---
title: reset / destroy / snapshot
order: 3
---

# reset / destroy / snapshot

gfstate store 提供了三个生命周期管理方法：`reset()`、`destroy()` 和 `snapshot()`。它们都是保留属性名，不能用作 state key。

## store.reset() — 重置状态

将 store 的状态重置为初始值（深拷贝），支持重置全部或单个属性。

### 重置所有属性

```tsx
import React from 'react';
import { gfstate } from 'gfstate';

const store = gfstate({ count: 0, name: 'Alice', nested: { x: 1 } });

export default () => {
  return (
    <div>
      <p>count: {store.count}</p>
      <p>name: {store.name}</p>
      <p>nested.x: {store.nested.x}</p>
      <button onClick={() => store.count++}>count +1</button>
      <button onClick={() => (store.name = 'Bob')}>改名</button>
      <button onClick={() => store.nested.x++}>nested.x +1</button>
      <hr />
      <button onClick={() => store.reset()}>重置全部</button>
    </div>
  );
};
```

### 重置单个属性

```tsx
import React from 'react';
import { gfstate } from 'gfstate';

const store = gfstate({ count: 0, name: 'Alice', score: 100 });

export default () => {
  return (
    <div>
      <p>count: {store.count}</p>
      <p>name: {store.name}</p>
      <p>score: {store.score}</p>
      <button
        onClick={() => {
          store.count = 99;
          store.name = 'Bob';
          store.score = 0;
        }}
      >
        修改全部
      </button>
      <button onClick={() => store.reset('count')}>只重置 count</button>
      <button onClick={() => store.reset('name')}>只重置 name</button>
      <button onClick={() => store.reset()}>重置全部</button>
    </div>
  );
};
```

### 配合 computed 和 watch

reset 会触发 computed 重新计算和 watch 回调：

```tsx
import React, { useState } from 'react';
import { gfstate } from 'gfstate';

const logs: string[] = [];

const store = gfstate(
  { price: 100, quantity: 3 },
  {
    computed: {
      total: (state) => state.price * state.quantity,
    },
    watch: {
      price: (newVal, oldVal) => {
        logs.push(`price: ${oldVal} -> ${newVal}`);
      },
      quantity: (newVal, oldVal) => {
        logs.push(`quantity: ${oldVal} -> ${newVal}`);
      },
    },
  },
);

export default () => {
  const [, forceUpdate] = useState(0);
  return (
    <div>
      <p>
        price: {store.price}, quantity: {store.quantity}
      </p>
      <p>total (computed): {(store as any).total}</p>
      <button
        onClick={() => {
          store.price = 200;
          store.quantity = 10;
          forceUpdate((v) => v + 1);
        }}
      >
        修改价格和数量
      </button>
      <button
        onClick={() => {
          store.reset();
          forceUpdate((v) => v + 1);
        }}
      >
        重置（触发 watch 回调）
      </button>
      <div style={{ marginTop: 8, padding: 8, background: '#f5f5f5' }}>
        <strong>Watch 日志:</strong>
        {logs.map((log, i) => (
          <div key={i}>{log}</div>
        ))}
      </div>
    </div>
  );
};
```

### 表单场景：重置表单

```tsx
import React from 'react';
import { gfstate } from 'gfstate';

const form = gfstate({
  username: '',
  email: '',
  age: 18,
  address: {
    city: '',
    street: '',
  },
});

export default () => {
  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <label>用户名: </label>
        <input
          value={form.username}
          onChange={(e) => (form.username = e.target.value)}
        />
      </div>
      <div style={{ marginBottom: 8 }}>
        <label>邮箱: </label>
        <input
          value={form.email}
          onChange={(e) => (form.email = e.target.value)}
        />
      </div>
      <div style={{ marginBottom: 8 }}>
        <label>年龄: </label>
        <input
          type="number"
          value={form.age}
          onChange={(e) => (form.age = Number(e.target.value))}
        />
      </div>
      <div style={{ marginBottom: 8 }}>
        <label>城市: </label>
        <input
          value={form.address.city}
          onChange={(e) => (form.address.city = e.target.value)}
        />
      </div>
      <div style={{ marginBottom: 8 }}>
        <label>街道: </label>
        <input
          value={form.address.street}
          onChange={(e) => (form.address.street = e.target.value)}
        />
      </div>
      <button onClick={() => alert(JSON.stringify(form.snapshot()))}>
        提交
      </button>
      <button onClick={() => form.reset()}>重置表单</button>
    </div>
  );
};
```

## store.destroy() — 销毁 Store

销毁 store，清除所有订阅、watch 监听器和 computed 监听器，释放资源。

### 基础用法

```tsx
import React, { useState, useRef } from 'react';
import { gfstate } from 'gfstate';

const StoreConsumer = ({
  store,
  onDestroy,
}: {
  store: any;
  onDestroy: () => void;
}) => {
  return (
    <>
      <p>count: {store.count}</p>
      <button onClick={() => store.count++}>+1</button>
      <button
        onClick={() => {
          store.destroy();
          onDestroy();
        }}
      >
        销毁 Store
      </button>
    </>
  );
};

export default () => {
  const storeRef = useRef(gfstate({ count: 0 }));
  const [destroyed, setDestroyed] = useState(false);

  return (
    <div>
      {!destroyed ? (
        <StoreConsumer
          store={storeRef.current}
          onDestroy={() => setDestroyed(true)}
        />
      ) : (
        <p>Store 已销毁，所有订阅和监听器已清除。</p>
      )}
    </div>
  );
};
```

### 销毁嵌套子 Store

destroy 会递归销毁所有嵌套子 store：

```tsx | pure
import { gfstate } from 'gfstate';

const store = gfstate({
  user: {
    name: 'Alice',
    address: { city: 'Beijing' },
  },
});

// 销毁会递归清除 user 和 address 子 store
store.destroy();
```

### 特性说明

- 递归销毁所有嵌套子 store
- 销毁后读写 store 属性会在开发模式产生警告
- 幂等操作 — 多次调用安全无副作用
- 销毁后的 store 调用 `reset()` 和 `snapshot()` 也会警告

## store.snapshot() — 状态快照

返回当前 store 状态的深拷贝纯 JS 对象，不包含 Proxy，可安全序列化。

### 基础用法

```tsx
import React, { useState } from 'react';
import { gfstate } from 'gfstate';

const store = gfstate(
  {
    count: 0,
    user: { name: 'Alice', age: 25 },
    ref: { lastSaved: '' },
  },
  {
    computed: {
      doubled: (s) => s.count * 2,
    },
  },
);

export default () => {
  const [snapJson, setSnapJson] = useState('');

  return (
    <div>
      <p>count: {store.count}</p>
      <p>user.name: {store.user.name}</p>
      <p>doubled: {(store as any).doubled}</p>
      <button onClick={() => store.count++}>count +1</button>
      <button onClick={() => (store.user.name = 'Bob')}>改名</button>
      <button
        onClick={() => setSnapJson(JSON.stringify(store.snapshot(), null, 2))}
      >
        获取快照
      </button>
      {snapJson && (
        <pre style={{ padding: 8, background: '#f5f5f5', fontSize: 12 }}>
          {snapJson}
        </pre>
      )}
    </div>
  );
};
```

### 调试和日志

```tsx | pure
import { gfstate } from 'gfstate';

const store = gfstate({ items: ['a', 'b'], status: 'idle' });

// 在操作前后记录快照
const before = store.snapshot();
store.items = [...store.items, 'c'];
store.status = 'updated';
const after = store.snapshot();

console.log('before:', before); // { items: ['a', 'b'], status: 'idle' }
console.log('after:', after); // { items: ['a', 'b', 'c'], status: 'updated' }
```

### 发送到服务端

```tsx | pure
import { gfstate } from 'gfstate';

const formStore = gfstate({
  username: 'Alice',
  email: 'alice@example.com',
  preferences: { theme: 'dark', lang: 'zh-CN' },
});

// snapshot() 返回的纯对象可以直接序列化
async function saveToServer() {
  const data = formStore.snapshot();
  await fetch('/api/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}
```

### 特性说明

- 包含 state、computed、嵌套子 store 和 ref 的值
- 嵌套子 store 会递归快照为纯对象
- 返回的对象没有 Proxy — 完全独立的深拷贝
- 修改快照不会影响原 store
- 销毁后的 store 调用 snapshot() 返回 `{}`

## Symbol 标识符

`reset`、`destroy`、`snapshot` 也可以通过导出的 Symbol 常量访问，适用于编写不依赖字符串属性名的通用工具：

```tsx | pure
import { gfstate, RESET, DESTROY, SNAPSHOT } from 'gfstate';

const store = gfstate({ count: 0 });

store[RESET](); // 等价于 store.reset()
store[SNAPSHOT](); // 等价于 store.snapshot()
store[DESTROY](); // 等价于 store.destroy()
```
