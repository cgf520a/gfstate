---
title: gfstate 核心 API
order: 2
---

# gfstate 核心 API

`gfstate()` 是核心函数，用于创建响应式 store。store 可以在组件外部创建（全局共享），也可以在组件内部创建。

## 基础用法

```tsx
import React from 'react';
import { gfstate } from 'gfstate';

const store = gfstate({ count: 0, name: 'gfstate' });

export default () => {
  return (
    <div>
      <p>count: {store.count}</p>
      <p>name: {store.name}</p>
      <button onClick={() => store.count++}>count +1</button>
      <button onClick={() => (store.name = 'hello')}>改名</button>
    </div>
  );
};
```

## 多种更新方式

gfstate 支持 4 种更新状态的方式，可以根据场景灵活选择。

### 直接赋值

```tsx
import React from 'react';
import { gfstate } from 'gfstate';

const store = gfstate({ count: 0, name: 'Alice' });

export default () => {
  return (
    <div>
      <p>
        count: {store.count}, name: {store.name}
      </p>
      <button
        onClick={() => {
          store.count = 10;
        }}
      >
        设置 count = 10
      </button>
      <button
        onClick={() => {
          store.count += 1;
        }}
      >
        count += 1
      </button>
    </div>
  );
};
```

### store(key, value)

```tsx
import React from 'react';
import { gfstate } from 'gfstate';

const store = gfstate({ count: 0, name: 'Alice' });

export default () => {
  return (
    <div>
      <p>
        count: {store.count}, name: {store.name}
      </p>
      <button onClick={() => store('count', 100)}>store('count', 100)</button>
      <button onClick={() => store('count', (prev) => prev + 5)}>
        store('count', prev =&gt; prev + 5)
      </button>
      <button onClick={() => store('name', 'Bob')}>store('name', 'Bob')</button>
    </div>
  );
};
```

### store({ key: value })

```tsx
import React from 'react';
import { gfstate } from 'gfstate';

const store = gfstate({ count: 0, name: 'Alice' });

export default () => {
  return (
    <div>
      <p>
        count: {store.count}, name: {store.name}
      </p>
      <button onClick={() => store({ count: 99, name: 'Charlie' })}>
        批量更新
      </button>
    </div>
  );
};
```

### store(prev => partial)

```tsx
import React from 'react';
import { gfstate } from 'gfstate';

const store = gfstate({ count: 0, name: 'Alice' });

export default () => {
  return (
    <div>
      <p>
        count: {store.count}, name: {store.name}
      </p>
      <button onClick={() => store(({ count }) => ({ count: count * 2 }))}>
        count 翻倍
      </button>
    </div>
  );
};
```

## Action 方法

在 store 中直接定义函数，它们会被识别为 action。action 的函数引用是稳定的（不会因为重新赋值而改变引用），可以安全传递给子组件。

```tsx
import React from 'react';
import { gfstate } from 'gfstate';

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
  reset() {
    store.count = 0;
  },
});

export default () => {
  return (
    <div>
      <p>count: {store.count}</p>
      <button onClick={store.increment}>+1</button>
      <button onClick={store.decrement}>-1</button>
      <button onClick={() => store.incrementBy(10)}>+10</button>
      <button onClick={store.reset}>重置</button>
    </div>
  );
};
```

## 函数初始化

可以传入工厂函数来延迟初始化 store 数据。

```tsx
import React from 'react';
import { gfstate } from 'gfstate';

// 工厂函数：延迟计算初始值
const store = gfstate(() => ({
  timestamp: Date.now(),
  items: ['item1', 'item2', 'item3'],
}));

export default () => {
  return (
    <div>
      <p>创建时间戳: {store.timestamp}</p>
      <p>items: {store.items.join(', ')}</p>
    </div>
  );
};
```

### syncWrapper

使用 `syncWrapper` 对单个属性进行函数初始化，避免整个函数被识别为 action。

```tsx
import React from 'react';
import { gfstate, syncWrapper } from 'gfstate';

const store = gfstate({
  // syncWrapper 会立即执行函数并将返回值作为初始值
  expensiveValue: syncWrapper(() => {
    let sum = 0;
    for (let i = 0; i < 1000; i++) sum += i;
    return sum;
  }),
  normalValue: 'hello',
});

export default () => {
  return (
    <div>
      <p>expensiveValue: {store.expensiveValue}</p>
      <p>normalValue: {store.normalValue}</p>
    </div>
  );
};
```

