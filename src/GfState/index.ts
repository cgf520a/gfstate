import React, { isValidElement } from 'react';
import { useSyncExternalStore } from 'use-sync-external-store/shim';
import MemoizedFnHelper from './MemoizedFnHelper';

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
  <K extends keyof Data>(
    key: K,
    val: SetKeyAction<
      Data[K] extends Store<infer Inner> ? Inner | Data[K] : Data[K]
    >,
  ): void;
  (payload: SetDataAction<Data>): void;
};

export type Store<Data> = Data & SetStore<Data>;

const __DEV__ = process.env.NODE_ENV !== 'production';

// 用于避免每次创建空数组时都生成新的引用
export const EMPTY_ARRAY: ReadonlyArray<any> = [];

export const IS_GFSTATE_STORE = Symbol('is_gfstate_store');

// 外部订阅 API 标识符
export const SUBSCRIBE = Symbol('gfstate_subscribe');

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

// 外部订阅函数类型
type SubscribeFn = {
  (cb: (key: string, newVal: unknown, oldVal: unknown) => void): () => void;
  (key: string, cb: (newVal: unknown, oldVal: unknown) => void): () => void;
};

// 带计算属性的 Store 返回类型
export type StoreWithComputed<
  Data extends Record<string, unknown>,
  ExcludeKeys extends keyof Data = never,
  Computed extends Record<string, (...args: any[]) => any> = {},
> = Store<TransformData<Data, ExcludeKeys>> &
  ComputedValues<Computed> & { subscribe: SubscribeFn };

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
  Computed extends Record<string, (state: Data) => any> = Record<
    string,
    (state: Data) => any
  >,
> {
  // 状态与计算属性key只能唯一，不能重复
  // 计算属性的值可以获取，但不能修改
  computed?: Computed & Record<string, (state: Data) => any>;
  // 监听状态变化的回调，key 支持 state key、computed key 以及嵌套子 store key
  watch?: Partial<
    Record<
      keyof Data | keyof Computed,
      (newVal: any, oldVal: any, store: any) => void
    >
  >;
  created?: (store: StoreWithComputed<Data, ExcludeKeys, Computed>) => void;
  // 不自动应用gfstate的key
  noGfstateKeys?: ExcludeKeys[];
}

const gfstate = <
  Data extends Record<string, unknown>,
  ExcludeKeys extends keyof Data = never,
  Computed extends Record<string, (state: Data) => any> = Record<
    string,
    (state: Data) => any
  >,
