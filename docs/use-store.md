---
title: useStore Hook
order: 3
---

# useStore Hook

`useStore` 是一个 React Hook，用于在组件内部创建组件级别的状态管理。store 随组件生命周期创建和销毁，提供 `state`、`props`、`action`、`ref` 四个命名空间，以及完整的生命周期钩子。

## 基础用法

```tsx
import React from 'react';
import { useStore } from 'gfstate';

export default () => {
  const store = useStore({
    state: { count: 0 },
  });

  return (
    <div>
      <p>count: {store.state.count}</p>
      <button onClick={() => store.state.count++}>+1</button>
      <button onClick={() => (store.state.count = 0)}>重置</button>
    </div>
  );
};
```

## State

`state` 是组件的可变状态，任何时候都可以修改。

```tsx
import React from 'react';
import { useStore } from 'gfstate';

export default () => {
  const store = useStore({
    state: {
      name: 'Alice',
      age: 25,
      email: 'alice@example.com',
    },
  });

  return (
    <div>
      <p>姓名: {store.state.name}</p>
      <p>年龄: {store.state.age}</p>
      <p>邮箱: {store.state.email}</p>
      <input
        value={store.state.name}
        onChange={(e) => (store.state.name = e.target.value)}
        placeholder="输入姓名"
      />
      <button onClick={() => store.state.age++}>年龄 +1</button>
      <button onClick={() => (store.state = { name: '', age: 0, email: '' })}>
        清空
      </button>
    </div>
  );
};
```

## Props

`props` 存储父组件传入的数据，会自动与父组件 props 同步。

```tsx
import React from 'react';
import { useStore } from 'gfstate';

interface ItemProps {
  id: number;
  label: string;
  onDelete: (id: number) => void;
}

const TodoItem: React.FC<ItemProps> = (props) => {
  const store = useStore({
    props,
  });

  return (
    <div style={{ border: '1px solid #ccc', padding: 8, margin: 4 }}>
      <p>ID: {store.props.id}</p>
      <p>标签: {store.props.label}</p>
      <button onClick={() => store.props.onDelete(store.props.id)}>删除</button>
    </div>
  );
};

export default () => {
  const store = useStore({
    state: {
      items: [
        { id: 1, label: '学习 React' },
        { id: 2, label: '学习 gfstate' },
      ],
    },
    action: {
      handleDelete(id: number) {
        store.state.items = store.state.items.filter((item) => item.id !== id);
      },
    },
  });

  return (
    <div>
      {store.state.items.map((item) => (
        <TodoItem
          key={item.id}
          id={item.id}
          label={item.label}
          onDelete={store.action.handleDelete}
        />
      ))}
    </div>
  );
};
```

## Action

`action` 存储方法和函数，可以访问最新的 `state` 和 `props`。

```tsx
import React from 'react';
import { useStore } from 'gfstate';

export default () => {
  const store = useStore({
    state: {
      count: 0,
      items: [] as string[],
    },
    action: {
      increment() {
        store.state.count++;
      },
      incrementBy(n: number) {
        store.state.count += n;
      },
      addItem(item: string) {
        store.state.items = [...store.state.items, item];
      },
      clear() {
        store.state.count = 0;
        store.state.items = [];
      },
      getSummary() {
        return `count=${store.state.count}, items=${store.state.items.length}`;
      },
    },
  });

  return (
    <div>
      <p>count: {store.state.count}</p>
      <p>items: {store.state.items.join(', ')}</p>
      <p>摘要: {store.action.getSummary()}</p>
      <button onClick={store.action.increment}>+1</button>
      <button onClick={() => store.action.incrementBy(10)}>+10</button>
      <button
        onClick={() =>
          store.action.addItem(`item${store.state.items.length + 1}`)
        }
      >
        添加项
      </button>
      <button onClick={store.action.clear}>清空</button>
    </div>
  );
};
```

## Ref

`ref` 存储非响应式变量，不会触发重渲染。适合存储定时器 ID、定时器句柄等。

```tsx
import React from 'react';
import { useStore } from 'gfstate';

export default () => {
  const store = useStore({
    state: {
      count: 0,
    },
    ref: {
      timerId: null as NodeJS.Timeout | null,
      clickCount: 0,
    },
    action: {
      startTimer() {
        if (store.ref.timerId) return;
        store.ref.timerId = setInterval(() => {
          store.state.count++;
        }, 1000);
      },
      stopTimer() {
        if (store.ref.timerId) {
          clearInterval(store.ref.timerId);
          store.ref.timerId = null;
        }
      },
      recordClick() {
        store.ref.clickCount++;
        console.log(`点击了 ${store.ref.clickCount} 次`);
      },
    },
  });

  return (
    <div>
      <p>count: {store.state.count}</p>
      <p>点击次数 (ref，不在 UI 中): {store.ref.clickCount}</p>
      <button onClick={store.action.startTimer}>开始</button>
      <button onClick={store.action.stopTimer}>停止</button>
      <button onClick={store.action.recordClick}>记录点击 (查看控制台)</button>
    </div>
  );
};
```