## 嵌套对象

普通对象属性会被自动递归包装为子 store，每层都可以独立响应更新。

```tsx
import React from 'react';
import { gfstate } from 'gfstate';

const store = gfstate({
  user: {
    name: 'Alice',
    age: 25,
    address: {
      city: 'Beijing',
      street: 'Main St',
    },
  },
  count: 0,
});

const UserInfo = () => {
  return (
    <div style={{ border: '1px solid #ccc', padding: 8, margin: 8 }}>
      <h4>UserInfo 组件</h4>
      <p>姓名: {store.user.name}</p>
      <p>年龄: {store.user.age}</p>
      <button onClick={() => (store.user.name = 'Bob')}>改名为 Bob</button>
      <button onClick={() => store.user.age++}>年龄 +1</button>
    </div>
  );
};

const AddressInfo = () => {
  return (
    <div style={{ border: '1px solid #ccc', padding: 8, margin: 8 }}>
      <h4>AddressInfo 组件</h4>
      <p>城市: {store.user.address.city}</p>
      <p>街道: {store.user.address.street}</p>
      <button onClick={() => (store.user.address.city = 'Shanghai')}>
        改城市为 Shanghai
      </button>
    </div>
  );
};

const Counter = () => {
  return (
    <div style={{ border: '1px solid #ccc', padding: 8, margin: 8 }}>
      <h4>Counter 组件 (不受 user 变化影响)</h4>
      <p>count: {store.count}</p>
      <button onClick={() => store.count++}>+1</button>
    </div>
  );
};

export default () => {
  return (
    <div>
      <UserInfo />
      <AddressInfo />
      <Counter />
    </div>
  );
};
```

### 嵌套对象批量更新

```tsx
import React from 'react';
import { gfstate } from 'gfstate';

const store = gfstate({
  profile: {
    name: 'Alice',
    age: 25,
    email: 'alice@example.com',
  },
});

export default () => {
  return (
    <div>
      <p>姓名: {store.profile.name}</p>
      <p>年龄: {store.profile.age}</p>
      <p>邮箱: {store.profile.email}</p>
      <button
        onClick={() =>
          store.profile({ name: 'Bob', age: 30, email: 'bob@example.com' })
        }
      >
        批量更新 profile
      </button>
    </div>
  );
};
```

## noGfstateKeys

某些对象属性你可能不希望被自动包装为子 store（例如表单配置、第三方库数据），可以通过 `noGfstateKeys` 排除。

```tsx
import React from 'react';
import { gfstate } from 'gfstate';

const store = gfstate(
  {
    formData: { name: '', age: 0 },
    config: { theme: 'dark', locale: 'zh-CN' },
  },
  {
    // config 不会被自动包装为子 store，只能整体替换
    noGfstateKeys: ['config'],
  },
);

export default () => {
  return (
    <div>
      <p>formData.name (子 store): {store.formData.name}</p>
      <p>config (普通对象): {JSON.stringify(store.config)}</p>
      <button onClick={() => (store.formData.name = 'Alice')}>
        更新 formData.name
      </button>
      <button
        onClick={() => (store.config = { theme: 'light', locale: 'en-US' })}
      >
        替换 config
      </button>
    </div>
  );
};
```

## computed 计算属性

计算属性基于 state 自动派生，只在依赖变化时重新计算，结果自动缓存。

```tsx
import React from 'react';
import { gfstate } from 'gfstate';

const store = gfstate(
  {
    firstName: 'John',
    lastName: 'Doe',
    price: 100,
    quantity: 3,
  },
  {
    computed: {
      fullName: (state) => `${state.firstName} ${state.lastName}`,
      total: (state) => state.price * state.quantity,
      summary: (state) =>
        `${state.quantity} 件商品，单价 ${state.price}，总价 ${
          state.price * state.quantity
        }`,
    },
  },
);

export default () => {
  return (
    <div>
      <p>全名: {store.fullName}</p>
      <p>总价: {store.total}</p>
      <p>摘要: {store.summary}</p>
      <hr />
      <button onClick={() => (store.firstName = 'Jane')}>改名为 Jane</button>
      <button onClick={() => store.quantity++}>数量 +1</button>
      <button onClick={() => (store.price += 10)}>单价 +10</button>
    </div>
  );
};
```

