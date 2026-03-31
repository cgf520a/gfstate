import React, { isValidElement } from 'react';
import { useSyncExternalStore } from 'use-sync-external-store/shim';
import MemoizedFnHelper from './MemoizedFnHelper';
import { type EqualityFn, shallowEqual, deepEqual } from './equality';
import {
  type GfstatePlugin,
  type PluginContext,
  type OnBeforeSetResult,
  registerGlobalPlugin,
  getGlobalPlugins,
  clearGlobalPlugins,
  createBeforeSetRunner,
  createAfterSetRunner,
  createSubscribeRunner,
} from './plugins';

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

// 内部方法标识符
export const RESET = Symbol('gfstate_reset');
export const DESTROY = Symbol('gfstate_destroy');
export const SNAPSHOT = Symbol('gfstate_snapshot');

// 重新导出相等性工具函数，方便用户使用
export { shallowEqual, deepEqual };
export type { EqualityFn };

// 提取对象所有嵌套属性路径（点分隔字符串 如 'user.profile.name'）
type NestedKeyPaths<T> = T extends Record<string, unknown>
  ? {
      [K in keyof T & string]: T[K] extends Record<string, unknown>
        ? K | `${K}.${NestedKeyPaths<T[K]>}`
        : K;
    }[keyof T & string]
  : never;

// 根据点路径获取值类型
type PathValue<T, P extends string> = P extends `${infer K}.${infer Rest}`
  ? K extends keyof T
    ? PathValue<NonNullable<T[K]>, Rest>
    : unknown
  : P extends keyof T
  ? T[P]
  : unknown;

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

// 深拷贝工具函数（用于 reset 初始快照和 snapshot）
const deepClone = <T>(obj: T, seen = new WeakMap()): T => {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime()) as T;
  if (obj instanceof RegExp) return new RegExp(obj.source, obj.flags) as T;
  if (obj instanceof Map) {
    const map = new Map();
    (obj as Map<unknown, unknown>).forEach((v, k) =>
      map.set(deepClone(k, seen), deepClone(v, seen)),
    );
    return map as T;
  }
  if (obj instanceof Set) {
    const set = new Set();
    (obj as Set<unknown>).forEach((v) => set.add(deepClone(v, seen)));
    return set as T;
  }
  if (seen.has(obj as object)) return seen.get(obj as object);
  if (Array.isArray(obj)) {
    const arr: unknown[] = [];
    seen.set(obj, arr);
    obj.forEach((item, i) => (arr[i] = deepClone(item, seen)));
    return arr as T;
  }
  const clone = Object.create(Object.getPrototypeOf(obj));
  seen.set(obj as object, clone);
  for (const key of Object.keys(obj as object)) {
    clone[key] = deepClone((obj as any)[key], seen);
  }
  return clone;
};

// 外部订阅函数类型（支持嵌套路径类型推断）
type SubscribeFn<
  Data extends Record<string, unknown> = Record<string, unknown>,
> = {
  (cb: (key: string, newVal: unknown, oldVal: unknown) => void): () => void;
  <P extends NestedKeyPaths<Data>>(
    key: P,
    cb: (newVal: PathValue<Data, P>, oldVal: PathValue<Data, P>) => void,
  ): () => void;
};

// reset 函数类型
type ResetFn = {
  (): void;
  (key: string): void;
};

// destroy 函数类型
type DestroyFn = () => void;

// snapshot 函数类型
type SnapshotFn = () => Record<string, unknown>;

// 带计算属性的 Store 返回类型
export type StoreWithComputed<
  Data extends Record<string, unknown>,
  ExcludeKeys extends keyof Data = never,
  Computed extends Record<string, (...args: any[]) => any> = {},
> = Store<TransformData<Data, ExcludeKeys>> &
  ComputedValues<Computed> & {
    // subscribe 使用原始 Data（而非 TransformData），以便 NestedKeyPaths 能正确穿透到嵌套 plain objects
    subscribe: SubscribeFn<Data>;
    reset: ResetFn;
    destroy: DestroyFn;
    snapshot: SnapshotFn;
  };

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

// 获取指定 key 的相等函数（优先使用属性级配置，其次使用全局配置，最后回退到 Object.is）
const getEqualityFn = (
  equals: EqualityFn | Partial<Record<string, EqualityFn>> | undefined,
  key: string,
): EqualityFn => {
  if (!equals) return Object.is;
  if (typeof equals === 'function') return equals;
  const perKey = (equals as Partial<Record<string, EqualityFn>>)[key];
  return perKey ?? Object.is;
};

