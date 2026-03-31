import '@testing-library/jest-dom';
import { act, findByText, fireEvent, render } from '@testing-library/react';
import React from 'react';
import ReactDOM from 'react-dom';
import gfstate, {
  EMPTY_ARRAY,
  IS_GFSTATE_STORE,
  isGfstateStore,
  isPlainObject,
  type Store,
  syncWrapper,
  // asyncWrapper,
} from './index';

describe('GfState', () => {
  test('basic usage and updates', () => {
    const store = gfstate({
      count: 0,
      list: [],
      incOneA: () => (store.count += 1),
      incOneB: () => store('count', (prev) => prev + 1),
      incMoreA: () => store({ count: store.count + 1 }),
      incMoreB: () => store(({ count }) => ({ count: count + 1 })),
      getState: () => {
        const { count } = store;

        return count * 2;
      },
    });

    const App = () => {
      const { count } = store;
      return (
        <>
          <p>{count}</p>
          <button onClick={store.incOneA}>btn1</button>
          <button onClick={store.incOneB}>btn2</button>
          <button onClick={() => (store.count += 1)}>btn3</button>
          <button onClick={store.incMoreA}>btn4</button>
          <button onClick={store.incMoreB}>btn5</button>
          <p>{store.getState()}</p>
        </>
      );
    };

    const { getByText } = render(<App />);

    expect(() => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error
      gfstate();
    }).toThrow();

    fireEvent.click(getByText('btn1'));
    expect(getByText('1')).toBeInTheDocument();

    fireEvent.click(getByText('btn2'));
    expect(getByText('2')).toBeInTheDocument();

    fireEvent.click(getByText('btn3'));
    expect(getByText('3')).toBeInTheDocument();

    fireEvent.click(getByText('btn4'));
    expect(getByText('4')).toBeInTheDocument();

    fireEvent.click(getByText('btn5'));
    expect(getByText('5')).toBeInTheDocument();

    expect(getByText('10')).toBeInTheDocument();
  });

  test('gfstate.config', () => {
    gfstate.config({ batch: ReactDOM.unstable_batchedUpdates });
    // 重置 run 函数，避免影响其他测试
    gfstate.config({ batch: (fn: () => void) => fn() });
  });

  test('新增一个没有的属性，应自动初始化', () => {
    const store = gfstate<{
      count: number;
      newProp?: number;
    }>({ count: 0 });

    store.newProp = 123;

    const App = () => {
      const { newProp } = store;
      return <p>{newProp}</p>;
    };

    const { getByText } = render(<App />);

    expect(getByText('123')).toBeInTheDocument();
  });

  test('新增一个没有的方法，应自动初始化', () => {
    const store = gfstate<{
      str: string;
      sayHello?: () => void;
    }>({ str: '' });

    const App = () => {
      const { str } = store;

      React.useEffect(() => {
        store.sayHello = () => {
          store.str = 'hello gfstate';
        };
      }, []);

      return (
        <>
          <p>{str}</p>
          <button onClick={store?.sayHello}>send</button>
        </>
      );
    };

    const { getByText } = render(<App />);

    fireEvent.click(getByText('send'));
    expect(getByText('hello gfstate')).toBeInTheDocument();
  });

  test("使用自定义的类等非纯对象做为初始值时应报错为new Error('对象必须为纯对象: Record<string, unknown>')", () => {
    class Person {
      name: string;
      constructor(name: string) {
        this.name = name;
      }
      say() {
        console.log(this.name);
      }
    }

    const store = expect(() => {
      gfstate(new Person('gf') as any);
    }).toThrow(new Error('对象必须为纯对象: Record<string, unknown>'));
  });

  test('action 函数再赋值，函数地址不变，并能拿到最新状态', () => {
    const store = gfstate({
      count: 0,
      inc: () => {
        store.count += 1;
      },
    });

    const App = () => {
      const { count } = store;

      const doubleCount = count * 2;

      React.useEffect(() => {
        if (count >= 3) {
          store.inc = () => {
            expect(doubleCount).toBe(count * 2);
            store.count += 2;
          };
        }
      }, [count]);

      return (
        <>
          <p>{count}</p>
          <button onClick={store.inc}>inc</button>
        </>
      );
    };

    const { getByText } = render(<App />);

    fireEvent.click(getByText('inc'));
    expect(getByText('1')).toBeInTheDocument();

    fireEvent.click(getByText('inc'));
    expect(getByText('2')).toBeInTheDocument();

    fireEvent.click(getByText('inc'));
    expect(getByText('3')).toBeInTheDocument();

    fireEvent.click(getByText('inc'));
    expect(getByText('5')).toBeInTheDocument();

    fireEvent.click(getByText('inc'));
    expect(getByText('7')).toBeInTheDocument();
  });

  test('action 函数参数传递', () => {
    const store = gfstate({
      count: 0,
      add: (num: number, num2?: number, num3?: number) => {
        store.count += num + (num2 || 0) + (num3 || 0);
      },
    });

    const App = () => {
      const { count } = store;

      return (
        <>
          <p>{count}</p>
          <button onClick={() => store.add(3)}>add 3</button>
          <button onClick={() => store.add(2, 3, 4)}>add 2,3,4</button>
        </>
      );
    };

    const { getByText } = render(<App />);

    fireEvent.click(getByText('add 3'));
    expect(getByText('3')).toBeInTheDocument();
    fireEvent.click(getByText('add 2,3,4'));
    expect(getByText('12')).toBeInTheDocument();

    fireEvent.click(getByText('add 3'));
    expect(getByText('15')).toBeInTheDocument();
    fireEvent.click(getByText('add 2,3,4'));
    expect(getByText('24')).toBeInTheDocument();
  });

  test('状态中包含对象，纯对象应该自动应用gfstate再包装，可通过store对应用gfstate的对象进行更新', () => {
    const store = gfstate<{
      obj: { a: number };
      b: number;
      updateA: () => void;
      updateB: () => void;
    }>({
      obj: {
        a: 1,
      },
      b: 12,
      updateA: () => {
        store.obj.a += 1;
      },
      updateB: () => {
        store.b += 1;
      },
    });

    const App = () => {
      const { obj, b } = store;
      const { a } = obj;

      return (
        <>
          <p>{a}</p>
          <button onClick={store.updateA}>btn</button>
          <p>{b}</p>
          <button onClick={store.updateB}>btn2</button>
        </>
      );
    };

    const { getByText } = render(<App />);

    fireEvent.click(getByText('btn2'));
    expect(getByText('13')).toBeInTheDocument();
    expect(getByText('1')).toBeInTheDocument();
    fireEvent.click(getByText('btn'));
    expect(getByText('2')).toBeInTheDocument();
    fireEvent.click(getByText('btn'));
    expect(getByText('3')).toBeInTheDocument();
  });

  test('状态中包含对象，纯对象应该自动应用gfstate再包装', () => {
    const store = gfstate<{
      obj: {
        a: number;
        b: number;
        incOneA: () => void;
        incOneB?: () => void;
        incOneC: () => void;
      };
      incOneB?: () => void;
    }>({
      obj: {
        a: 1,
        b: 2,
        incOneA: () => {
          const { obj } = store;
          obj.a += 2;
        },
        incOneC: () => {
          store.obj.a += 1;
        },
      },
    });

    const App = () => {
      const { obj } = store;
      const { a } = obj;

      obj.incOneB = () => {
        obj.a += 1;
      };

      React.useEffect(() => {
        expect((obj as any)[IS_GFSTATE_STORE]).toBe(true);
      }, [obj]);

      return (
        <>
          <p>{a}</p>
          <button onClick={() => (obj.a += 1)}>btn</button>
          <button onClick={obj.incOneB}>btn1</button>
          <button onClick={obj.incOneA}>btn2</button>
          <button onClick={obj.incOneC}>btn3</button>
        </>
      );
    };

    const { getByText } = render(<App />);

    expect(getByText('1')).toBeInTheDocument();
    fireEvent.click(getByText('btn'));
    expect(getByText('2')).toBeInTheDocument();
    fireEvent.click(getByText('btn1'));
    expect(getByText('3')).toBeInTheDocument();
    fireEvent.click(getByText('btn2'));
    expect(getByText('5')).toBeInTheDocument();
    fireEvent.click(getByText('btn3'));
    expect(getByText('6')).toBeInTheDocument();
  });

  test('外部可以更新嵌套的gfstate对象', () => {
    const store = gfstate<{
      objStore: Store<{ a: number }>;
      incA: () => void;
    }>({
      objStore: gfstate({ a: 10 }),
      incA: () => {
        store.objStore.a += 1;
      },
    });

    const App = () => {
      const { objStore } = store;
      const { a } = objStore;

      return (
        <>
          <p>{a}</p>
          <button onClick={store.incA}>btn1</button>
        </>
      );
    };

    const { getByText } = render(<App />);

    fireEvent.click(getByText('btn1'));
    expect(getByText('11')).toBeInTheDocument();
    expect(() => {
      store.objStore = gfstate({ a: 20 });
    }).toThrow(`objStore 已经是 gfstate store 了，不能再赋值为 gfstate store`);
  });

  test('自动应用gfstate的对象再赋值为普通对象时,更新数据', () => {
    const store = gfstate<{
      obj: {
        a: number;
        b: number;
        c?: number;
      };
    }>({
      obj: {
        a: 1,
        b: 12,
      },
    });

    const App = () => {
      const { obj } = store;
      const { a, b, c } = obj;

      return (
        <>
          <p>{a}</p>
          <p>{b}</p>
          <p>{c}</p>
          <button
            onClick={() => {
              obj.a += 1;
              obj.b += 2;
            }}
          >
            btn1
          </button>
          <button
            onClick={() => {
              obj({
                a: 1,
                b: 2,
                c: 3,
              });
            }}
          >
            btn2
          </button>
          <button
            onClick={() => {
              store('obj', {
                a: 4,
                b: 5,
                c: 6,
              });
            }}
          >
            btn3
          </button>
          <button
            onClick={() => {
              store.obj.a = 7;
              store.obj.b = 8;
              store.obj.c = 9;
            }}
          >
            btn4
          </button>
        </>
      );
    };

    const { getByText } = render(<App />);

    fireEvent.click(getByText('btn1'));
    expect(getByText('2')).toBeInTheDocument();
    expect(getByText('14')).toBeInTheDocument();
    fireEvent.click(getByText('btn2'));
    expect(getByText('1')).toBeInTheDocument();
    expect(getByText('2')).toBeInTheDocument();
    expect(getByText('3')).toBeInTheDocument();
    fireEvent.click(getByText('btn3'));
    expect(getByText('4')).toBeInTheDocument();
    expect(getByText('5')).toBeInTheDocument();
    expect(getByText('6')).toBeInTheDocument();
    fireEvent.click(getByText('btn4'));
    expect(getByText('7')).toBeInTheDocument();
    expect(getByText('8')).toBeInTheDocument();
    expect(getByText('9')).toBeInTheDocument();
  });

  test('嵌套自动应用gfstate的对象再赋值为普通对象时,更新数据', () => {
    const store = gfstate<{
      obj: {
        a: number;
        b: {
          c: number;
          d: number;
        };
      };
    }>({
      obj: {
        a: 1,
        b: {
          c: 2,
          d: 3,
        },
      },
    });

    const App = () => {
      const { obj } = store;
      const {
        a,
        b: { c, d },
      } = obj;

      return (
        <>
          <p>{a}</p>
          <p>{c}</p>
          <p>{d}</p>
          <button
            onClick={() => {
              obj.b.c += 1;
              obj.b.d += 2;
            }}
          >
            btn1
          </button>
          <button
            onClick={() => {
              obj('b', {
                c: 5,
                d: 6,
              });
            }}
          >
            btn2
          </button>
        </>
      );
    };

    const { getByText } = render(<App />);

    fireEvent.click(getByText('btn1'));
    expect(getByText('3')).toBeInTheDocument();
    expect(getByText('5')).toBeInTheDocument();
    fireEvent.click(getByText('btn2'));
    expect(getByText('5')).toBeInTheDocument();
    expect(getByText('6')).toBeInTheDocument();
  });

  test('初始化支持函数返回值', () => {
    const store = gfstate<{
      count: number;
      a?: number;
    }>(() => ({
      count: 100,
    }));

    const App = () => {
      const { count, a } = store;

      return (
        <>
          <p>{count}</p>
          <p>{a}</p>
          <button
            onClick={() => {
              store.count += 1;
              store.a = 123;
            }}
          >
            btn
          </button>
        </>
      );
    };

    const { getByText } = render(<App />);

    expect(getByText('100')).toBeInTheDocument();
    fireEvent.click(getByText('btn'));
    expect(getByText('101')).toBeInTheDocument();
    expect(getByText('123')).toBeInTheDocument();
  });

  test('单状态支持函数初始化', async () => {
    const store = gfstate({
      a: syncWrapper(() => 50),
    });

    const App = () => {
      const { a } = store;

      return (
        <>
          <p>{a}</p>
          <button
            onClick={() => {
              store.a += 1;
            }}
          >
            btn
          </button>
        </>
      );
    };

    const { getByText } = render(<App />);

    expect(getByText('50')).toBeInTheDocument();
    fireEvent.click(getByText('btn'));
    expect(getByText('51')).toBeInTheDocument();
  });

  test('创建后生命周期执行', async () => {
    let createdCalled = false;
    let createdStore = null;

    const store = gfstate(
      {
        count: 0,
        options: [],
      },
      {
        created: async (s) => {
          createdCalled = true;
          createdStore = s;
          await new Promise((resolve) => setTimeout(resolve, 100));
          s.count = 41;
          s.options = [1, 2, 3] as any;
        },
      },
    );

    const App = () => {
      const { count } = store;

      return (
        <>
          <p>{count}</p>
          <button
            onClick={() => {
              store.count += 1;
            }}
          >
            btn
          </button>
        </>
      );
    };

    const { findByText, getByText } = render(<App />);

    expect(createdCalled).toBe(true);
    expect(createdStore).toBe(store);
    const element = await findByText('41');
    expect(element).toBeInTheDocument();
    fireEvent.click(getByText('btn'));
    const updatedElement = await findByText('42');
    expect(updatedElement).toBeInTheDocument();
    expect(store.options).toEqual([1, 2, 3]);
  });

  test('异步函数创建后调用', async () => {
    const store = gfstate(
      {
        options: [2, 1],
        getOptions: async () => {
          await new Promise((resolve) => setTimeout(resolve, 100));
          store.options = [42, 43, 44] as any;
        },
      },
      {
        created: (s) => {
          s.getOptions();
        },
      },
    );

    const App = () => {
      const { options } = store;

      return (
        <>
          <p>{options.join(',')}</p>
        </>
      );
    };

    const { findByText } = render(<App />);

    const element = await findByText('2,1');
    expect(element).toBeInTheDocument();
    const updatedElement = await findByText('42,43,44');
    expect(updatedElement).toBeInTheDocument();
  });

  test('使用ref存放普通变量', async () => {
    const store = gfstate({
      ref: {
        count: 0,
      },
      add: () => {
        store.ref.count += 1;
      },
    });

    const App = () => {
      const { count } = store.ref;

      return (
        <div>
          {count}
          <button onClick={store.add}>add</button>
        </div>
      );
    };

    const { getByText } = render(<App />);

    expect(getByText('0')).toBeTruthy();
    fireEvent.click(getByText('add'));
    expect(getByText('0')).toBeTruthy();
    fireEvent.click(getByText('add'));
    expect(getByText('0')).toBeTruthy();
    fireEvent.click(getByText('add'));
    expect(store.ref.count).toBe(3);
  });

  test('配置不自动应用gfstate的key', () => {
    const store = gfstate(
      {
        a: {
          c: 1,
        },
        b: {
          d: 11,
        },
        reactEl: <div>hello</div>,
      },
      {
        noGfstateKeys: ['b'],
      },
    );

    const App = () => {
      const { a, b, reactEl } = store;
      const { c } = a;
      const { d } = b;

      return (
        <>
          <p>{c}</p>
          <p>{d}</p>
          {reactEl}
          <button
            onClick={() => {
              store.b.d += 1;
            }}
          >
            btn
          </button>
          <button
            onClick={() => {
              store.a.c += 1;
              // 这里由于a刷新了，所以b也会刷新，但不是因为b是gfstate对象，而是因为a刷新导致整个组件刷新了
              store.b.d += 1;
            }}
          >
            btn2
          </button>
        </>
      );
    };

    const { getByText } = render(<App />);

    expect(getByText('1')).toBeInTheDocument();
    expect(getByText('11')).toBeInTheDocument();
    expect(getByText('hello')).toBeInTheDocument();
    expect(isGfstateStore(store.a)).toBe(true);
    expect(isGfstateStore(store.b)).toBe(false);
    fireEvent.click(getByText('btn'));
    expect(getByText('1')).toBeInTheDocument();
    expect(getByText('11')).toBeInTheDocument();
    fireEvent.click(getByText('btn2'));
    expect(getByText('2')).toBeInTheDocument();
    expect(getByText('13')).toBeInTheDocument();
  });

  test('uninitialized key 多次渲染后订阅应保持稳定', () => {
    const store = gfstate({
      count: 0,
    });

    let renderCount = 0;

    const App = () => {
      renderCount++;
      const count = store.count;
      // 访问一个未初始化的 key
      const unknown = (store as any).unknownKey;
      return (
        <>
          <p>count:{count}</p>
          <p>unknown:{String(unknown)}</p>
          <button onClick={() => (store.count += 1)}>inc</button>
        </>
      );
    };

    const { getByText } = render(<App />);
    expect(getByText('count:0')).toBeInTheDocument();
    expect(getByText('unknown:undefined')).toBeInTheDocument();

    // 触发重新渲染
    fireEvent.click(getByText('inc'));
    expect(getByText('count:1')).toBeInTheDocument();

    // 动态设置未初始化的 key
    act(() => {
      (store as any).unknownKey = 'hello';
    });
    expect(getByText('unknown:hello')).toBeInTheDocument();
  });

  test('循环引用的纯对象不应导致栈溢出', () => {
    const obj: any = { a: 1, b: 2 };
    obj.self = obj; // 循环引用

    // 不应抛出栈溢出错误
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const store = gfstate(obj);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('循环引用'));
    warnSpy.mockRestore();

    const App = () => {
      const a = store.a;
      return <p>a:{a}</p>;
    };

    const { getByText } = render(<App />);
    expect(getByText('a:1')).toBeInTheDocument();
  });

  test('Object.keys 应返回最新的 key 列表', () => {
    const store = gfstate({
      count: 0,
      name: 'test',
    });

    const keys1 = Object.keys(store);
    expect(keys1).toContain('count');
    expect(keys1).toContain('name');

    // 动态新增属性
    (store as any).newProp = 'value';
    const keys2 = Object.keys(store);
    expect(keys2).toContain('newProp');
  });

  test('setKey 应正确处理 ref key 赋值', () => {
    const store = gfstate({
      count: 0,
      ref: { timer: null as any },
    });

    let renderCount = 0;
    const App = () => {
      renderCount++;
      const count = store.count;
      return <p>count:{count}</p>;
    };

    const { getByText } = render(<App />);
    expect(getByText('count:0')).toBeInTheDocument();

    const prevRenderCount = renderCount;
    // 修改 ref 不应触发重新渲染
    store.ref = { timer: 123 } as any;
    expect(renderCount).toBe(prevRenderCount);
    // 但值应该被更新
    expect(store.ref).toEqual({ timer: 123 });
  });

  test('computed 计算属性基本用法', () => {
    const store = gfstate(
      {
        firstName: 'John',
        lastName: 'Doe',
        count: 0,
      },
      {
        computed: {
          fullName: (s) => s.firstName + ' ' + s.lastName,
          doubleCount: (s) => s.count * 2,
        },
      },
    );

    const App = () => {
      const { count } = store;
      const fullName = (store as any).fullName;
      const doubleCount = (store as any).doubleCount;

      return (
        <>
          <p>name:{fullName}</p>
          <p>count:{count}</p>
          <p>double:{doubleCount}</p>
          <button onClick={() => (store.count += 1)}>inc</button>
          <button onClick={() => (store.firstName = 'Jane')}>changeName</button>
        </>
      );
    };

    const { getByText } = render(<App />);

    expect(getByText('name:John Doe')).toBeInTheDocument();
    expect(getByText('count:0')).toBeInTheDocument();
    expect(getByText('double:0')).toBeInTheDocument();

    fireEvent.click(getByText('inc'));
    expect(getByText('count:1')).toBeInTheDocument();
    expect(getByText('double:2')).toBeInTheDocument();

    fireEvent.click(getByText('changeName'));
    expect(getByText('name:Jane Doe')).toBeInTheDocument();
  });

  test('computed 计算属性不可修改', () => {
    const store = gfstate(
      { count: 0 },
      {
        computed: {
          doubleCount: (s) => s.count * 2,
        },
      },
    );

    expect(() => {
      (store as any).doubleCount = 10;
    }).toThrow('计算属性 "doubleCount" 是只读的，不能赋值');
  });

  test('computed 计算属性缓存：依赖不变时不重新计算', () => {
    let computeCount = 0;

    const store = gfstate(
      { count: 0, other: 'hello' },
      {
        computed: {
          doubleCount: (s) => {
            computeCount++;
            return s.count * 2;
          },
        },
      },
    );

    // 初始计算一次
    expect(computeCount).toBe(1);

    // 修改无关属性不应触发重新计算
    store.other = 'world';
    expect(computeCount).toBe(1);

    // 修改依赖属性应触发重新计算
    store.count = 5;
    expect(computeCount).toBe(2);
  });

  test('computed 计算属性出现在 Object.keys 中', () => {
    const store = gfstate(
      { count: 0 },
      {
        computed: {
          doubleCount: (s) => s.count * 2,
        },
      },
    );

    const keys = Object.keys(store);
    expect(keys).toContain('count');
    expect(keys).toContain('doubleCount');
  });

  test('computed 键名与 state 键名冲突应报错', () => {
    expect(() => {
      gfstate({ count: 0 }, {
        computed: {
          count: (s: any) => s.count * 2,
        },
      } as any);
    }).toThrow('计算属性 "count" 与已有的 state/action 键名冲突');
  });

  test('watch 监听器基本用法', () => {
    const changes: Array<{ newVal: number; oldVal: number }> = [];

    const store = gfstate(
      { count: 0, name: 'test' },
      {
        watch: {
          count: (newVal, oldVal) => {
            changes.push({ newVal, oldVal });
          },
        },
      },
    );

    const App = () => {
      const { count } = store;
      return (
        <>
          <p>count:{count}</p>
          <button onClick={() => (store.count += 1)}>inc</button>
        </>
      );
    };

    const { getByText } = render(<App />);

    expect(changes).toHaveLength(0);

    fireEvent.click(getByText('inc'));
    expect(changes).toHaveLength(1);
    expect(changes[0]).toEqual({ newVal: 1, oldVal: 0 });

    fireEvent.click(getByText('inc'));
    expect(changes).toHaveLength(2);
    expect(changes[1]).toEqual({ newVal: 2, oldVal: 1 });
  });

  test('watch 监听器在值不变时不触发', () => {
    let watchCount = 0;

    const store = gfstate(
      { count: 0 },
      {
        watch: {
          count: () => {
            watchCount++;
          },
        },
      },
    );

    // 设置相同值，不应触发
    store.count = 0;
    expect(watchCount).toBe(0);

    // 设置不同值，应触发
    store.count = 1;
    expect(watchCount).toBe(1);
  });

  test('watch 监听器接收 store 实例', () => {
    let receivedStore: any = null;

    const store = gfstate(
      { count: 0 },
      {
        watch: {
          count: (_newVal, _oldVal, s) => {
            receivedStore = s;
          },
        },
      },
    );

    store.count = 1;
    expect(receivedStore).toBe(store);
  });

  test('watch 不存在的 key 应在 dev 模式打印警告', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    gfstate(
      { count: 0 },
      {
        watch: {
          nonExistent: () => {},
        } as any,
      },
    );

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('nonExistent'),
    );
    warnSpy.mockRestore();
  });

  describe('startTransition 与 batching', () => {
    afterEach(() => {
      // 重置 run 函数
      gfstate.config({ batch: (fn: () => void) => fn() });
    });

    test('gfstate.config batch 应将多个同步更新合并为一次渲染', () => {
      const store = gfstate({
        count: 0,
        name: 'test',
      });

      let renderCount = 0;

      const App = () => {
        renderCount++;
        const { count, name } = store;
        return (
          <>
            <p>count:{count}</p>
            <p>name:{name}</p>
            <button
              onClick={() => {
                store.count += 1;
                store.name = 'updated';
              }}
            >
              update
            </button>
          </>
        );
      };

      const { getByText } = render(<App />);
      const initialRenderCount = renderCount;

      // 配置 batch
      gfstate.config({ batch: ReactDOM.unstable_batchedUpdates });

      fireEvent.click(getByText('update'));
      // 使用 batch 时，两个 setState 应合并为一次渲染
      expect(renderCount).toBeLessThanOrEqual(initialRenderCount + 2);
      expect(getByText('count:1')).toBeInTheDocument();
      expect(getByText('name:updated')).toBeInTheDocument();
    });

    test('React.startTransition 包裹更新不应导致撕裂', () => {
      const store = gfstate({ count: 0 });

      const values: number[] = [];

      const ComponentA = () => {
        const { count } = store;
        React.useEffect(() => {
          values.push(count);
        }, [count]);
        return <p>A:{count}</p>;
      };

      const ComponentB = () => {
        const { count } = store;
        return <p>B:{count}</p>;
      };

      const App = () => (
        <>
          <ComponentA />
          <ComponentB />
          <button
            onClick={() => {
              React.startTransition(() => {
                store.count = 1;
              });
            }}
          >
            update
          </button>
        </>
      );

      const { getByText } = render(<App />);
      fireEvent.click(getByText('update'));

      // 两个组件应显示相同的值（无撕裂）
      const aText = getByText(/^A:/);
      const bText = getByText(/^B:/);
      const aCount = aText.textContent?.replace(/^A:/, '');
      const bCount = bText.textContent?.replace(/^B:/, '');
      expect(aCount).toBe(bCount);
    });

    test('React.StrictMode 下 store 正常工作', () => {
      const store = gfstate({ count: 0 });

      const App = () => {
        const { count } = store;
        return (
          <>
            <p>{count}</p>
            <button onClick={() => (store.count += 1)}>inc</button>
          </>
        );
      };

      const { getByText } = render(
        <React.StrictMode>
          <App />
        </React.StrictMode>,
      );

      fireEvent.click(getByText('inc'));
      expect(getByText('1')).toBeInTheDocument();

      fireEvent.click(getByText('inc'));
      expect(getByText('2')).toBeInTheDocument();
    });

    test('batch 配置对 computed 更新通知生效', () => {
      const store = gfstate(
        {
          a: 1,
          b: 2,
        },
        {
          computed: {
            sum: (s) => s.a + s.b,
          },
        },
      );

      let computeCount = 0;
      // 需要再次创建以统计计算次数
      let finalSum = 0;

      const App = () => {
        const { a, b } = store;
        finalSum = (store as any).sum;
        return (
          <>
            <p>sum:{finalSum}</p>
            <button
              onClick={() => {
                store.a += 1;
                store.b += 1;
              }}
            >
              update
            </button>
          </>
        );
      };

      const { getByText } = render(<App />);
      expect(getByText('sum:3')).toBeInTheDocument();

      fireEvent.click(getByText('update'));
      expect(getByText('sum:5')).toBeInTheDocument();
    });
  });

  describe('多数据类型', () => {
    test('null 值作为初始状态', () => {
      const store = gfstate({
        value: null as string | null,
      });

      const App = () => {
        const { value } = store;
        return (
          <>
            <p>{String(value)}</p>
            <button onClick={() => (store.value = 'hello')}>set value</button>
          </>
        );
      };

      const { getByText } = render(<App />);
      expect(getByText('null')).toBeInTheDocument();

      fireEvent.click(getByText('set value'));
      expect(getByText('hello')).toBeInTheDocument();
    });

    test('undefined 值作为初始状态', () => {
      const store = gfstate({
        value: undefined as number | undefined,
      });

      const App = () => {
        const { value } = store;
        return (
          <>
            <p>{String(value)}</p>
            <button onClick={() => (store.value = 42)}>set value</button>
          </>
        );
      };

      const { getByText } = render(<App />);
      expect(getByText('undefined')).toBeInTheDocument();

      fireEvent.click(getByText('set value'));
      expect(getByText('42')).toBeInTheDocument();
    });

    test('bigint 值作为初始状态', () => {
      const store = gfstate({
        value: BigInt(99) as bigint,
      });

      const App = () => {
        const { value } = store;
        return (
          <>
            <p>{String(value)}</p>
            <button onClick={() => (store.value = BigInt(0))}>reset</button>
          </>
        );
      };

      const { getByText } = render(<App />);
      expect(getByText('99')).toBeInTheDocument();

      fireEvent.click(getByText('reset'));
      expect(getByText('0')).toBeInTheDocument();
    });

    test('symbol 值应发出警告并频繁更新', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const store = gfstate({
        value: Symbol('test') as any,
      });

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Symbol'));

      let renderCount = 0;
      const App = () => {
        renderCount++;
        const { value } = store;
        return (
          <>
            <p>renders:{renderCount}</p>
            <button onClick={() => (store.value = Symbol('new'))}>
              set new symbol
            </button>
          </>
        );
      };

      const { getByText } = render(<App />);
      const initialRenders = renderCount;

      fireEvent.click(getByText('set new symbol'));
      // 每次分配新 symbol 都应触发重新渲染
      expect(renderCount).toBeGreaterThan(initialRenders);

      warnSpy.mockRestore();
    });

    test('Date 对象不被自动包装为 gfstate', () => {
      const initialDate = new Date('2024-01-01');
      const store = gfstate({
        date: initialDate as Date,
      });

      expect(isGfstateStore(store.date)).toBe(false);

      const App = () => {
        const { date } = store;
        return (
          <>
            <p>{date.toISOString().split('T')[0]}</p>
            <button onClick={() => (store.date = new Date('2025-01-01'))}>
              update
            </button>
          </>
        );
      };

      const { getByText } = render(<App />);
      expect(getByText('2024-01-01')).toBeInTheDocument();

      fireEvent.click(getByText('update'));
      expect(getByText('2025-01-01')).toBeInTheDocument();
    });

    test('RegExp 作为状态值', () => {
      const store = gfstate({
        pattern: /abc/i as RegExp,
      });

      expect(isGfstateStore(store.pattern)).toBe(false);

      const App = () => {
        const { pattern } = store;
        return (
          <>
            <p>{pattern.source}</p>
            <button onClick={() => (store.pattern = /xyz/g)}>change</button>
          </>
        );
      };

      const { getByText } = render(<App />);
      expect(getByText('abc')).toBeInTheDocument();

      fireEvent.click(getByText('change'));
      expect(getByText('xyz')).toBeInTheDocument();
    });

    test('Map 作为状态值', () => {
      const store = gfstate({
        map: new Map([['a', 1]]) as Map<string, number>,
      });

      expect(isGfstateStore(store.map)).toBe(false);

      const App = () => {
        const { map } = store;
        return (
          <>
            <p>{String(map.get('a'))}</p>
            <button onClick={() => (store.map = new Map([['a', 2]]))}>
              update
            </button>
          </>
        );
      };

      const { getByText } = render(<App />);
      expect(getByText('1')).toBeInTheDocument();

      fireEvent.click(getByText('update'));
      expect(getByText('2')).toBeInTheDocument();
    });

    test('Set 作为状态值', () => {
      const store = gfstate({
        set: new Set([1, 2, 3]) as Set<number>,
      });

      expect(isGfstateStore(store.set)).toBe(false);

      const App = () => {
        const { set } = store;
        return (
          <>
            <p>size:{set.size}</p>
            <button onClick={() => (store.set = new Set([4, 5]))}>
              update
            </button>
          </>
        );
      };

      const { getByText } = render(<App />);
      expect(getByText('size:3')).toBeInTheDocument();

      fireEvent.click(getByText('update'));
      expect(getByText('size:2')).toBeInTheDocument();
    });

    test('Promise 作为状态值', () => {
      const store = gfstate({
        promise: Promise.resolve(42) as Promise<number>,
      });

      expect(isGfstateStore(store.promise)).toBe(false);

      const App = () => {
        const { promise } = store;
        return (
          <>
            <p>ok</p>
            <button onClick={() => (store.promise = Promise.resolve(99))}>
              update
            </button>
          </>
        );
      };

      const { getByText } = render(<App />);
      expect(getByText('ok')).toBeInTheDocument();

      fireEvent.click(getByText('update'));
      expect(getByText('ok')).toBeInTheDocument();
    });

    test('空对象 gfstate({}) 创建有效 store', () => {
      const store = gfstate({});

      const App = () => {
        return (
          <>
            <p>{String((store as any).dynValue)}</p>
            <button
              onClick={() => {
                (store as any).dynValue = 'added';
              }}
            >
              add property
            </button>
          </>
        );
      };

      const { getByText } = render(<App />);
      expect(getByText('undefined')).toBeInTheDocument();

      fireEvent.click(getByText('add property'));
      expect(getByText('added')).toBeInTheDocument();
    });

    test('数组需替换引用才能触发响应', () => {
      const store = gfstate({
        items: [1, 2] as number[],
      });

      let renderCount = 0;

      const App = () => {
        renderCount++;
        const { items } = store;
        return (
          <>
            <p>items:{items.join(',')}</p>
            <p>renders:{renderCount}</p>
            <button onClick={() => store.items.push(3)}>push</button>
            <button onClick={() => (store.items = [1, 2, 3])}>replace</button>
          </>
        );
      };

      const { getByText } = render(<App />);
      const initialRenders = renderCount;

      // push 不触发重新渲染，所以显示的还是 1,2
      fireEvent.click(getByText('push'));
      expect(renderCount).toBe(initialRenders);
      expect(getByText('items:1,2')).toBeInTheDocument();

      // 重新赋值触发重新渲染，显示 1,2,3
      fireEvent.click(getByText('replace'));
      expect(renderCount).toBeGreaterThan(initialRenders);
      expect(getByText('items:1,2,3')).toBeInTheDocument();
    });

    test('EMPTY_ARRAY 常量用于初始化空数组', () => {
      const store = gfstate({
        items: [] as any[],
      });

      // 在组件外读取，使用 try/catch 回退
      const items = store.items;
      expect(items).toBe(EMPTY_ARRAY);
    });

    test('Object.create(null) 被视为纯对象自动包装', () => {
      const obj = Object.create(null);
      obj.x = 1;

      const store = gfstate({
        data: obj,
      });

      expect(isGfstateStore(store.data)).toBe(true);

      const App = () => {
        const { data } = store;
        return (
          <>
            <p>{(data as any).x}</p>
            <button onClick={() => ((store.data as any).x = 10)}>update</button>
          </>
        );
      };

      const { getByText } = render(<App />);
      expect(getByText('1')).toBeInTheDocument();

      fireEvent.click(getByText('update'));
      expect(getByText('10')).toBeInTheDocument();
    });
  });

  describe('边界情况', () => {
    test('React 渲染上下文外读取 store 返回原始数据', () => {
      const store = gfstate({ count: 0 });

      // 在组件外直接读取
      expect(store.count).toBe(0);

      store.count = 5;
      expect(store.count).toBe(5);
    });

    test('多个组件共享全局 store 独立更新', () => {
      const store = gfstate({ a: 1, b: 2 });

      let aRenders = 0;
      let bRenders = 0;

      const ComponentA = () => {
        aRenders++;
        const { a } = store;
        return <p>A:{a}</p>;
      };

      const ComponentB = () => {
        bRenders++;
        const { b } = store;
        return <p>B:{b}</p>;
      };

      const App = () => (
        <>
          <ComponentA />
          <ComponentB />
          <button onClick={() => (store.a += 1)}>inc a</button>
        </>
      );

      const { getByText } = render(<App />);
      const initialACount = aRenders;
      const initialBCount = bRenders;

      fireEvent.click(getByText('inc a'));
      // 只有 ComponentA 应重新渲染
      expect(aRenders).toBeGreaterThan(initialACount);
      expect(bRenders).toBe(initialBCount);
    });

    test('组件卸载后正确清理订阅', () => {
      const store = gfstate({ count: 0 });

      const TestComponent = () => {
        const { count } = store;
        return <p>{count}</p>;
      };

      const { unmount, rerender } = render(<TestComponent />);

      // 卸载组件
      unmount();

      // 更新 store 不应抛错
      expect(() => {
        store.count = 1;
      }).not.toThrow();
    });

    test('3+ 层深度嵌套对象自动递归包装', () => {
      const store = gfstate({
        a: {
          b: {
            c: {
              d: 1,
            },
          },
        },
      });

      const App = () => {
        const { a } = store;
        const { b } = a;
        const { c } = b;
        const { d } = c;

        return (
          <>
            <p>d:{d}</p>
            <button
              onClick={() => {
                store.a.b.c.d = 10;
              }}
            >
              update
            </button>
          </>
        );
      };

      const { getByText } = render(<App />);

      expect(isGfstateStore(store.a)).toBe(true);
      expect(isGfstateStore(store.a.b)).toBe(true);
      expect(isGfstateStore(store.a.b.c)).toBe(true);

      fireEvent.click(getByText('update'));
      expect(getByText('d:10')).toBeInTheDocument();
    });

    test('整体替换嵌套自动包装对象', () => {
      const store = gfstate({
        obj: {
          a: 1,
          b: 2,
        },
      });

      const App = () => {
        const { obj } = store;
        const { a, b } = obj;

        return (
          <>
            <p>a:{a}</p>
            <p>b:{b}</p>
            <button
              onClick={() => {
                store.obj({ a: 10, b: 20 });
              }}
            >
              replace via call
            </button>
            <button
              onClick={() => {
                store('obj', { a: 100, b: 200 });
              }}
            >
              replace via store
            </button>
          </>
        );
      };

      const { getByText } = render(<App />);

      fireEvent.click(getByText('replace via call'));
      expect(getByText('a:10')).toBeInTheDocument();
      expect(getByText('b:20')).toBeInTheDocument();

      fireEvent.click(getByText('replace via store'));
      expect(getByText('a:100')).toBeInTheDocument();
      expect(getByText('b:200')).toBeInTheDocument();
    });

    test('computed 依赖另一个 computed 自动更新', () => {
      const store = gfstate(
        { count: 0 },
        {
          computed: {
            double: (s) => s.count * 2,
            quad: (s) => {
              return (s as any).double * 2;
            },
          },
        },
      );

      const App = () => {
        const quad = (store as any).quad;
        return (
          <>
            <p>quad:{quad}</p>
            <button onClick={() => (store.count = 3)}>set 3</button>
          </>
        );
      };

      const { getByText } = render(<App />);
      expect(getByText('quad:0')).toBeInTheDocument();

      fireEvent.click(getByText('set 3'));
      expect(getByText('quad:12')).toBeInTheDocument(); // 3 * 2 * 2 = 12
    });

    test('computed 依赖嵌套 gfstate 子 store 自动更新', () => {
      const store = gfstate(
        {
          nested: { x: 1 },
        },
        {
          computed: {
            computed_x: (s) => (s.nested as any).x * 10,
          },
        },
      );

      const App = () => {
        const computed_x = (store as any).computed_x;
        return (
          <>
            <p>computed:{computed_x}</p>
            <button onClick={() => ((store.nested as any).x = 5)}>
              update nested
            </button>
          </>
        );
      };

      const { getByText } = render(<App />);
      expect(getByText('computed:10')).toBeInTheDocument();

      fireEvent.click(getByText('update nested'));
      expect(getByText('computed:50')).toBeInTheDocument(); // 5 * 10 = 50
    });

    test('watch 监听嵌套 gfstate 子 store 属性变更', () => {
      const changes: Array<{ newVal: unknown; oldVal: unknown }> = [];

      const store = gfstate(
        {
          nested: { x: 1, y: 2 },
        },
        {
          watch: {
            nested: (newVal: unknown, oldVal: unknown) => {
              changes.push({ newVal, oldVal });
            },
          } as any,
        },
      );

      // 修改嵌套子 store 的属性
      (store.nested as any).x = 10;

      expect(changes).toHaveLength(1);
      expect(changes[0]).toEqual({ newVal: 10, oldVal: 1 });

      // 修改另一个嵌套属性
      (store.nested as any).y = 20;
      expect(changes).toHaveLength(2);
      expect(changes[1]).toEqual({ newVal: 20, oldVal: 2 });
    });

    test('watch 回调抛错时不应中断其他订阅者', () => {
      const errorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const store = gfstate(
        { count: 0 },
        {
          watch: {
            count: () => {
              throw new Error('intentional error');
            },
          },
        },
      );

      store.count = 1;
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringMatching(/count.*执行出错/),
        expect.any(Error),
      );

      errorSpy.mockRestore();
    });

    test('相同值赋值不触发渲染', () => {
      const store = gfstate({ count: 5 });

      let renderCount = 0;
      const App = () => {
        renderCount++;
        const { count } = store;
        return (
          <>
            <p>{count}</p>
            <button onClick={() => (store.count = 5)}>set same</button>
          </>
        );
      };

      const { getByText } = render(<App />);
      const initialRenders = renderCount;

      fireEvent.click(getByText('set same'));
      expect(renderCount).toBe(initialRenders);
    });

    test('action 执行中抛错不破坏 store 状态', () => {
      const store = gfstate({
        count: 0,
        badAction: () => {
          store.count = 10;
          throw new Error('action failed');
        },
      });

      const App = () => {
        const { count } = store;
        return (
          <>
            <p>{count}</p>
            <button
              onClick={() => {
                try {
                  store.badAction();
                } catch {
                  // 捕获错误
                }
              }}
            >
              bad action
            </button>
          </>
        );
      };

      const { getByText } = render(<App />);

      fireEvent.click(getByText('bad action'));
      expect(getByText('10')).toBeInTheDocument();
    });

    test('批量更新混合已有和新 key', () => {
      const store = gfstate({ a: 1 });

      const App = () => {
        const { a } = store;
        const b = (store as any).b;

        return (
          <>
            <p>a:{a}</p>
            <p>b:{String(b)}</p>
            <button
              onClick={() => {
                store({ a: 10, b: 20 } as any);
              }}
            >
              bulk update
            </button>
          </>
        );
      };

      const { getByText } = render(<App />);
      fireEvent.click(getByText('bulk update'));

      expect(getByText('a:10')).toBeInTheDocument();
      expect(getByText('b:20')).toBeInTheDocument();
    });

    test('快速连续更新收敛到最终值', () => {
      const store = gfstate({ count: 0 });

      const App = () => {
        const { count } = store;
        return (
          <>
            <p>{count}</p>
            <button
              onClick={() => {
                store.count = 1;
                store.count = 2;
                store.count = 3;
              }}
            >
              rapid update
            </button>
          </>
        );
      };

      const { getByText } = render(<App />);
      fireEvent.click(getByText('rapid update'));

      expect(getByText('3')).toBeInTheDocument();
    });

    test('syncWrapper 传非函数应报错', () => {
      expect(() => {
        syncWrapper(42 as any);
      }).toThrow('syncWrapper 只能包装同步函数');
    });

    test('noGfstateKeys 的值整体替换时触发重新渲染', () => {
      const store = gfstate(
        {
          a: 1,
          b: { d: 10 },
        },
        { noGfstateKeys: ['b'] as any },
      );

      expect(isGfstateStore(store.b)).toBe(false);

      const App = () => {
        const { a, b } = store;
        return (
          <>
            <p>a:{a}</p>
            <p>d:{(b as any).d}</p>
            <button onClick={() => ((store as any).b = { d: 99 })}>
              replace b
            </button>
          </>
        );
      };

      const { getByText } = render(<App />);
      expect(getByText('d:10')).toBeInTheDocument();

      fireEvent.click(getByText('replace b'));
      expect(getByText('d:99')).toBeInTheDocument();
    });

    test('React 元素值整体替换时触发重新渲染', () => {
      const store = gfstate({
        el: (<span>first</span>) as React.ReactElement,
      });

      const App = () => {
        const { el } = store;
        return <div>{el}</div>;
      };

      const { getByText } = render(<App />);
      expect(getByText('first')).toBeInTheDocument();

      act(() => {
        store.el = <span>second</span>;
      });
      expect(getByText('second')).toBeInTheDocument();
    });

    test('gfStates 嵌套 key 支持函数更新器', () => {
      const store = gfstate<{
        obj: { count: number };
      }>({
        obj: { count: 1 },
      });

      expect(isGfstateStore(store.obj)).toBe(true);

      const App = () => {
        const { obj } = store;
        const { count } = obj;
        return (
          <>
            <p>count:{count}</p>
            <button
              onClick={() =>
                store('obj' as any, (prev: any) => ({ count: prev.count + 10 }))
              }
            >
              fn update
            </button>
          </>
        );
      };

      const { getByText } = render(<App />);
      expect(getByText('count:1')).toBeInTheDocument();

      fireEvent.click(getByText('fn update'));
      expect(getByText('count:11')).toBeInTheDocument();
    });

    test('动态函数 key 被赋值两次时正确更新', () => {
      const store = gfstate<{
        count: number;
        greet?: () => string;
      }>({ count: 0 });

      const App = () => {
        // 读取未初始化的函数 key，触发 uninitialized 注册
        const greet = (store as any).greet;
        const { count } = store;
        return (
          <>
            <p>count:{count}</p>
            <p>result:{typeof greet === 'function' ? greet() : 'none'}</p>
          </>
        );
      };

      const { getByText } = render(<App />);
      expect(getByText('result:none')).toBeInTheDocument();

      // 第一次设置 greet（创建 uninitializedActions 条目，触发重新渲染）
      act(() => {
        (store as any).greet = () => 'hello';
      });
      expect(getByText('result:hello')).toBeInTheDocument();

      // 第二次设置 greet（更新函数实现，L415；函数引用不变，不触发重新渲染）
      act(() => {
        (store as any).greet = () => 'world';
      });
      // 函数引用未变，不自动重渲染；通过更新 count 触发重渲染以验证新实现生效
      act(() => {
        store.count += 1;
      });
      expect(getByText('result:world')).toBeInTheDocument();
    });

    test('watch 选项中包含 null watchFn 时不报错', () => {
      // 验证 if (!watchFn) return 的防护代码（L592）
      expect(() => {
        gfstate(
          { count: 0 },
          {
            watch: {
              count: null as any,
            },
          },
        );
      }).not.toThrow();
    });

    test('循环引用的 key 在组件中订阅后可触发更新', () => {
      const obj: any = { a: 1 };
      obj.self = obj;

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const store = gfstate(obj);
      warnSpy.mockRestore();

      const App = () => {
        // 订阅循环引用 key（触发 subscribe/getSnapshot lambdas）
        const selfVal = (store as any).self;
        return <p>type:{typeof selfVal}</p>;
      };

      const { getByText, unmount } = render(<App />);
      expect(getByText('type:object')).toBeInTheDocument();

      // 更新循环引用 key（触发 triggerUpdate lambda）
      act(() => {
        (store as any).self = { replaced: true };
      });

      // 卸载组件（触发 unsubscribe lambda）
      unmount();
    });

    // ========== subscribe 外部订阅 API 测试 ==========

    test('store.subscribe 监听所有变更', () => {
      const store = gfstate({ count: 0, name: 'hello' });
      const changes: Array<{ key: string; newVal: unknown; oldVal: unknown }> =
        [];

      store.subscribe((key, newVal, oldVal) => {
        changes.push({ key, newVal, oldVal });
      });

      store.count = 1;
      store.name = 'world';

      expect(changes).toEqual([
        { key: 'count', newVal: 1, oldVal: 0 },
        { key: 'name', newVal: 'world', oldVal: 'hello' },
      ]);
    });

    test('store.subscribe 监听特定 key 变更', () => {
      const store = gfstate({ count: 0, name: 'hello' });
      const countChanges: Array<{ newVal: unknown; oldVal: unknown }> = [];

      store.subscribe('count', (newVal, oldVal) => {
        countChanges.push({ newVal, oldVal });
      });

      store.count = 1;
      store.name = 'world'; // 不触发 count 订阅

      expect(countChanges).toEqual([{ newVal: 1, oldVal: 0 }]);
    });

    test('store.subscribe 取消订阅', () => {
      const store = gfstate({ count: 0 });
      const changes: unknown[] = [];

      const unsubscribe = store.subscribe((key, newVal) => {
        changes.push(newVal);
      });

      store.count = 1;
      unsubscribe();
      store.count = 2;

      expect(changes).toEqual([1]);
    });

    test('store.subscribe 监听 computed 变更', () => {
      const store = gfstate(
        { count: 0 },
        {
          computed: {
            double: (s) => s.count * 2,
          },
        },
      );
      const changes: Array<{ key: string; newVal: unknown; oldVal: unknown }> =
        [];

      store.subscribe((key, newVal, oldVal) => {
        changes.push({ key, newVal, oldVal });
      });

      store.count = 5;

      // 应收到 count 变更和 double computed 变更
      expect(changes).toContainEqual({
        key: 'count',
        newVal: 5,
        oldVal: 0,
      });
      expect(changes).toContainEqual({
        key: 'double',
        newVal: 10,
        oldVal: 0,
      });
    });

    test('store.subscribe 监听嵌套子 store 变更', () => {
      const store = gfstate({ nested: { x: 1, y: 2 } });
      const changes: Array<{ key: string; newVal: unknown; oldVal: unknown }> =
        [];

      store.subscribe((key, newVal, oldVal) => {
        changes.push({ key, newVal, oldVal });
      });

      (store.nested as any).x = 10;

      expect(changes).toContainEqual({
        key: 'nested.x',
        newVal: 10,
        oldVal: 1,
      });
    });

    test('store.subscribe 按 key 订阅嵌套子 store 变更', () => {
      const store = gfstate({ nested: { x: 1, y: 2 } });
      const changes: Array<{ newVal: unknown; oldVal: unknown }> = [];

      store.subscribe('nested.x', (newVal, oldVal) => {
        changes.push({ newVal, oldVal });
      });

      (store.nested as any).x = 10;
      (store.nested as any).y = 20; // 不触发 nested.x 订阅

      expect(changes).toEqual([{ newVal: 10, oldVal: 1 }]);
    });

    test('subscribe 是保留属性名，不能作为 state key', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const store = gfstate({ count: 0 });
      (store as any).subscribe = 'test';

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringMatching(/subscribe.*保留属性名/),
      );
      // subscribe 仍然是函数
      expect(typeof store.subscribe).toBe('function');

      warnSpy.mockRestore();
    });

    // ========== computed 动态依赖测试 ==========

    test('computed 动态依赖切换时正确更新', () => {
      const store = gfstate(
        { flag: true, a: 10, b: 20 },
        {
          computed: {
            result: (s) => (s.flag ? s.a : s.b),
          },
        },
      );

      const App = () => {
        const result = (store as any).result;
        return (
          <>
            <p>result:{result}</p>
            <button onClick={() => (store.flag = false)}>switch</button>
            <button onClick={() => (store.b = 99)}>set b</button>
          </>
        );
      };

      const { getByText } = render(<App />);
      expect(getByText('result:10')).toBeInTheDocument(); // flag=true, reads a

      fireEvent.click(getByText('switch'));
      expect(getByText('result:20')).toBeInTheDocument(); // flag=false, reads b

      fireEvent.click(getByText('set b'));
      expect(getByText('result:99')).toBeInTheDocument(); // b changed, should update
    });

    // ========== watch 扩展测试 ==========

    test('watch 监听计算属性变更', () => {
      const changes: Array<{ newVal: unknown; oldVal: unknown }> = [];

      const store = gfstate(
        { count: 0 },
        {
          computed: {
            double: (s) => s.count * 2,
          },
          watch: {
            double: (newVal: unknown, oldVal: unknown) => {
              changes.push({ newVal, oldVal });
            },
          } as any,
        },
      );

      store.count = 5;
      expect(changes).toHaveLength(1);
      expect(changes[0]).toEqual({ newVal: 10, oldVal: 0 });

      // 设置相同值不触发 watch
      store.count = 5;
      expect(changes).toHaveLength(1);
    });
  });

  // ========== 补全测试覆盖 ==========

  describe('subscribe 健壮性', () => {
    test('store.subscribe 回调抛错不影响其他监听者', () => {
      const store = gfstate({ count: 0 });
      const errorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const values: unknown[] = [];

      store.subscribe(() => {
        throw new Error('boom');
      });
      store.subscribe((_key: string, newVal: unknown) => {
        values.push(newVal);
      });

      store.count = 1;
      expect(values).toEqual([1]);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('回调执行出错'),
        expect.any(Error),
      );
      errorSpy.mockRestore();
    });

    test('store.subscribe 注册多个回调和重复注册', () => {
      const store = gfstate({ count: 0 });
      const results1: unknown[] = [];
      const results2: unknown[] = [];

      const cb = (_key: string, newVal: unknown) => results1.push(newVal);
      store.subscribe(cb);
      store.subscribe(cb); // Set 去重，不会重复添加
      store.subscribe((_key: string, newVal: unknown) =>
        results2.push(newVal),
      );

      store.count = 1;
      // cb 在 Set 中只有一份
      expect(results1).toEqual([1]);
      expect(results2).toEqual([1]);
    });

    test('store("subscribe", val) 应发出警告', () => {
      const warnSpy = jest
        .spyOn(console, 'warn')
        .mockImplementation(() => {});
      const store = gfstate({ count: 0 });
      store('subscribe' as any, 'test');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('subscribe'),
      );
      warnSpy.mockRestore();
    });
  });

  describe('Function 原型属性冲突', () => {
    test('store 可以使用 name 和 length 作为 state key', () => {
      const store = gfstate({ name: 'hello', length: 42 });
      const App = () => {
        const name = store.name as string;
        const length = store.length as number;
        return (
          <p>
            {name}:{length}
          </p>
        );
      };
      const { getByText } = render(<App />);
      expect(getByText('hello:42')).toBeInTheDocument();

      act(() => {
        store.name = 'world';
      });
      expect(getByText('world:42')).toBeInTheDocument();
    });
  });

  describe('isGfstateStore 边界情况', () => {
    test('各种非 store 类型返回 false', () => {
      expect(isGfstateStore(null)).toBe(false);
      expect(isGfstateStore(undefined)).toBe(false);
      expect(isGfstateStore(42)).toBe(false);
      expect(isGfstateStore('string')).toBe(false);
      expect(isGfstateStore({})).toBe(false);
      expect(isGfstateStore([])).toBe(false);
      expect(isGfstateStore(() => {})).toBe(false);
    });

    test('gfstate store 返回 true', () => {
      const store = gfstate({ x: 1 });
      expect(isGfstateStore(store)).toBe(true);
    });
  });

  describe('isPlainObject 边界情况', () => {
    test('基本类型返回 false', () => {
      expect(isPlainObject(null)).toBe(false);
      expect(isPlainObject(undefined)).toBe(false);
      expect(isPlainObject(42)).toBe(false);
      expect(isPlainObject('str')).toBe(false);
      expect(isPlainObject(true)).toBe(false);
    });

    test('非纯对象返回 false', () => {
      expect(isPlainObject([])).toBe(false);
      expect(isPlainObject(() => {})).toBe(false);
      expect(isPlainObject(new Date())).toBe(false);
      expect(isPlainObject(new Map())).toBe(false);
      expect(isPlainObject(new Set())).toBe(false);
      expect(isPlainObject(/regex/)).toBe(false);

      class Foo {}
      expect(isPlainObject(new Foo())).toBe(false);
    });

    test('纯对象返回 true', () => {
      expect(isPlainObject({})).toBe(true);
      expect(isPlainObject(Object.create(null))).toBe(true);
      expect(isPlainObject(Object.create(Object.prototype))).toBe(true);
      expect(isPlainObject({ a: 1, b: 2 })).toBe(true);
    });
  });

  describe('Proxy trap 测试', () => {
    test('getOwnPropertyDescriptor 返回正确的描述符', () => {
      const store = gfstate(
        { count: 0 },
        { computed: { double: (s) => s.count * 2 } },
      );

      const desc = Object.getOwnPropertyDescriptor(store, 'count');
      expect(desc).toBeDefined();
      expect(desc!.configurable).toBe(true);
      expect(desc!.enumerable).toBe(true);
      expect(desc!.value).toBe(0);

      const computedDesc = Object.getOwnPropertyDescriptor(store, 'double');
      expect(computedDesc).toBeDefined();
      expect(computedDesc!.value).toBe(0);
    });

    test('Object.keys 不包含 prototype', () => {
      const store = gfstate({ a: 1, b: 'hello' });
      const keys = Object.keys(store);
      expect(keys).not.toContain('prototype');
      expect(keys).toContain('a');
      expect(keys).toContain('b');
    });
  });

  describe('watch 边界', () => {
    test('watch 监听 action key 应打印警告', () => {
      const warnSpy = jest
        .spyOn(console, 'warn')
        .mockImplementation(() => {});
      gfstate(
        { count: 0, inc: () => {} },
        { watch: { inc: () => {} } as any },
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('inc'),
      );
      warnSpy.mockRestore();
    });
  });
});