## watch 监听器

监听指定 state 属性的变化，执行回调。

```tsx
import React, { useState } from 'react';
import { gfstate } from 'gfstate';

const logs: string[] = [];

const store = gfstate(
  { count: 0, name: 'Alice' },
  {
    watch: {
      count: (newVal, oldVal) => {
        logs.push(`count: ${oldVal} -> ${newVal}`);
      },
      name: (newVal, oldVal) => {
        logs.push(`name: "${oldVal}" -> "${newVal}"`);
      },
    },
  },
);

export default () => {
  const [, forceUpdate] = useState(0);
  return (
    <div>
      <p>count: {store.count}</p>
      <p>name: {store.name}</p>
      <button
        onClick={() => {
          store.count++;
          forceUpdate((v) => v + 1);
        }}
      >
        count +1
      </button>
      <button
        onClick={() => {
          store.name = 'Bob';
          forceUpdate((v) => v + 1);
        }}
      >
        改名为 Bob
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

## created 生命周期

store 创建后立即执行的回调，可用于初始化逻辑。

```tsx
import React from 'react';
import { gfstate } from 'gfstate';

const store = gfstate(
  { items: [] as string[], status: 'idle' },
  {
    created: (store) => {
      // 模拟异步加载数据
      store.status = 'loading';
      setTimeout(() => {
        store.items = ['React', 'Vue', 'Angular'];
        store.status = 'done';
      }, 1000);
    },
  },
);

export default () => {
  return (
    <div>
      <p>状态: {store.status}</p>
      <p>
        列表: {store.items.length > 0 ? store.items.join(', ') : '加载中...'}
      </p>
    </div>
  );
};
```

## ref 非响应式存储

以 `ref` 为 key 的属性不会被 gfstate 代理，读写不触发任何更新，适合存储不需要响应式的数据。

```tsx
import React, { useState } from 'react';
import { gfstate } from 'gfstate';

const store = gfstate({
  count: 0,
  ref: {
    renderCount: 0,
    lastUpdated: '',
  },
});

export default () => {
  store.ref.renderCount++;
  store.ref.lastUpdated = new Date().toLocaleTimeString();

  return (
    <div>
      <p>count: {store.count}</p>
      <p>渲染次数 (ref): {store.ref.renderCount}</p>
      <p>最后更新 (ref): {store.ref.lastUpdated}</p>
      <button onClick={() => store.count++}>count +1 (触发重渲染)</button>
    </div>
  );
};
```

## 数组状态

数组是按引用比较的，`push/pop` 等原地修改不会触发更新。需要替换整个数组引用。

```tsx
import React from 'react';
import { gfstate } from 'gfstate';

const store = gfstate({
  items: ['Apple', 'Banana'],
});

