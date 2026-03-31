import React, { isValidElement } from 'react';
import { useSyncExternalStore } from 'use-sync-external-store/shim';
import MemoizedFnHelper from './MemoizedFnHelper';

/**
 * done: 函数初始化支持
 * change: 单状态支持异步（有些需要请求接口的状态，如options）,以~开头的属性为异步初始化状态 -- 使用options参数
 * change: 计算属性和监听属性支持，以:号开头的属性为计算属性，以@号开头的方法为监听器 -- 使用options参数
 * done: 支持对象通过配置不自动应用 gfstate
 * todo: gfstate在devops-ui中使用时直接报hooks规则错误，需要处理
 * todo: 对象自动应用 gfstate 的类型问题
 * todo: 测试startTransition的支持情况
 * todo: 验证不同对象，不同类型的数据是否能正常使用gfstate包装和更新
 * todo: 是否增加生命周期，如创建时发起请求等,生命周期是自动调用的，先提供一个beforeCreate和created钩子
 * todo: 生命周期有两个，一个是 gfstate 的生命周期，一个是组件的生命周期（useStore中提供）
 * todo: 在实践中不断完善，想都是问题，做才有答案！
 *
 * 分析：
 * 1. 是否有必要提供生命周期？
 * 2. 是否有必要提供状态变更函数,如onChange？在组件中状态变更是直接会引起re-render的
 * 3. 状态异步支持？如声明状态时，初始值通过调用接口请求获取
 * 4. React异步组件特性的支持？如Suspense等
 * 5. 数组元素是对象是否有必要处理成gfstate？
 * 6. 选项示还是组合式api？
 * 7. 是否提供一个全局的provider,直接传递useStore的数据给下级使用? 无需提供,这是react提供的，由用户去更灵活的使用
 * 8：useStore是否需要支持带有子级context，下面组件可以直接使用useContext取值？无需提供，子级传递对象会自动应用gfstate
 *
 *
 * 规划：
 * 1. 后续可支持跨框架使用，如vue等 - 优先级低
 * 2. 可升级为类以支持更多功能 - 优先级低
 * 3. 对象自动应用 gfstate 的类型问题 - 优先级高
 * 4. 完备的测试用例 - 优先级中
 * 5. api精简
 */

// 使用同步函数来初始化状态，同步函数直接就执行了再返回值，跟立即执行是一样的
export const syncWrapper = <T = unknown>(fn: () => T) => {
  if (typeof fn !== 'function') {
    throw new Error('syncWrapper 只能包装同步函数');
  }
  return fn();
};

type VoidFn = () => void;
type AnyFn = (...args: unknown[]) => unknown;

type SetKeyAction<V> = V | ((prev: V) => V);
type SetDataAction<V> = Partial<V> | ((prev: V) => Partial<V>);

type SetStore<Data> = {
  <K extends keyof Data>(key: K, val: SetKeyAction<Data[K] extends Store<infer Inner> ? Inner | Data[K] : Data[K]>): void;
  (payload: SetDataAction<Data>): void;
};

export type Store<Data> = Data & SetStore<Data>;

const __DEV__ = process.env.NODE_ENV !== 'production';

// 用于避免每次创建空数组时都生成新的引用
export const EMPTY_ARRAY: ReadonlyArray<any> = [];

export const IS_GFSTATE_STORE = Symbol('is_gfstate_store');

// symbol不能作为值, bigint当number处理，这些类型是可以===判断的基本类型
type BaseType = string | number | boolean | undefined | null | bigint | symbol;

// 判断是否为纯数据对象（排除函数、数组、基本类型及常见内置对象）
type IsPlainObject<T> = T extends BaseType
  ? false
  : T extends any[]
    ? false
    : T extends (...args: any[]) => any
      ? false
      : T extends Date
        ? false
        : T extends RegExp
          ? false
          : T extends Map<any, any>
            ? false
            : T extends Set<any>
              ? false
              : T extends Promise<any>
                ? false
                : T extends React.ReactElement
                  ? false
                  : T extends Record<string, any>
                    ? true
                    : false;