## 生命周期钩子

useStore 提供四个生命周期钩子：`beforeCreate`、`created`、`mounted`、`unmounted`。

### beforeCreate

在 store 创建前调用，运行在渲染阶段。在 React 严格模式下可能被多次调用，应保持同步且无副作用。

### created

在 store 创建后立即调用，仅在首次渲染时执行一次。可以是异步的，适合初始化逻辑。

### mounted

在组件挂载后调用（useEffect 内），适合执行副作用如订阅、定时器、DOM 操作。

### unmounted

在组件卸载时调用（useEffect 清理函数内），用于清理资源。

```tsx
import React from 'react';
import { useStore } from 'gfstate';

export default () => {
  const store = useStore({
    state: {
      message: 'loading...',
    },
    lifecycle: {
      beforeCreate() {
        console.log('beforeCreate 被调用');
      },
      created(store) {
        console.log('created 被调用，store 已可用');
        // 模拟异步初始化
        setTimeout(() => {
          store.state.message = 'created 初始化完成';
        }, 500);
      },
      mounted(store) {
        console.log('mounted 被调用，组件已挂载');
        store.state.message = 'mounted 完成';
      },
      unmounted() {
        console.log('unmounted 被调用，组件已卸载');
      },
    },
  });

  return (
    <div>
      <p>{store.state.message}</p>
      <p>打开浏览器控制台查看生命周期日志</p>
    </div>
  );
};
```

## 异步初始化

在 `created` 钩子中进行异步数据加载。

```tsx
import React from 'react';
import { useStore } from 'gfstate';

export default () => {
  const store = useStore({
    state: {
      users: [] as Array<{ id: number; name: string }>,
      loading: false,
      error: '',
    },
    lifecycle: {
      created(store) {
        store.state.loading = true;
        // 模拟异步 API 调用
        setTimeout(() => {
          store.state.users = [
            { id: 1, name: 'Alice' },
            { id: 2, name: 'Bob' },
            { id: 3, name: 'Charlie' },
          ];
          store.state.loading = false;
        }, 1000);
      },
    },
  });

  if (store.state.loading) {
    return <p>加载中...</p>;
  }

  if (store.state.error) {
    return <p>错误: {store.state.error}</p>;
  }

  return (
    <ul>
      {store.state.users.map((user) => (
        <li key={user.id}>
          {user.id}: {user.name}
        </li>
      ))}
    </ul>
  );
};
```

## Computed 和 Watch

通过 `options` 参数传递 `computed` 和 `watch` 配置。

```tsx
import React from 'react';
import { useStore } from 'gfstate';

export default () => {
  const store = useStore({
    state: {
      price: 100,
      quantity: 2,
      discount: 0.1,
    },
    options: {
      computed: {
        subtotal: (state) => state.price * state.quantity,
        discountAmount: (state) =>
          state.price * state.quantity * state.discount,
        total: (state) =>
          state.price * state.quantity -
          state.price * state.quantity * state.discount,
      },
      // watch 监听的是 state 的原始属性，不能直接监听 computed 属性
      watch: {
        price: (newVal, oldVal) => {
          console.log(`单价从 ${oldVal} 变为 ${newVal}`);
        },
        quantity: (newVal, oldVal) => {
          console.log(`数量从 ${oldVal} 变为 ${newVal}`);
        },
      },
    },
  });

  // computed 属性挂在 store.state 上，需通过 store.state 访问
  const s = store.state as any;

  return (
    <div>
      <p>单价: {store.state.price}</p>
      <p>数量: {store.state.quantity}</p>
      <p>折扣: {(store.state.discount * 100).toFixed(0)}%</p>
      <hr />
      <p>小计: {s.subtotal}</p>
      <p>折扣金额: {s.discountAmount.toFixed(2)}</p>
      <p>总价: {s.total.toFixed(2)}</p>
      <hr />
      <button onClick={() => (store.state.price += 10)}>单价 +10</button>
      <button onClick={() => store.state.quantity++}>数量 +1</button>
      <button
        onClick={() =>
          (store.state.discount = store.state.discount === 0.1 ? 0.2 : 0.1)
        }
      >
        切换折扣
      </button>
    </div>
  );
};
```

