import '@testing-library/jest-dom';
import { renderHook, render, fireEvent } from '@testing-library/react';
import useStore, { type StoreWithStateAndProps } from './index';
import React, { createContext, useContext } from 'react';
import { isGfstateStore } from '../GfState';

describe('useStore', () => {
  it('基本使用', async () => {
    const { result } = renderHook(() => {
      const store = useStore({
        state: { count: 0 },
      });
      return store;
    });

    expect(result.current.state.count).toBe(0);

    result.current.state({ count: 5 });
    expect(result.current.state.count).toBe(5);
    result.current.state.count += 1;
    expect(result.current.state.count).toBe(6);
  });

  it('组件中使用', async () => {
    const App = () => {
      const store = useStore({ state: { count: 10 } });

      const { count } = store.state;

      return (
        <div>
          <span>{count}</span>
          <button
            onClick={() => {
              store.state.count += 1;
            }}
          >
            Increment
          </button>
        </div>
      );
    };

    const { getByText } = render(<App />);
    expect(getByText('10')).toBeTruthy();
    fireEvent.click(getByText('Increment'));
    expect(getByText('11')).toBeTruthy();
  });

  it('组件中使用props', async () => {
    const context = createContext<StoreWithStateAndProps | undefined>(
      undefined,
    );

    let renderComA = 0;

    const ComA = () => {
      const store = useContext(context);
      const { a } = store!.props;
      const { count } = store!.state;

      renderComA += 1;

      return (
        <>
          <p>{a}</p>
          <p>{count}</p>
          <p>{`renderA${renderComA}次`}</p>
        </>
      );
    };

    let renderComB = 0;

    const ComB = () => {
      const store = useContext(context);
      const { b } = store!.props;

      renderComB += 1;

      return (
        <>
          <p>{b}</p>
          <p>{`renderB${renderComB}次`}</p>
        </>
      );
    };

    const App = (props: { a: string; b: string }) => {
      const store = useStore({
        state: {
          count: 10,
        },
        props,
      });

      return (
        <context.Provider value={store}>
          <button
            onClick={() => {
              store.state.count += 1;
            }}
          >
            Increment
          </button>
          <ComA />
          <ComB />
        </context.Provider>
      );
    };

    const { getByText } = render(<App a={'ComA'} b={'ComB'} />);

    expect(getByText('10')).toBeTruthy();
    expect(getByText('ComA')).toBeTruthy();
    expect(getByText('ComB')).toBeTruthy();

    fireEvent.click(getByText('Increment'));
    expect(getByText('11')).toBeTruthy();
    expect(getByText('renderA2次')).toBeTruthy();
    expect(getByText('renderB1次')).toBeTruthy();

    // 父级render，子组件也会render
    render(<App a={'ComA changed'} b={'ComB'} />);
    expect(getByText('ComA changed')).toBeTruthy();
    expect(getByText('renderA3次')).toBeTruthy();
    expect(getByText('renderB2次')).toBeTruthy();
  });

  it('使用生命周期', () => {
    const lifecycle = {
      beforeCreate: jest.fn(),
      created: jest.fn(),
      mounted: jest.fn(),
      unmounted: jest.fn(),
    };

    const App = () => {
      useStore({
        state: { count: 0 },
        lifecycle,
      });
      return <div>App</div>;
    };

    const { unmount } = render(<App />);

    expect(lifecycle.beforeCreate).toHaveBeenCalledTimes(1);
    expect(lifecycle.created).toHaveBeenCalledTimes(1);
    expect(lifecycle.mounted).toHaveBeenCalledTimes(1);

    unmount();
    expect(lifecycle.unmounted).toHaveBeenCalledTimes(1);
  });

  it('使用生命周期，state异步初始化', async () => {
    const fetchInitialCount = () =>
      new Promise<number>((resolve) => {
        setTimeout(() => {
          resolve(42);
        }, 1000);
      });

    const App = () => {
      const store = useStore<{ count?: number }>({
        lifecycle: {
          async created(innerStore) {
            const initialCount = await fetchInitialCount();
            innerStore.state.count = initialCount;
          },
        },
      });

      const { count } = store.state;

      return <div>{count}</div>;
    };

    const { findByText } = render(<App />);

    const updatedElement = await findByText('42');
    expect(updatedElement).toBeTruthy();
  });

  it('使用生命周期，state为数组', async () => {
    const fetchInitialCount = () =>
      new Promise<number[]>((resolve) => {
        setTimeout(() => {
          resolve([42]);
        }, 1000);
      });

    const App = () => {
      const store = useStore<{ count: number[] }>({
        state: { count: [] },
        lifecycle: {
          async created(innerStore) {
            const initialCount = await fetchInitialCount();
            innerStore.state.count = initialCount;
          },
        },
      });

      const { count } = store.state;

      return <div>{count}</div>;
    };

    const { findByText } = render(<App />);

    const updatedElement = await findByText('42');
    expect(updatedElement).toBeTruthy();
  });

  it('使用ref存放普通变量', async () => {
    const fn = jest.fn();
    const App = () => {
      const store = useStore({
        state: { count: 0, record: 0 },
        action: {
          increment() {
            store.state.count += 1;
            // 无论执行多少次
            expect(store.ref.timerId).toBe(store.state.record);
          },
        },
        ref: {
          timerId: 0,
        },
        lifecycle: {
          mounted(innerStore) {
            innerStore.ref.timerId = window.setInterval(fn, 1000);
            store.state.record = innerStore.ref.timerId;
          },
          unmounted(innerStore) {
            if (innerStore.ref.timerId !== 0) {
              clearInterval(innerStore.ref.timerId);
              innerStore.ref.timerId = 0;
            }
          },
        },
      });
      const { count } = store.state;

      return (
        <div>
          <p>{count}</p>
          <button onClick={store.action.increment}>increment</button>
        </div>
      );
    };

    const { unmount, getByText } = render(<App />);

    // 等待一段时间以确保定时器启动
    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect(fn).toHaveBeenCalledTimes(1);
    fireEvent.click(getByText('increment'));
    expect(getByText('1')).toBeTruthy();
    fireEvent.click(getByText('increment'));
    expect(getByText('2')).toBeTruthy();
    fireEvent.click(getByText('increment'));
    expect(getByText('3')).toBeTruthy();

    unmount();
    // 等待一段时间以确保定时器被清除
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  it('使用action方法，方法中依赖的状态应该拿到最新', () => {
    const App = () => {
      const [a, setA] = React.useState(1);

      const store = useStore({
        state: { count: 0 },
        action: {
          increment() {
            if (a === 1) {
              setA(10);
            }
            store.state.count += a;
          },
        },
      });

      const { count } = store.state;

      React.useEffect(() => {}, []);

      return (
        <div>
          <p>{count}</p>
          <button onClick={store.action.increment}>increment</button>
        </div>
      );
    };

    const { getByText } = render(<App />);

    expect(getByText('0')).toBeTruthy();
    fireEvent.click(getByText('increment'));
    expect(getByText('1')).toBeTruthy();
    fireEvent.click(getByText('increment'));
    expect(getByText('11')).toBeTruthy();
    fireEvent.click(getByText('increment'));
    expect(getByText('21')).toBeTruthy();
  });

  it('使用options配置状态不应用gfstate', () => {
    const App = () => {
      const store = useStore({
        state: {
          a: {
            c: 1,
          },
          b: {
            d: 11,
          },
          reactEl: <div>hello</div>,
        },
        options: {
          noGfstateKeys: ['b'],
        },
      });
      const { c } = store.state.a;
      const { d } = store.state.b;
      const { reactEl } = store.state;

      expect(isGfstateStore(store.state.a)).toBe(true);
      expect(isGfstateStore(store.state.b)).toBe(false);

      return (
        <>
          <p>{c}</p>
          <p>{d}</p>
          {reactEl}
          <button
            onClick={() => {
              store.state.b.d += 1;
            }}
          >
            btn
          </button>
          <button
            onClick={() => {
              store.state.a.c += 1;
              // 这里由于a刷新了，所以b也会刷新，但不是因为b是gfstate对象，而是因为a刷新导致整个组件刷新了
              store.state.b.d += 1;
            }}
          >
            btn2
          </button>
        </>
      );
    };

    const { getByText } = render(<App />);

    expect(getByText('1')).toBeTruthy();
    expect(getByText('11')).toBeTruthy();
    expect(getByText('hello')).toBeTruthy();

    fireEvent.click(getByText('btn'));
    expect(getByText('1')).toBeTruthy();
    expect(getByText('11')).toBeTruthy();
    fireEvent.click(getByText('btn2'));
    expect(getByText('2')).toBeTruthy();
    expect(getByText('13')).toBeTruthy();
  });

  it('action 参数：函数引用跨渲染保持稳定', () => {
    const App = () => {
      const store = useStore({
        action: {
          doSomething() {
            // mock action
          },
        },
      });

      const actionRef = React.useRef<any>(null);
      if (!actionRef.current) {
        actionRef.current = store.action.doSomething;
      }

      expect(store.action.doSomething).toBe(actionRef.current);

      return <div>ok</div>;
    };

    render(<App />);
  });

  it('action 参数：方法可访问最新 state', () => {
    const App = () => {
      const store = useStore({
        state: { count: 0 },
        action: {
          getCountDoubled() {
            return store.state.count * 2;
          },
        },
      });

      const { count } = store.state;

      return (
        <>
          <p>count:{count}</p>
          <p>doubled:{store.action.getCountDoubled()}</p>
          <button onClick={() => (store.state.count += 1)}>inc</button>
        </>
      );
    };

    const { getByText } = render(<App />);
    expect(getByText('doubled:0')).toBeInTheDocument();

    fireEvent.click(getByText('inc'));
    expect(getByText('count:1')).toBeInTheDocument();
    expect(getByText('doubled:2')).toBeInTheDocument();
  });

  it('仅 props 的 store（无 state/action）', () => {
    const App = () => {
      const store = useStore({
        props: { name: 'test', value: 42 },
      });

      const { name, value } = store.props;

      return (
        <>
          <p>name:{name}</p>
          <p>value:{value}</p>
        </>
      );
    };

    const { getByText } = render(<App />);
    expect(getByText('name:test')).toBeInTheDocument();
    expect(getByText('value:42')).toBeInTheDocument();
  });

  it('同一组件多次调用 useStore 创建独立 store', () => {
    const App = () => {
      const store1 = useStore({ state: { a: 1 } });
      const store2 = useStore({ state: { b: 2 } });

      return (
        <>
          <p>a:{store1.state.a}</p>
          <p>b:{store2.state.b}</p>
          <button onClick={() => (store1.state.a += 1)}>inc a</button>
          <button onClick={() => (store2.state.b += 1)}>inc b</button>
        </>
      );
    };

    const { getByText } = render(<App />);

    fireEvent.click(getByText('inc a'));
    expect(getByText('a:2')).toBeInTheDocument();
    expect(getByText('b:2')).toBeInTheDocument();

    fireEvent.click(getByText('inc b'));
    expect(getByText('a:2')).toBeInTheDocument();
    expect(getByText('b:3')).toBeInTheDocument();
  });

  it('useStore 使用 computed 选项', () => {
    const App = () => {
      const store = useStore({
        state: { count: 0 },
        options: {
          computed: {
            double: (s) => s.count * 2,
          },
        },
      });

      const double = (store.state as any).double;
      const { count } = store.state;

      return (
        <>
          <p>count:{count}</p>
          <p>double:{double}</p>
          <button onClick={() => (store.state.count += 1)}>inc</button>
        </>
      );
    };

    const { getByText } = render(<App />);
    expect(getByText('double:0')).toBeInTheDocument();

    fireEvent.click(getByText('inc'));
    expect(getByText('double:2')).toBeInTheDocument();
  });

  it('useStore 使用 watch 选项', () => {
    const changes: number[] = [];

    const App = () => {
      const store = useStore({
        state: { count: 0 },
        options: {
          watch: {
            count: (newVal) => {
              changes.push(newVal);
            },
          },
        },
      });

      const { count } = store.state;

      return (
        <>
          <p>count:{count}</p>
          <button onClick={() => (store.state.count += 1)}>inc</button>
        </>
      );
    };

    const { getByText } = render(<App />);

    fireEvent.click(getByText('inc'));
    expect(changes).toContain(1);

    fireEvent.click(getByText('inc'));
    expect(changes).toContain(2);
  });

  it('beforeCreate 在 created 之前执行', () => {
    const callOrder: string[] = [];

    const App = () => {
      useStore({
        state: { count: 0 },
        lifecycle: {
          beforeCreate() {
            callOrder.push('beforeCreate');
          },
          created() {
            callOrder.push('created');
          },
        },
      });

      return <div>ok</div>;
    };

    render(<App />);

    expect(callOrder).toEqual(['beforeCreate', 'created']);
  });

  it('created 回调接收完整复合 store', () => {
    let receivedStore: any = null;

    const App = () => {
      useStore({
        state: { count: 0 },
        props: { name: 'test' },
        action: { inc() {} },
        ref: { refValue: 'test' },
        lifecycle: {
          created(store) {
            receivedStore = store;
          },
        },
      });

      return <div>ok</div>;
    };

    render(<App />);

    expect(receivedStore.state).toBeDefined();
    expect(receivedStore.props).toBeDefined();
    expect(receivedStore.action).toBeDefined();
    expect(receivedStore.ref).toBeDefined();
    expect(isGfstateStore(receivedStore.state)).toBe(true);
    expect(isGfstateStore(receivedStore.props)).toBe(true);
    expect(isGfstateStore(receivedStore.action)).toBe(true);
  });

  it('mounted 中可发起异步数据加载', async () => {
    const App = () => {
      const store = useStore({
        state: { data: 'loading' as string },
        lifecycle: {
          mounted(innerStore) {
            setTimeout(() => {
              innerStore.state.data = 'loaded';
            }, 50);
          },
        },
      });

      const { data } = store.state;

      return <p>{data}</p>;
    };

    const { getByText, findByText } = render(<App />);
    expect(getByText('loading')).toBeInTheDocument();

    const loadedElement = await findByText('loaded');
    expect(loadedElement).toBeInTheDocument();
  });

  it('unmounted 清理定时器/订阅', async () => {
    const fn = jest.fn();

    const App = () => {
      const store = useStore({
        state: { count: 0 },
        lifecycle: {
          mounted(innerStore) {
            const timerId = setInterval(fn, 100);
            innerStore.ref = { timerId };
          },
          unmounted(innerStore) {
            if (innerStore.ref.timerId) {
              clearInterval(innerStore.ref.timerId);
            }
          },
        },
      });

      return <div>ok</div>;
    };

    const { unmount } = render(<App />);

    // 等待定时器至少触发一次
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(fn).toHaveBeenCalled();

    const callCountBefore = fn.mock.calls.length;
    unmount();

    // 等待一段时间，如果清理不成功，会继续调用
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(fn.mock.calls.length).toBe(callCountBefore);
  });

  it('父组件重渲染时 props 同步更新', () => {
    const App = (props: { name: string }) => {
      const store = useStore({
        props,
      });

      const { name } = store.props;

      return <p>{name}</p>;
    };

    const Parent = () => {
      const [name, setName] = React.useState('Alice');

      return (
        <>
          <App name={name} />
          <button onClick={() => setName('Bob')}>change</button>
        </>
      );
    };

    const { getByText } = render(<Parent />);
    expect(getByText('Alice')).toBeInTheDocument();

    fireEvent.click(getByText('change'));
    expect(getByText('Bob')).toBeInTheDocument();
  });

  it('action 闭包在父重渲染后使用最新值', () => {
    const App = (props: { multiplier: number }) => {
      const store = useStore({
        state: { count: 1 },
        action: {
          multiply() {
            return store.state.count * props.multiplier;
          },
        },
        props,
      });

      const result = store.action.multiply();

      return <p>result:{result}</p>;
    };

    const Parent = () => {
      const [multiplier, setMultiplier] = React.useState(2);

      return (
        <>
          <App multiplier={multiplier} />
          <button onClick={() => setMultiplier(3)}>change</button>
        </>
      );
    };

    const { getByText } = render(<Parent />);
    expect(getByText('result:2')).toBeInTheDocument();

    fireEvent.click(getByText('change'));
    expect(getByText('result:3')).toBeInTheDocument();
  });

  // ========== 补全测试覆盖 ==========

  it('React.StrictMode 下 beforeCreate 每次挂载执行一次', () => {
    let callCount = 0;
    const App = () => {
      useStore({
        state: { count: 0 },
        lifecycle: {
          beforeCreate() {
            callCount++;
          },
        },
      });
      return <div>ok</div>;
    };

    render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );

    // React 18 StrictMode 开发模式下会卸载并重新挂载组件，
    // 每次挂载都会创建新的 useRef，因此 beforeCreate 被调用 2 次
    expect(callCount).toBe(2);
  });

  it('useStore({}) 创建空 store 不报错', () => {
    const App = () => {
      const store = useStore({});
      return <div>has-state:{String(!!store.state)}</div>;
    };
    const { getByText } = render(<App />);
    expect(getByText(/has-state:true/)).toBeInTheDocument();
  });

  it('action 调用另一个 action', () => {
    let storeRef: any;
    const App = () => {
      const store = useStore({
        state: { count: 0 },
        action: {
          increment() {
            storeRef.state.count = (storeRef.state.count as number) + 1;
          },
          incrementTwice() {
            storeRef.action.increment();
            storeRef.action.increment();
          },
        },
      });
      storeRef = store;
      const { count } = store.state;
      return (
        <>
          <p>{count as number}</p>
          <button onClick={store.action.incrementTwice}>double</button>
        </>
      );
    };
    const { getByText } = render(<App />);
    expect(getByText('0')).toBeInTheDocument();

    fireEvent.click(getByText('double'));
    expect(getByText('2')).toBeInTheDocument();
  });

  it('action 抛错不破坏 store 状态', () => {
    let storeRef: any;
    const App = () => {
      const store = useStore({
        state: { count: 0 },
        action: {
          badAction() {
            storeRef.state.count = 10;
            throw new Error('boom');
          },
        },
      });
      storeRef = store;
      const { count } = store.state;
      return (
        <>
          <p>{count as number}</p>
          <button
            onClick={() => {
              try {
                store.action.badAction();
              } catch {
                // 忽略错误
              }
            }}
          >
            bad
          </button>
        </>
      );
    };
    const { getByText } = render(<App />);
    fireEvent.click(getByText('bad'));
    expect(getByText('10')).toBeInTheDocument();
  });

  it('useStore computed 依赖 state', () => {
    const App = () => {
      const store = useStore({
        state: { count: 2 },
        options: {
          computed: {
            doubled: (s: Record<string, unknown>) => (s.count as number) * 2,
          },
        },
      });
      const doubled = (store.state as any).doubled;
      const { count } = store.state;
      return (
        <p>
          {count as number}x2={doubled}
        </p>
      );
    };
    const { getByText } = render(<App />);
    expect(getByText('2x2=4')).toBeInTheDocument();
  });
});