// 计算属性返回值类型提取
type ComputedValues<C> = C extends Record<string, (...args: any[]) => any>
  ? { readonly [K in keyof C]: ReturnType<C[K]> }
  : {};

// 递归转换 Data 类型：纯对象属性 → Store<递归转换后的对象>
// ExcludeKeys 是 noGfstateKeys 中指定的不自动包装的 key
export type TransformData<
  Data extends Record<string, unknown>,
  ExcludeKeys extends keyof Data = never,
> = {
  [K in keyof Data]: K extends 'ref'
    ? Data[K]
    : K extends ExcludeKeys
      ? Data[K]
      : IsPlainObject<Data[K]> extends true
        ? Data[K] extends Record<string, unknown>
          ? Store<TransformData<Data[K]>>
          : Data[K]
        : Data[K];
};

// 带计算属性的 Store 返回类型
export type StoreWithComputed<
  Data extends Record<string, unknown>,
  ExcludeKeys extends keyof Data = never,
  Computed extends Record<string, (...args: any[]) => any> = {},
> = Store<TransformData<Data, ExcludeKeys>> & ComputedValues<Computed>;

const isBaseType = (value: any): value is BaseType => {
  const type = typeof value;
  return (
    value === null ||
    type === 'string' ||
    type === 'number' ||
    type === 'boolean' ||
    type === 'undefined' ||
    type === 'bigint' ||
    type === 'symbol'
  );
};

const isSymbol = (value: any): value is symbol => {
  return typeof value === 'symbol';
};

export const isPlainObject = (obj: any): boolean => {
  // 1. 排除基础类型和 null
  if (typeof obj !== 'object' || obj === null) return false;

  // 2. 获取原型
  const proto = Object.getPrototypeOf(obj);

  // 3. 如果没有原型 (比如 Object.create(null))，它就是一个纯对象 -> 也就是说它是 Record
  if (proto === null) return true;

  // 4. 如果有原型，检查它的 constructor 是否是 Object
  // 这一步是为了排除 class Person {} 的实例
  return proto.constructor === Object;
};

export const isGfstateStore = (
  obj: any,
): obj is Store<Record<string, unknown>> => {
  return typeof obj === 'function' && obj[IS_GFSTATE_STORE] === true;
};

let run = (fn: VoidFn) => {
  fn();
};

// 用于检测循环引用的对象追踪
const processingObjects = new WeakSet<object>();

// 计算属性与监听属性
export interface Options<
  Data extends Record<string, unknown>,
  ExcludeKeys extends keyof Data = never,
  Computed extends Record<string, (state: Data) => any> = Record<string, (state: Data) => any>,
> {
  // 状态与计算属性key只能唯一，不能重复
  // 计算属性的值可以获取，但不能修改
  computed?: Computed & Record<string, (state: Data) => any>;
  // 监听状态变化的回调，key 为状态属性名
  watch?: Partial<Record<keyof Data, (newVal: any, oldVal: any, store: any) => void>>;
  created?: (store: StoreWithComputed<Data, ExcludeKeys, Computed>) => void;
  // 不自动应用gfstate的key
  noGfstateKeys?: ExcludeKeys[];
}

const gfstate = <
  Data extends Record<string, unknown>,
  ExcludeKeys extends keyof Data = never,
  Computed extends Record<string, (state: Data) => any> = Record<string, (state: Data) => any>,