## noGfstateKeys

通过 `options` 的 `noGfstateKeys` 排除某些对象属性被自动包装为子 store。

```tsx
import React from 'react';
import { useStore } from 'gfstate';

export default () => {
  const store = useStore({
    state: {
      config: { theme: 'dark', lang: 'zh' },
      data: { value: 100 },
    },
    options: {
      noGfstateKeys: ['config'],
    },
  });

  return (
    <div>
      <p>config (普通对象): {JSON.stringify(store.state.config)}</p>
      <p>data (子 store): {(store.state as any).data.value}</p>
      <button
        onClick={() =>
          (store.state.config = {
            theme: store.state.config.theme === 'dark' ? 'light' : 'dark',
            lang: store.state.config.lang,
          })
        }
      >
        切换主题
      </button>
      <button onClick={() => ((store.state as any).data.value += 10)}>
        data.value +10
      </button>
    </div>
  );
};
```

## TodoList 综合示例

```tsx
import React from 'react';
import { useStore } from 'gfstate';

interface Todo {
  id: number;
  text: string;
  completed: boolean;
}

export default () => {
  const store = useStore({
    state: {
      todos: [] as Todo[],
      nextId: 1,
      input: '',
    },
    action: {
      addTodo() {
        if (!store.state.input.trim()) return;
        store.state.todos = [
          ...store.state.todos,
          {
            id: store.state.nextId++,
            text: store.state.input,
            completed: false,
          },
        ];
        store.state.input = '';
      },
      toggleTodo(id: number) {
        store.state.todos = store.state.todos.map((todo) =>
          todo.id === id ? { ...todo, completed: !todo.completed } : todo,
        );
      },
      deleteTodo(id: number) {
        store.state.todos = store.state.todos.filter((todo) => todo.id !== id);
      },
      clearCompleted() {
        store.state.todos = store.state.todos.filter((todo) => !todo.completed);
      },
    },
    options: {
      computed: {
        completedCount: (state) =>
          state.todos.filter((t) => t.completed).length,
        totalCount: (state) => state.todos.length,
        remainingCount: (state) =>
          state.todos.filter((t) => !t.completed).length,
      },
    },
  });

  return (
    <div style={{ maxWidth: 400, margin: '0 auto' }}>
      <h2>TodoList</h2>
      <div style={{ marginBottom: 16 }}>
        <input
          value={store.state.input}
          onChange={(e) => (store.state.input = e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && store.action.addTodo()}
          placeholder="输入代办事项..."
          style={{ width: '80%', padding: 4 }}
        />
        <button onClick={store.action.addTodo} style={{ marginLeft: 4 }}>
          添加
        </button>
      </div>

      <div style={{ marginBottom: 16, fontSize: 12, color: '#666' }}>
        完成: {(store.state as any).completedCount}/
        {(store.state as any).totalCount} | 剩余:{' '}
        {(store.state as any).remainingCount}
      </div>

      <ul style={{ listStyle: 'none', padding: 0 }}>
        {store.state.todos.map((todo) => (
          <li
            key={todo.id}
            style={{
              padding: 8,
              marginBottom: 4,
              background: '#f5f5f5',
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>
              <input
                type="checkbox"
                checked={todo.completed}
                onChange={() => store.action.toggleTodo(todo.id)}
              />
              <span
                style={{
                  marginLeft: 8,
                  textDecoration: todo.completed ? 'line-through' : 'none',
                  color: todo.completed ? '#999' : '#000',
                }}
              >
                {todo.text}
              </span>
            </span>
            <button
              onClick={() => store.action.deleteTodo(todo.id)}
              style={{ marginLeft: 8, color: 'red' }}
            >
              删除
            </button>
          </li>
        ))}
      </ul>

      {store.state.todos.some((t) => t.completed) && (
        <button
          onClick={store.action.clearCompleted}
          style={{ marginTop: 16, width: '100%' }}
        >
          清空已完成
        </button>
      )}
    </div>
  );
};
```

## 表单管理示例