>(
  paramData: Data | (() => Data),
  options?: Options<Data, ExcludeKeys, Computed>,
): StoreWithComputed<Data, ExcludeKeys, Computed> => {
  const rawData: Data =
    typeof paramData === 'function' ? paramData() : paramData;
  type K = keyof Data;
  type V = Data[K];
  type Actions = Record<K, MemoizedFnHelper>;

  type StateEntry = {
    subscribe: (setter: VoidFn) => VoidFn;
    getSnapshot: () => Data[K];
    triggerUpdate: () => void;
  };
  type State = Record<K, StateEntry>;

  type StoreOfGfstate = Record<K, Store<Record<string, unknown>>>;
  if (__DEV__ && !isPlainObject(rawData)) {
    throw new Error('对象必须为纯对象: Record<string, unknown>');
  }

  // 浅拷贝避免修改用户原始对象
  const data: Data = { ...rawData } as Data;

  processingObjects.add(data);
  // 同时记录原始对象引用，以正确检测循环引用（如 obj.self = obj）
  processingObjects.add(rawData);

  const state: State = {} as State;
  const actions: Actions = {} as Actions;
  const gfStates: StoreOfGfstate = {} as StoreOfGfstate;
  // 未初始化，但暂时不知道类型的存储。解决hooks规则问题
  const uninitialized: State = {} as State;
  const uninitializedActions: Actions = {} as Actions;

  // 外部订阅：监听任意属性变更
  type SubscribeCallback = (
    key: string,
    newVal: unknown,
    oldVal: unknown,
  ) => void;
  const globalListeners = new Set<SubscribeCallback>();

  // 计算属性注册表
  type ComputedEntry = {
    deps: Set<string>;
    cachedValue: unknown;
    subscribe: (setter: VoidFn) => VoidFn;
    getSnapshot: () => unknown;
    triggerUpdate: () => void;
  };
  const computeds: Record<string, ComputedEntry> = {};

  // ownKeys 缓存
  let cachedKeys: (string | symbol)[] | null = null;
  const invalidateKeysCache = () => {
    cachedKeys = null;
  };

  // 创建订阅入口的工厂函数，消除重复
  const createSubscription = (key: K): StateEntry => {
    const setters = new Set<VoidFn>();
    return {
      subscribe: (setter: VoidFn) => {
        setters.add(setter);
        return () => setters.delete(setter);
      },
      getSnapshot: () => data[key],
      triggerUpdate: () => setters.forEach((setter) => setter()),
    };
  };

  // 初始化 state 和 actions
  const initStateAndActions = (key: K, initVal: V) => {
    if (key === 'ref' || key === 'subscribe') return;

    if (isGfstateStore(initVal)) {
      gfStates[key] = data[key] as Store<Record<string, unknown>>;
      invalidateKeysCache();
      return;
    }

    if (typeof initVal === 'function') {
      actions[key] = new MemoizedFnHelper(initVal as AnyFn);
      invalidateKeysCache();
      return;
    }

    // state 分支
    if (isBaseType(initVal)) {
      if (isSymbol(initVal)) {
        console.warn(
          `${
            key as string
          }的值为Symbol会导致每次刷新都更新，请勿使用Symbol类型的值作为状态。`,
        );
      }
      state[key] = createSubscription(key);
      invalidateKeysCache();
      return;
    }

    if (Array.isArray(initVal)) {
      if (initVal.length === 0) {
        data[key] = EMPTY_ARRAY as V;
      }
      state[key] = createSubscription(key);
      invalidateKeysCache();
      return;
    }

    if (isPlainObject(initVal)) {
      if (
        isValidElement(initVal) ||
        options?.noGfstateKeys?.includes(key as ExcludeKeys)
      ) {
        state[key] = createSubscription(key);
        invalidateKeysCache();
        return;
      }
      if (processingObjects.has(initVal as object)) {
        // 循环引用 - 作为普通 state 处理
        state[key] = createSubscription(key);
        invalidateKeysCache();
        if (__DEV__) {
          console.warn(
            `gfstate: 检测到循环引用 (key: "${
              key as string
            }")，该属性将作为普通状态处理。`,
          );
        }
        return;
      }
      gfStates[key] = gfstate(data[key] as Record<string, unknown>);
      invalidateKeysCache();
      return;
    }

    // 兜底：Date, RegExp, Map, Set 等非纯对象
    state[key] = createSubscription(key);
    invalidateKeysCache();
  };

  Object.keys(data).forEach((key: K) => {
    const initVal = data[key];
    initStateAndActions(key, initVal);
  });

  // 依赖追踪：创建轻量代理记录读取的 key
  const trackDeps = (
    fn: (s: any) => any,
  ): { result: unknown; deps: Set<string> } => {
    const deps = new Set<string>();
    const reader = new Proxy(data, {
      get: (_target, key: string) => {
        deps.add(key);
        if (key in gfStates) return gfStates[key];
        // 支持 computed 依赖 computed：返回已缓存的计算值
        if (key in computeds) return computeds[key].cachedValue;
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
      invalidateKeysCache();

      // 订阅依赖的 state/computed/gfStates 变化，重新计算
      const subscribedDeps = new Map<string, VoidFn>();

      const subscribeToDepKey = (depKey: string): VoidFn | undefined => {
        if (depKey in state) {
          return state[depKey as K].subscribe(recompute);
        } else if (depKey in computeds) {
          return computeds[depKey].subscribe(recompute);
        } else if (depKey in gfStates) {
          // 订阅嵌套子 store 的任意属性变更
          const childSubscribe = (gfStates[depKey as K] as any)[SUBSCRIBE];
          if (typeof childSubscribe === 'function') {
            return childSubscribe(() => recompute());
          }
        }
        return undefined;
      };

      const recompute = () => {
        const { result: newResult, deps: newDeps } = trackDeps(fn);
        if (computeds[key].cachedValue !== newResult) {
          const oldResult = computeds[key].cachedValue;
          computeds[key].cachedValue = newResult;
          computeds[key].deps = newDeps;
          run(() => computeds[key].triggerUpdate());
          notifyGlobalListeners(key as K, newResult, oldResult);
        }
        // 动态依赖重新订阅：订阅新增的依赖
        newDeps.forEach((depKey) => {
          if (!subscribedDeps.has(depKey)) {
            const unsub = subscribeToDepKey(depKey);
            if (unsub) subscribedDeps.set(depKey, unsub);
          }
        });
        // 取消已移除的依赖
        subscribedDeps.forEach((unsub, depKey) => {
          if (!newDeps.has(depKey)) {
            unsub();
            subscribedDeps.delete(depKey);
          }
        });
      };

      // 初始订阅
      deps.forEach((depKey) => {
        const unsub = subscribeToDepKey(depKey);
        if (unsub) subscribedDeps.set(depKey, unsub);
      });
    });
  }

  const notifyGlobalListeners = (key: K, newVal: unknown, oldVal: unknown) => {
    globalListeners.forEach((cb) => {
      try {
        cb(key as string, newVal, oldVal);
      } catch (e) {
        if (__DEV__) {
          console.error('gfstate subscribe: 回调执行出错:', e);
        }
      }
    });
  };

  // 将嵌套子 store 的变更事件传播到父 store 的 globalListeners
  Object.keys(gfStates).forEach((gfKey) => {
    const childSubscribe = (gfStates[gfKey as K] as any)[SUBSCRIBE];
    if (typeof childSubscribe === 'function') {
      childSubscribe((childKey: string, newVal: unknown, oldVal: unknown) => {
        notifyGlobalListeners(`${gfKey}.${childKey}` as K, newVal, oldVal);
      });
    }
  });

  // 共享的订阅处理函数，消除 SUBSCRIBE / 'subscribe' 两处重复
  const subscribeHandler = (
    keyOrCb: string | SubscribeCallback,
    cb?: (newVal: unknown, oldVal: unknown) => void,
  ) => {
    if (typeof keyOrCb === 'function') {
      globalListeners.add(keyOrCb);
      return () => globalListeners.delete(keyOrCb);
    }
    const watchKey = keyOrCb;
    const wrapper: SubscribeCallback = (k, nv, ov) => {
      if (k === watchKey) cb!(nv, ov);
    };
    globalListeners.add(wrapper);
    return () => globalListeners.delete(wrapper);
  };

  // 尝试使用 useSyncExternalStore，非 React 环境下回退到直接返回值
  const useStoreValue = (
    entry: { subscribe: (setter: VoidFn) => VoidFn; getSnapshot: () => any },
    fallback: () => any,
  ) => {
    try {
      return useSyncExternalStore(
        entry.subscribe,
        entry.getSnapshot,
        entry.getSnapshot,
      );
    } catch {
      return fallback();
    }
  };

  const setKey = (
    key: K,
    val: unknown | SetKeyAction<V> | Store<Record<string, unknown>>,
  ) => {
    if (key === 'ref') {
      data[key] = val as V;
      return;
    }
    if (key === 'subscribe') {
      if (__DEV__) {
        console.warn('gfstate: "subscribe" 是保留属性名，不能赋值。');
      }
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
      }
      gfStates[key](
        typeof val === 'function' ? val(data[key] as V) : (val as V),
      );
      return;
    }
    if (key in state) {
      const newVal = typeof val === 'function' ? val(data[key]) : val;
      if (data[key] !== newVal) {
        const oldVal = data[key];
        data[key] = newVal;
        run(() => state[key].triggerUpdate());
        notifyGlobalListeners(key, newVal, oldVal);
      }
      return;
    }
    if (key in actions) {
      actions[key]?.update(val as AnyFn);
      return;
    }
    if (key in uninitialized && typeof val === 'function') {
      // 对方法进行特殊处理
      if (uninitializedActions[key]) {
        uninitializedActions[key].update(val as AnyFn);
      } else {
        uninitializedActions[key] = new MemoizedFnHelper(val as AnyFn);
      }
      if (data[key] !== uninitializedActions[key].run) {
        data[key] = uninitializedActions[key].run as any;
        run(() => uninitialized[key].triggerUpdate());
      }
      return;
    }
    // 不在状态，也不在方法里，那就是新增, 初始化 state 和 actions
    data[key] = val as V;
    initStateAndActions(key, val as V);
    if (key in uninitialized) {
      run(() => uninitialized[key].triggerUpdate());
    }
  };

  const getValue = (key: K) => {
    if (key === 'ref') return data[key];
    if (key === IS_GFSTATE_STORE) return true;
    if (key === SUBSCRIBE || key === 'subscribe') return subscribeHandler;
    if (key in gfStates) return gfStates[key];
    if (key in actions) return actions[key].run;

    // 计算属性
    if ((key as string) in computeds) {
      const computed = computeds[key as string];
      return useStoreValue(computed, () => computed.cachedValue);
    }

    // state
    if (key in state) {
      return useStoreValue(state[key], () => data[key]);
    }

    // 未初始化的 key
    if (!(key in uninitialized)) {
      uninitialized[key] = createSubscription(key);
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
        if (cachedKeys) return cachedKeys;
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
        cachedKeys = [...dataKeys];
        return cachedKeys;
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
          const value =
            (key as string) in computeds
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
              console.error(
                `gfstate watch: 键 "${key}" 的监听回调执行出错:`,
                e,
              );
            }
          }
        });
      } else if (key in computeds) {
        // 监听计算属性变更
        let oldValue = computeds[key].cachedValue;
        computeds[key].subscribe(() => {
          const newValue = computeds[key].cachedValue;
          if (newValue !== oldValue) {
            const prev = oldValue;
            oldValue = newValue;
            try {
              watchFn(newValue, prev, instance);
            } catch (e) {
              console.error(
                `gfstate watch: 键 "${key}" 的监听回调执行出错:`,
                e,
              );
            }
          }
        });
      } else if (key in gfStates) {
        // 监听嵌套子 store 的任意属性变更
        const childSubscribe = (gfStates[key] as any)[SUBSCRIBE];
        if (typeof childSubscribe === 'function') {
          childSubscribe(
            (changedKey: string, newVal: unknown, oldVal: unknown) => {
              try {
                watchFn(newVal, oldVal, instance);
              } catch (e) {
                console.error(
                  `gfstate watch: 键 "${key}.${changedKey}" 的监听回调执行出错:`,
                  e,
                );
              }
            },
          );
        }
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
  processingObjects.delete(rawData);

  return instance;
};

gfstate.config = ({ batch }: { batch: typeof run }) => {
  run = batch;
};

export default gfstate;