>(
  paramData: Data | (() => Data),
  options?: Options<Data, ExcludeKeys, Computed>,
): StoreWithComputed<Data, ExcludeKeys, Computed> => {
  const data: Data = typeof paramData === 'function' ? paramData() : paramData;
  type K = keyof Data;
  type V = Data[K];
  type Actions = Record<K, MemoizedFnHelper>;

  type State = Record<
    K,
    {
      subscribe: (setter: VoidFn) => VoidFn;
      getSnapshot: () => Data[K];
      triggerUpdate: () => void;
    }
  >;

  type StoreOfGfstate = Record<K, Store<Record<string, unknown>>>;
  if (__DEV__ && !isPlainObject(data)) {
    throw new Error('对象必须为纯对象: Record<string, unknown>');
  }

  processingObjects.add(data);

  const state: State = {} as State;
  const actions: Actions = {} as Actions;
  const gfStates: StoreOfGfstate = {} as StoreOfGfstate;
  // 未初始化，但暂时不知道类型的存储。解决hooks规刚问题
  const uninitialized: State = {} as State;
  const uninitializedActions: Actions = {} as Actions;

  // 计算属性注册表
  type ComputedEntry = {
    deps: Set<string>;
    cachedValue: unknown;
    subscribe: (setter: VoidFn) => VoidFn;
    getSnapshot: () => unknown;
    triggerUpdate: () => void;
  };
  const computeds: Record<string, ComputedEntry> = {};

  // 初始化 state 和 actions
  const initStateAndActions = (key: K, initVal: V) => {
    if (key === 'ref') {
      // ref 不做任何处理
      return;
    } else if (isGfstateStore(initVal)) {
      gfStates[key] = data[key] as Store<Record<string, unknown>>;
    } else if (typeof initVal === 'function') {
      // actions
      actions[key] = new MemoizedFnHelper(initVal as AnyFn);
    } else {
      // state
      const setters = new Set<VoidFn>();
      if (isBaseType(initVal)) {
        if (isSymbol(initVal)) {
          console.warn(
            `${
              key as string
            }的值为Symbol会导致每次刷新都更新，请勿使用Symbol类型的值作为状态。`,
          );
        }

        state[key] = {
          subscribe: (setter) => {
            setters.add(setter);
            return () => setters.delete(setter);
          },
          getSnapshot: () => data[key],
          triggerUpdate: () => setters.forEach((setter) => setter()),
        };
      } else if (Array.isArray(initVal)) {
        // 数组类型是数据，不再对其内部元素进行处理，值的变化就是整个数组的引用变化
        if (initVal.length === 0) {
          data[key] = EMPTY_ARRAY as V;
        }
        state[key] = {
          subscribe: (setter) => {
            setters.add(setter);
            return () => setters.delete(setter);
          },
          getSnapshot: () => data[key],
          triggerUpdate: () => setters.forEach((setter) => setter()),
        };
      } else if (isPlainObject(initVal)) {
        // 有可能是React元素或者配置了不自动应用gfstate的key
        if (isValidElement(initVal) || options?.noGfstateKeys?.includes(key as ExcludeKeys)) {
          state[key] = {
            subscribe: (setter) => {
              setters.add(setter);
              return () => setters.delete(setter);
            },
            getSnapshot: () => data[key],
            triggerUpdate: () => setters.forEach((setter) => setter()),
          };
        } else if (processingObjects.has(initVal as object)) {
          // 循环引用 - 作为普通 state 处理
          state[key] = {
            subscribe: (setter) => {
              setters.add(setter);
              return () => setters.delete(setter);
            },
            getSnapshot: () => data[key],
            triggerUpdate: () => setters.forEach((setter) => setter()),
          };
          if (__DEV__) {
            console.warn(
              `gfstate: 检测到循环引用 (key: "${key as string}")，该属性将作为普通状态处理。`,
            );
          }
        } else {
          gfStates[key] = gfstate(data[key] as Record<string, unknown>);
        }
      } else {
        state[key] = {
          subscribe: (setter) => {
            setters.add(setter);
            return () => setters.delete(setter);
          },
          getSnapshot: () => data[key],
          triggerUpdate: () => setters.forEach((setter) => setter()),
        };
      }
    }
  };

  Object.keys(data).forEach((key: K) => {
    const initVal = data[key];
    initStateAndActions(key, initVal);
  });

  // 依赖追踪：创建轻量代理记录读取的 key
  const trackDeps = (fn: (s: any) => any): { result: unknown; deps: Set<string> } => {
    const deps = new Set<string>();
    const reader = new Proxy(data, {
      get: (_target, key: string) => {
        deps.add(key);
        if (key in gfStates) return gfStates[key];
        return data[key as K];
      },
    });
    const result = fn(reader);
    return { result, deps };
  };

  // 初始化计算属性
  if (options?.computed) {
    Object.entries(options.computed).forEach(([key, fn]) => {
      if (__DEV__) {
        if (key in state || key in actions || key in gfStates) {
          throw new Error(`计算属性 "${key}" 与已有的 state/action 键名冲突`);
        }
      }

      const { result, deps } = trackDeps(fn);
      const setters = new Set<VoidFn>();

      computeds[key] = {
        deps,
        cachedValue: result,
        subscribe: (setter) => {
          setters.add(setter);
          return () => setters.delete(setter);
        },
        getSnapshot: () => computeds[key].cachedValue,
        triggerUpdate: () => setters.forEach((setter) => setter()),
      };

      // 订阅依赖的 state 变化，重新计算
      const subscribeToDepKey = (depKey: string) => {
        if (depKey in state) {
          state[depKey as K].subscribe(() => {
            const { result: newResult, deps: newDeps } = trackDeps(fn);
            if (computeds[key].cachedValue !== newResult) {
              computeds[key].cachedValue = newResult;
              computeds[key].deps = newDeps;
              run(() => computeds[key].triggerUpdate());
            }
          });
        }
      };

      deps.forEach(subscribeToDepKey);
    });
  }

  const setKey = (
    key: K,
    val: unknown | SetKeyAction<V> | Store<Record<string, unknown>>,
  ) => {
    if (key === 'ref') {
      data[key] = val as V;
      return;
    }
    if ((key as string) in computeds) {
      if (__DEV__) {
        throw new Error(`计算属性 "${key as string}" 是只读的，不能赋值`);
      }
      return;
    }
    if (key in gfStates) {
      if (isGfstateStore(val)) {
        throw new Error(
          `${
            key as string
          } 已经是 gfstate store 了，不能再赋值为 gfstate store`,
        );
      } else {
        gfStates[key](
          val instanceof Function ? val(data[key] as V) : (val as V),
        );
      }
      return;
    }
    if (key in state) {
      const newVal = val instanceof Function ? val(data[key]) : val;
      if (data[key] !== newVal) {
        data[key] = newVal;
        run(() => (state[key].triggerUpdate as any)());
      }
      return;
    } else {
      if (key in actions) {
        // 在方法里面更新
        actions[key]?.update(val as AnyFn);
      } else {
        if (key in uninitialized && typeof val === 'function') {
          // 对方法进行特殊处理
          if (uninitializedActions[key]) {
            uninitializedActions[key].update(val as AnyFn);
          } else {
            uninitializedActions[key] = new MemoizedFnHelper(val as AnyFn);
          }
          if (data[key] !== uninitializedActions[key].run) {
            data[key] = uninitializedActions[key].run as any;
            run(() => (uninitialized[key].triggerUpdate as any)());
          }
        } else {
          // 不在状态，也不在方法里，那就是新增, 初始化 state 和 actions
          data[key] = val as V;
          initStateAndActions(key, val as V);
          if (key in uninitialized) {
            run(() => (uninitialized[key].triggerUpdate as any)());
          }
        }
      }
    }
  };

  const getValue = (key: K) => {
    if (key === 'ref') {
      return data[key];
    }
    if (key === IS_GFSTATE_STORE) {
      return true;
    }
    if (key in gfStates) {
      return gfStates[key];
    }
    if (key in actions) {
      return actions[key].run;
    }

    // 计算属性
    if ((key as string) in computeds) {
      const computed = computeds[key as string];
      try {
        return useSyncExternalStore(
          computed.subscribe,
          computed.getSnapshot,
          computed.getSnapshot,
        );
      } catch (err) {
        return computed.cachedValue;
      }
    }

    if (key in state) {
      try {
        return useSyncExternalStore(
          state[key].subscribe,
          state[key].getSnapshot,
          state[key].getSnapshot,
        );
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (err) {
        return data[key];
      }
    }

    if (!(key in uninitialized)) {
      const setters = new Set<VoidFn>();
      uninitialized[key] = {
        subscribe: (setter) => {
          setters.add(setter);
          return () => setters.delete(setter);
        },
        getSnapshot: () => data[key],
        triggerUpdate: () => setters.forEach((setter) => setter()),
      };
    }

    return useSyncExternalStore(
      uninitialized[key].subscribe,
      uninitialized[key].getSnapshot,
      uninitialized[key].getSnapshot,
    );
  };

  function Target() {}

  // 将 data 的属性复制到 Target 上，跳过 Function 原型上的只读属性（如 name、length）
  Object.keys(data).forEach((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(Target, key);
    if (!descriptor || descriptor.configurable) {
      Object.defineProperty(Target, key, {
        value: data[key],
        writable: true,
        configurable: true,
        enumerable: true,
      });
    }
  });

  const instance = new Proxy(
    Target as unknown as StoreWithComputed<Data, ExcludeKeys, Computed>,
    {
      get: (_target, key: K) => {
        return getValue(key);
      },
      set: (_target, key: K, val: V) => {
        setKey(key, val);
        return true;
      },
      ownKeys: (_target) => {
        const dataKeys = new Set<string | symbol>([
          ...Object.keys(data),
          ...Object.keys(gfStates),
          ...Object.keys(actions),
          ...Object.keys(computeds),
        ]);
        // Proxy 规范要求：target 上不可配置的属性必须出现在 ownKeys 结果中
        // Function 的 prototype 是不可配置的，必须包含
        for (const key of Reflect.ownKeys(_target)) {
          const desc = Object.getOwnPropertyDescriptor(_target, key);
          if (desc && !desc.configurable) {
            dataKeys.add(key);
          }
        }
        return [...dataKeys];
      },
      getOwnPropertyDescriptor: (_target, key: K) => {
        if (
          key in data ||
          key in state ||
          key in actions ||
          key in gfStates ||
          key in uninitialized ||
          (key as string) in computeds
        ) {
          const value = (key as string) in computeds
            ? computeds[key as string].cachedValue
            : data[key];
          return {
            configurable: true,
            enumerable: true,
            value,
          };
        }
        // 对于 Function 自身的不可配置属性（如 prototype），返回原始描述符
        return Object.getOwnPropertyDescriptor(_target, key);
      },
      apply: (
        _target,
        _thisArg,
        [key, updater]: [K | SetDataAction<Data>, SetKeyAction<V>],
      ) => {
        // store('key', val)
        if (typeof key === 'string') {
          setKey(key, updater);
          return;
        }

        // store({ key: val })
        if (isPlainObject(key)) {
          const newData = key as Data;
          Object.keys(newData).forEach((k) => {
            setKey(k, newData[k]);
          });
          return;
        }

        // store(prev => next)
        if (typeof key === 'function') {
          const newData = key(data);
          Object.keys(newData).forEach((k) => {
            setKey(k, newData[k]);
          });
        }
      },
    } as ProxyHandler<StoreWithComputed<Data, ExcludeKeys, Computed>>,
  );

  // 初始化 watch 监听器
  if (options?.watch) {
    Object.entries(options.watch).forEach(([key, watchFn]) => {
      if (!watchFn) return;
      if (key in state) {
        let oldValue = data[key as K];
        state[key as K].subscribe(() => {
          const newValue = data[key as K];
          if (newValue !== oldValue) {
            const prev = oldValue;
            oldValue = newValue;
            try {
              watchFn(newValue, prev, instance);
            } catch (e) {
              console.error(`gfstate watch: 键 "${key}" 的监听回调执行出错:`, e);
            }
          }
        });
      } else if (__DEV__) {
        console.warn(
          `gfstate watch: 键 "${key}" 不存在于 state 中，监听无效。`,
        );
      }
    });
  }

  // 执行生命周期created
  options?.created?.(instance);

  processingObjects.delete(data);

  return instance;
};

gfstate.config = ({ batch }: { batch: typeof run }) => {
  run = batch;
};

export default gfstate;