export default () => {
  return (
    <div>
      <ul>
        {store.items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
      <button onClick={() => (store.items = [...store.items, 'Cherry'])}>
        添加 Cherry
      </button>
      <button
        onClick={() =>
          (store.items = store.items.filter(
            (_, i) => i !== store.items.length - 1,
          ))
        }
      >
        删除最后一项
      </button>
      <button onClick={() => (store.items = [])}>清空</button>
    </div>
  );
};
```

## 多组件共享 Store

store 在组件外部创建时，多个组件可以共享同一份状态。每个组件只在其读取的属性变化时重渲染。

```tsx
import React, { useRef } from 'react';
import { gfstate } from 'gfstate';

const store = gfstate({
  count: 0,
  name: 'gfstate',
});

const CountDisplay = () => {
  const renderCount = useRef(0);
  renderCount.current++;
  return (
    <div style={{ border: '1px solid blue', padding: 8, margin: 4 }}>
      <strong>CountDisplay</strong> (渲染: {renderCount.current})
      <p>count: {store.count}</p>
    </div>
  );
};

const NameDisplay = () => {
  const renderCount = useRef(0);
  renderCount.current++;
  return (
    <div style={{ border: '1px solid green', padding: 8, margin: 4 }}>
      <strong>NameDisplay</strong> (渲染: {renderCount.current})
      <p>name: {store.name}</p>
    </div>
  );
};

export default () => {
  return (
    <div>
      <p>
        修改 count 只会触发 CountDisplay 重渲染，NameDisplay
        不受影响，反之亦然：
      </p>
      <CountDisplay />
      <NameDisplay />
      <button onClick={() => store.count++}>count +1</button>
      <button onClick={() => (store.name = store.name + '!')}>
        name 加感叹号
      </button>
    </div>
  );
};
```

## gfstate.config 批量更新

使用 `gfstate.config` 配合 `ReactDOM.unstable_batchedUpdates` 将多次同步更新合并为一次渲染。

```tsx
import React from 'react';
import ReactDOM from 'react-dom';
import { gfstate } from 'gfstate';

// 配置批量更新（通常在应用入口处调用一次）
gfstate.config({ batch: ReactDOM.unstable_batchedUpdates });

const store = gfstate({ a: 0, b: 0 });

export default () => {
  return (
    <div>
      <p>
        a: {store.a}, b: {store.b}
      </p>
      <button
        onClick={() => {
          // 两次更新会被合并为一次渲染
          store.a++;
          store.b++;
        }}
      >
        同时更新 a 和 b
      </button>
    </div>
  );
};
```

## isGfstateStore 类型守卫

判断一个对象是否是 gfstate store。

```tsx
import React from 'react';
import { gfstate, isGfstateStore } from 'gfstate';

const store = gfstate({ count: 0 });
const plain = { count: 0 };

export default () => {
  return (
    <div>
      <p>store 是 gfstate store: {String(isGfstateStore(store))}</p>
      <p>plain 是 gfstate store: {String(isGfstateStore(plain))}</p>
    </div>
  );
};
```

## 各种数据类型

gfstate 支持多种数据类型作为状态值。

```tsx
import React from 'react';
import { gfstate } from 'gfstate';

const store = gfstate({
  str: 'hello',
  num: 42,
  bool: true,
  nullable: null as string | null,
  date: new Date(),
  regex: /hello/gi,
  items: [1, 2, 3],
  nested: { x: 1, y: 2 },
});

export default () => {
  return (
    <div>
      <p>string: {store.str}</p>
      <p>number: {store.num}</p>
      <p>boolean: {String(store.bool)}</p>
      <p>null: {String(store.nullable)}</p>
      <p>Date: {store.date.toISOString()}</p>
      <p>RegExp: {store.regex.toString()}</p>
      <p>Array: {JSON.stringify(store.items)}</p>
      <p>
        嵌套对象 x: {store.nested.x}, y: {store.nested.y}
      </p>
      <hr />
      <button onClick={() => (store.str = 'world')}>修改 string</button>
      <button onClick={() => store.num++}>number +1</button>
      <button onClick={() => (store.bool = !store.bool)}>切换 boolean</button>
      <button
        onClick={() => (store.nullable = store.nullable ? null : 'not null')}
      >
        切换 null
      </button>
      <button onClick={() => (store.date = new Date())}>更新 Date</button>
      <button
        onClick={() => (store.items = [...store.items, store.items.length + 1])}
      >
        添加数组元素
      </button>
      <button onClick={() => store.nested.x++}>嵌套 x +1</button>
    </div>
  );
};
```

## 动态添加属性

可以在运行时向 store 添加新的状态属性。

```tsx
import React from 'react';
import { gfstate } from 'gfstate';

const store = gfstate({ count: 0 }) as any;

export default () => {
  return (
    <div>
      <p>count: {store.count}</p>
      <p>dynamic: {store.dynamic ?? '(未定义)'}</p>
      <button onClick={() => store.count++}>count +1</button>
      <button onClick={() => (store.dynamic = 'hello!')}>
        添加 dynamic 属性
      </button>
      <button
        onClick={() => store.dynamic && (store.dynamic = store.dynamic + '!')}
      >
        修改 dynamic
      </button>
    </div>
  );
};
```