let run = (fn: VoidFn) => {
  fn();
};

// enforceActions 严格模式：开启后 state 修改必须在 action 函数内进行
let enforceActionsEnabled = false;
// 当前正在执行的 action 嵌套深度（>0 表示在 action 内部）
let insideActionCount = 0;

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
  // 监听状态变化的回调，key 支持 state key、computed key 以及嵌套子 store key（如 'user.profile.name'）
  watch?: Partial<
    Record<
      keyof Data | keyof Computed | NestedKeyPaths<Data> | (string & {}), // 允许任意字符串路径，兼容动态场景
      (newVal: any, oldVal: any, store: any) => void
    >
  >;
  created?: (store: StoreWithComputed<Data, ExcludeKeys, Computed>) => void;
  // 不自动应用gfstate的key
  noGfstateKeys?: ExcludeKeys[];
  // 插件列表（仅影响当前 store）
  plugins?: GfstatePlugin[];
  // Store 名称（用于 DevTools、Logger 等插件标识）
  storeName?: string;
  /**
   * 变更拦截器：在状态写入前拦截
   * - 返回新值：使用返回值作为最终写入值
   * - 返回 false：取消本次更新
   * 可用于数据校验、格式化、权限控制
   */
  intercept?: Partial<{
    [K in keyof Data]: Data[K] extends (...args: any[]) => any
      ? never
      : (newVal: Data[K], oldVal: Data[K]) => Data[K] | false;
  }>;
  /**
   * 自定义相等函数，控制何时触发更新
   * - 全局配置: { equals: shallowEqual }
   * - 属性级配置: { equals: { items: deepEqual } }
   * 默认使用 Object.is（严格引用相等）
   */
  equals?: EqualityFn | Partial<{ [K in keyof Data]: EqualityFn }>;
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

  // 深拷贝初始数据用于 reset
  const initialSnapshot: Data = deepClone(rawData);

  // 合并全局插件和 per-store 插件
  const mergedPlugins: GfstatePlugin[] = [
    ...getGlobalPlugins(),
    ...(options?.plugins || []),
  ];

  // 插件钩子运行器（在 Proxy 创建后赋值）
  let runBeforeSet: ReturnType<typeof createBeforeSetRunner> = null;
  let runAfterSet: ReturnType<typeof createAfterSetRunner> = null;
  let runOnSubscribe: ReturnType<typeof createSubscribeRunner> = null;
  // 插件 onInit 返回的清理函数
  const pluginCleanups: VoidFn[] = [];

  // 销毁状态标记
  let destroyed = false;
  // 销毁时需要清理的取消订阅函数
  const cleanupFns: VoidFn[] = [];

  processingObjects.add(data);
  // 同时记录原始对象引用，以正确检测循环引用（如 obj.self = obj）
  processingObjects.add(rawData);

  const state: State = {} as State;
  const actions: Actions = {} as Actions;
  // action 的稳定调用包装（带 enforceActions 深度追踪）
  type ActionWrappers = Record<K, (...args: unknown[]) => unknown>;
  const actionWrappers: ActionWrappers = {} as ActionWrappers;
  const gfStates: StoreOfGfstate = {} as StoreOfGfstate;
  // 未初始化，但暂时不知道类型的存储。解决hooks规则问题
  const uninitialized: State = {} as State;
  const uninitializedActions: Actions = {} as Actions;
  const uninitializedActionWrappers: ActionWrappers = {} as ActionWrappers;

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
  // 计算属性调用栈，用于检测循环依赖
  const computingStack: string[] = [];

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
    if (
      key === 'ref' ||
      key === 'subscribe' ||
      key === 'reset' ||
      key === 'destroy' ||
      key === 'snapshot'
    )
      return;

    if (isGfstateStore(initVal)) {
      gfStates[key] = data[key] as Store<Record<string, unknown>>;
      invalidateKeysCache();
      return;
    }

    if (typeof initVal === 'function') {
      actions[key] = new MemoizedFnHelper(initVal as AnyFn);
      // 稳定的 action 包装器：追踪 action 调用深度以支持 enforceActions
      const helper = actions[key];
      actionWrappers[key] = (...args: unknown[]) => {
        insideActionCount++;
        try {
          return helper.run(...args);
        } finally {
          insideActionCount--;
        }
      };
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
        // 循环依赖检测：如果当前 key 正在被计算（在 computingStack 中），则是循环依赖
        if (__DEV__ && computingStack.includes(key)) {
          const chain = [...computingStack, key].join(' → ');
          throw new Error(
            `gfstate: 检测到 computed 循环依赖: ${chain}。请检查各 computed 之间的依赖关系，确保不存在互相引用。`,
          );
        }
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

      if (__DEV__) computingStack.push(key);
      let trackResult: { result: unknown; deps: Set<string> };
      try {
        trackResult = trackDeps(fn);
      } finally {
        if (__DEV__) computingStack.pop();
      }
      const { result, deps } = trackResult;
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
        if (__DEV__) computingStack.push(key);
        let reTrackResult: { result: unknown; deps: Set<string> };
        try {
          reTrackResult = trackDeps(fn);
        } finally {
          if (__DEV__) computingStack.pop();
        }
        const { result: newResult, deps: newDeps } = reTrackResult;
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

      // 注册销毁时清理计算属性订阅
      cleanupFns.push(() => {
        subscribedDeps.forEach((unsub) => unsub());
        subscribedDeps.clear();
      });
    });

    // 初始化完成后，对 computed 依赖图进行 DFS 检测传递性循环依赖（如 A → B → A）
    if (__DEV__) {
      const visitState: Record<string, 'WHITE' | 'GREY' | 'BLACK'> = {};
      const dfsStack: string[] = [];

      const dfs = (key: string): void => {
        if (visitState[key] === 'BLACK') return;
        if (visitState[key] === 'GREY') {
          const cycleStart = dfsStack.indexOf(key);
          const chain = [...dfsStack.slice(cycleStart), key].join(' → ');
          throw new Error(
            `gfstate: 检测到 computed 循环依赖: ${chain}。请检查各 computed 之间的依赖关系，确保不存在互相引用。`,
          );
        }
        visitState[key] = 'GREY';
        dfsStack.push(key);
        const entry = computeds[key];
        if (entry) {
          entry.deps.forEach((dep) => {
            if (dep in computeds) dfs(dep);
          });
        }
        dfsStack.pop();
        visitState[key] = 'BLACK';
      };

      Object.keys(computeds).forEach((k) => {
        if (!visitState[k]) dfs(k);
      });
    }
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
      const unsub = childSubscribe(
        (childKey: string, newVal: unknown, oldVal: unknown) => {
          notifyGlobalListeners(`${gfKey}.${childKey}` as K, newVal, oldVal);
        },
      );
      if (typeof unsub === 'function') {
        cleanupFns.push(unsub);
      }
    }
  });

  // 共享的订阅处理函数，消除 SUBSCRIBE / 'subscribe' 两处重复
  const subscribeHandler = (
    keyOrCb: string | SubscribeCallback,
    cb?: (newVal: unknown, oldVal: unknown) => void,
  ) => {
    if (typeof keyOrCb === 'function') {
      globalListeners.add(keyOrCb);
      if (runOnSubscribe) runOnSubscribe(null);
      return () => globalListeners.delete(keyOrCb);
    }
    const watchKey = keyOrCb;
    const wrapper: SubscribeCallback = (k, nv, ov) => {
      if (k === watchKey) cb!(nv, ov);
    };
    globalListeners.add(wrapper);
    if (runOnSubscribe) runOnSubscribe(watchKey);
    return () => globalListeners.delete(wrapper);
  };

  // reset 处理函数
  const resetHandler = (key?: string) => {
    if (destroyed) {
      if (__DEV__) {
        console.warn('gfstate: store 已被销毁，不能执行 reset。');
      }
      return;
    }
    if (key !== undefined) {
      // 重置单个 key
      if (key in gfStates) {
        // 嵌套子 store 递归重置
        const childReset = (gfStates[key as K] as any)[RESET];
        if (typeof childReset === 'function') {
          childReset();
        }
      } else if (key in state) {
        const initVal = initialSnapshot[key as K];
        const newVal = deepClone(initVal);
        if (data[key as K] !== newVal) {
          const oldVal = data[key as K];
          data[key as K] = newVal;
          run(() => state[key as K].triggerUpdate());
          notifyGlobalListeners(key as K, newVal, oldVal);
          if (runAfterSet) runAfterSet(key, newVal, oldVal);
        }
      }
    } else {
      // 重置所有 key
      Object.keys(state).forEach((k) => {
        const initVal = initialSnapshot[k as K];
        const newVal = deepClone(initVal);
        if (data[k as K] !== newVal) {
          const oldVal = data[k as K];
          data[k as K] = newVal;
          run(() => state[k as K].triggerUpdate());
          notifyGlobalListeners(k as K, newVal, oldVal);
          if (runAfterSet) runAfterSet(k, newVal, oldVal);
        }
      });
      // 递归重置所有嵌套子 store
      Object.keys(gfStates).forEach((k) => {
        const childReset = (gfStates[k as K] as any)[RESET];
        if (typeof childReset === 'function') {
          childReset();
        }
      });
    }
  };

  // destroy 处理函数
  const destroyHandler = () => {
    if (destroyed) return;

    // onDestroy 钩子（在清理前调用，插件仍可访问 store）
    mergedPlugins.forEach((plugin) => {
      if (plugin.onDestroy) {
        try {
          plugin.onDestroy(pluginContext);
        } catch (e) {
          if (__DEV__) {
            console.error(
              `gfstate 插件 "${plugin.name}" onDestroy 执行出错:`,
              e,
            );
          }
        }
      }
    });

    // 清理插件 onInit 返回的清理函数
    pluginCleanups.forEach((fn) => fn());
    pluginCleanups.length = 0;

    destroyed = true;

    // 清理所有清理函数（watch、子 store 订阅等）
    cleanupFns.forEach((fn) => fn());
    cleanupFns.length = 0;

    // 清理外部订阅
    globalListeners.clear();

    // 递归销毁所有嵌套子 store
    Object.keys(gfStates).forEach((k) => {
      const childDestroy = (gfStates[k as K] as any)[DESTROY];
      if (typeof childDestroy === 'function') {
        childDestroy();
      }
    });
  };

  // snapshot 处理函数
  const snapshotHandler = (): Record<string, unknown> => {
    if (destroyed) {
      if (__DEV__) {
        console.warn('gfstate: store 已被销毁，不能执行 snapshot。');
      }
      return {};
    }

    const result: Record<string, unknown> = {};

    // 普通 state
    Object.keys(state).forEach((k) => {
      result[k] = deepClone(data[k as K]);
    });

    // 嵌套子 store 递归 snapshot
    Object.keys(gfStates).forEach((k) => {
      const childSnapshot = (gfStates[k as K] as any)[SNAPSHOT];
      if (typeof childSnapshot === 'function') {
        result[k] = childSnapshot();
      }
    });

    // computed 值
    Object.keys(computeds).forEach((k) => {
      result[k] = deepClone(computeds[k].cachedValue);
    });

    // ref
    if ('ref' in data) {
      result.ref = deepClone(data['ref' as K]);
    }

    return result;
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
    if (destroyed) {
      if (__DEV__) {
        console.warn(
          `gfstate: store 已被销毁，不应再写入属性 "${key as string}"。`,
        );
      }
      return;
    }
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
    if (key === 'reset' || key === 'destroy' || key === 'snapshot') {
      if (__DEV__) {
        console.warn(`gfstate: "${key as string}" 是保留属性名，不能赋值。`);
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
      // enforceActions 严格模式：state 修改必须在 action 内
      if (enforceActionsEnabled && insideActionCount === 0) {
        if (__DEV__) {
          throw new Error(
            `gfstate enforceActions: 不允许在 action 外直接修改状态 "${
              key as string
            }"，请将此操作封装在 action 函数中。`,
          );
        }
        return;
      }

      let newVal = typeof val === 'function' ? val(data[key]) : val;
      const oldVal = data[key];

      // intercept 变更拦截器：在写入前拦截，可修改值或取消更新
      const interceptFn = options?.intercept
        ? (options.intercept as any)[key as string]
        : undefined;
      if (typeof interceptFn === 'function') {
        const interceptResult = interceptFn(newVal, oldVal);
        if (interceptResult === false) return; // 拦截器取消本次更新
        newVal = interceptResult as V;
      }

      // 自定义相等函数（取代原始的 !==，支持 shallowEqual/deepEqual 等）
      const equalFn = getEqualityFn(options?.equals as any, key as string);
      if (!equalFn(oldVal, newVal)) {
        // onBeforeSet 钩子
        if (runBeforeSet) {
          const result = runBeforeSet(key as string, newVal, oldVal);
          if (result === false) return; // 插件取消了设置
          if (result && typeof result === 'object' && 'value' in result) {
            newVal = result.value as V;
            if (equalFn(oldVal, newVal)) return; // 替换后与旧值相同，跳过
          }
        }

        data[key] = newVal;
        run(() => state[key].triggerUpdate());
        notifyGlobalListeners(key, newVal, oldVal);

        // onAfterSet 钩子
        if (runAfterSet) {
          runAfterSet(key as string, newVal, oldVal);
        }
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
        const helper = uninitializedActions[key];
        uninitializedActionWrappers[key] = (...args: unknown[]) => {
          insideActionCount++;
          try {
            return helper.run(...args);
          } finally {
            insideActionCount--;
          }
        };
      }
      const wrapper = uninitializedActionWrappers[key];
      if (data[key] !== wrapper) {
        data[key] = wrapper as any;
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
    if (key === RESET || key === 'reset') return resetHandler;
    if (key === DESTROY || key === 'destroy') return destroyHandler;
    if (key === SNAPSHOT || key === 'snapshot') return snapshotHandler;
    if (key in gfStates) {
      if (destroyed) {
        if (__DEV__) {
          console.warn(
            `gfstate: store 已被销毁，不应再读取属性 "${key as string}"。`,
          );
        }
      }
      return gfStates[key];
    }
    if (key in actions) {
      if (destroyed) {
        if (__DEV__) {
          console.warn(
            `gfstate: store 已被销毁，不应再读取属性 "${key as string}"。`,
          );
        }
      }
      return actionWrappers[key];
    }

    // 计算属性
    if ((key as string) in computeds) {
      const computed = computeds[key as string];
      const value = useStoreValue(computed, () => computed.cachedValue);
      if (destroyed) {
        if (__DEV__) {
          console.warn(
            `gfstate: store 已被销毁，不应再读取属性 "${key as string}"。`,
          );
        }
      }
      return value;
    }

    // state
    if (key in state) {
      const value = useStoreValue(state[key], () => data[key]);
      if (destroyed) {
        if (__DEV__) {
          console.warn(
            `gfstate: store 已被销毁，不应再读取属性 "${key as string}"。`,
          );
        }
      }
      return value;
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

      // 嵌套路径（如 'user.profile.name'）：通过全局监听器过滤精确路径
      if ((key as string).includes('.')) {
        const wrapper: SubscribeCallback = (k, nv, ov) => {
          if (k === key) {
            try {
              watchFn(nv, ov, instance);
            } catch (e) {
              console.error(
                `gfstate watch: 嵌套路径 "${key}" 的监听回调执行出错:`,
                e,
              );
            }
          }
        };
        globalListeners.add(wrapper);
        cleanupFns.push(() => globalListeners.delete(wrapper));
        return;
      }

      if (key in state) {
        let oldValue = data[key as K];
        const unsub = state[key as K].subscribe(() => {
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
        cleanupFns.push(unsub);
      } else if (key in computeds) {
        // 监听计算属性变更
        let oldValue = computeds[key].cachedValue;
        const unsub = computeds[key].subscribe(() => {
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
        cleanupFns.push(unsub);
      } else if (key in gfStates) {
        // 监听嵌套子 store 的任意属性变更
        const childSubscribe = (gfStates[key] as any)[SUBSCRIBE];
        if (typeof childSubscribe === 'function') {
          const unsub = childSubscribe(
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
          if (typeof unsub === 'function') {
            cleanupFns.push(unsub);
          }
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

  // 创建插件上下文并初始化钩子运行器
  const pluginContext: PluginContext = {
    store: instance,
    storeName: options?.storeName || 'anonymous',
    getSnapshot: snapshotHandler,
    getInitialData: () => deepClone(initialSnapshot),
  };

  if (mergedPlugins.length > 0) {
    runBeforeSet = createBeforeSetRunner(mergedPlugins, pluginContext);
    runAfterSet = createAfterSetRunner(mergedPlugins, pluginContext);
    runOnSubscribe = createSubscribeRunner(mergedPlugins, pluginContext);

    // 执行插件 onInit 钩子
    mergedPlugins.forEach((plugin) => {
      if (plugin.onInit) {
        try {
          const cleanup = plugin.onInit(pluginContext);
          if (typeof cleanup === 'function') {
            pluginCleanups.push(cleanup);
          }
        } catch (e) {
          if (__DEV__) {
            console.error(`gfstate 插件 "${plugin.name}" onInit 执行出错:`, e);
          }
        }
      }
    });
  }

  processingObjects.delete(data);
  processingObjects.delete(rawData);

  return instance;
};

gfstate.config = ({
  batch,
  enforceActions,
}: {
  batch?: typeof run;
  enforceActions?: boolean;
}) => {
  if (batch !== undefined) run = batch;
  if (enforceActions !== undefined) enforceActionsEnabled = enforceActions;
};

// 注册全局插件
gfstate.use = (plugin: GfstatePlugin) => {
  registerGlobalPlugin(plugin);
};

// 清除所有全局插件（用于测试）
gfstate.clearPlugins = () => {
  clearGlobalPlugins();
};

export default gfstate;