```tsx
import React from 'react';
import { useStore } from 'gfstate';

interface FormData {
  username: string;
  email: string;
  password: string;
  rememberMe: boolean;
}

export default () => {
  const store = useStore({
    state: {
      formData: {
        username: '',
        email: '',
        password: '',
        rememberMe: false,
      } as FormData,
      errors: {} as Record<string, string>,
      submitted: false,
    },
    action: {
      updateField(field: keyof FormData, value: any) {
        (store.state.formData as any)[field] = value;
        store.state.errors[field] = ''; // 清除错误
      },
      validate(): boolean {
        const errors: Record<string, string> = {};
        const form = store.state.formData;

        if (!form.username) {
          errors.username = '用户名不能为空';
        }

        if (!form.email) {
          errors.email = '邮箱不能为空';
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
          errors.email = '邮箱格式不正确';
        }

        if (!form.password) {
          errors.password = '密码不能为空';
        } else if (form.password.length < 6) {
          errors.password = '密码至少 6 位';
        }

        store.state.errors = errors;
        return Object.keys(errors).length === 0;
      },
      async submitForm() {
        if (!store.action.validate()) return;

        // 模拟提交
        await new Promise((resolve) => setTimeout(resolve, 1000));
        store.state.submitted = true;

        // 重置表单
        setTimeout(() => {
          store.state.formData = {
            username: '',
            email: '',
            password: '',
            rememberMe: false,
          };
          store.state.submitted = false;
        }, 2000);
      },
      reset() {
        store.state.formData = {
          username: '',
          email: '',
          password: '',
          rememberMe: false,
        };
        store.state.errors = {};
      },
    },
  });

  const form = store.state.formData;

  return (
    <div style={{ maxWidth: 400, margin: '0 auto' }}>
      <h2>登录表单</h2>

      <div style={{ marginBottom: 16 }}>
        <label>用户名</label>
        <input
          type="text"
          value={form.username}
          onChange={(e) => store.action.updateField('username', e.target.value)}
          style={{
            width: '100%',
            padding: 8,
            marginTop: 4,
            borderColor: store.state.errors.username ? 'red' : '#ccc',
            borderWidth: 1,
            borderRadius: 4,
          }}
        />
        {store.state.errors.username && (
          <p style={{ color: 'red', marginTop: 4 }}>
            {store.state.errors.username}
          </p>
        )}
      </div>

      <div style={{ marginBottom: 16 }}>
        <label>邮箱</label>
        <input
          type="email"
          value={form.email}
          onChange={(e) => store.action.updateField('email', e.target.value)}
          style={{
            width: '100%',
            padding: 8,
            marginTop: 4,
            borderColor: store.state.errors.email ? 'red' : '#ccc',
            borderWidth: 1,
            borderRadius: 4,
          }}
        />
        {store.state.errors.email && (
          <p style={{ color: 'red', marginTop: 4 }}>
            {store.state.errors.email}
          </p>
        )}
      </div>

      <div style={{ marginBottom: 16 }}>
        <label>密码</label>
        <input
          type="password"
          value={form.password}
          onChange={(e) => store.action.updateField('password', e.target.value)}
          style={{
            width: '100%',
            padding: 8,
            marginTop: 4,
            borderColor: store.state.errors.password ? 'red' : '#ccc',
            borderWidth: 1,
            borderRadius: 4,
          }}
        />
        {store.state.errors.password && (
          <p style={{ color: 'red', marginTop: 4 }}>
            {store.state.errors.password}
          </p>
        )}
      </div>

      <div style={{ marginBottom: 16 }}>
        <label>
          <input
            type="checkbox"
            checked={form.rememberMe}
            onChange={(e) =>
              store.action.updateField('rememberMe', e.target.checked)
            }
          />
          记住我
        </label>
      </div>

      <div>
        <button
          onClick={store.action.submitForm}
          style={{ width: '48%', padding: 8, marginRight: '4%' }}
          disabled={store.state.submitted}
        >
          {store.state.submitted ? '提交中...' : '登录'}
        </button>
        <button
          onClick={store.action.reset}
          style={{ width: '48%', padding: 8 }}
        >
          重置
        </button>
      </div>

      {store.state.submitted && (
        <p style={{ color: 'green', marginTop: 16 }}>表单已提交！</p>
      )}
    </div>
  );
};
```

## 多个独立 useStore

在同一个组件中可以调用多个 `useStore`，它们相互独立。

```tsx
import React from 'react';
import { useStore } from 'gfstate';

export default () => {
  const counter = useStore({
    state: { count: 0 },
  });

  const timer = useStore({
    state: { seconds: 0 },
    lifecycle: {
      mounted(store) {
        const interval = setInterval(() => {
          store.state.seconds++;
        }, 1000);
        return () => clearInterval(interval);
      },
    },
  });

  return (
    <div>
      <div style={{ border: '1px solid blue', padding: 8, margin: 4 }}>
        <h3>计数器</h3>
        <p>count: {counter.state.count}</p>
        <button onClick={() => counter.state.count++}>+1</button>
      </div>

      <div style={{ border: '1px solid green', padding: 8, margin: 4 }}>
        <h3>计时器</h3>
        <p>seconds: {timer.state.seconds}</p>
      </div>
    </div>
  );
};
```
