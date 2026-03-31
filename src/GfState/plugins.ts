// 插件系统类型定义和全局注册表

const __DEV__ = process.env.NODE_ENV !== 'production';

// onBeforeSet 返回类型
export type OnBeforeSetResult =
  | void // 不干预，保持原值
  | { value: unknown } // 替换要设置的值
  | false; // 取消本次设置操作

// 插件上下文
export interface PluginContext {
  /** Store 实例 */
  store: any;
  /** Store 名称，用于日志和 DevTools 标识 */
  storeName: string;
  /** 获取当前状态快照（深拷贝） */
  getSnapshot: () => Record<string, unknown>;
  /** 获取初始数据（深拷贝） */
  getInitialData: () => Record<string, unknown>;
}

// 核心插件接口
export interface GfstatePlugin {
  /** 插件名称（唯一标识，用于去重和调试） */
  name: string;

  /** Store 初始化完成后调用（在 created 生命周期之后）
   *  可返回清理函数，在 destroy 时自动调用 */
  onInit?: (context: PluginContext) => void | (() => void);

  /** 值被设置前调用（仅 state 类型的 key 触发）
   *  返回 void: 不干预
   *  返回 { value: X }: 用 X 替换要设置的值
   *  返回 false: 取消本次设置 */
  onBeforeSet?: (
    key: string,
    newVal: unknown,
    oldVal: unknown,
    context: PluginContext,
  ) => OnBeforeSetResult;

  /** 值被设置后调用（已完成 triggerUpdate 和 notifyGlobalListeners） */
  onAfterSet?: (
    key: string,
    newVal: unknown,
    oldVal: unknown,
    context: PluginContext,
  ) => void;

  /** 订阅被添加时调用（通过 store.subscribe） */
  onSubscribe?: (
    key: string | null, // null 表示全局订阅
    context: PluginContext,
  ) => void;

  /** Store 被销毁时调用（在清理订阅之前） */
  onDestroy?: (context: PluginContext) => void;
}

// 模块级全局插件注册表
const globalPlugins: GfstatePlugin[] = [];

// 注册全局插件
export const registerGlobalPlugin = (plugin: GfstatePlugin): void => {
  if (__DEV__) {
    if (!plugin.name) {
      throw new Error('gfstate 插件必须提供 name 属性');
    }
  }
  if (globalPlugins.some((p) => p.name === plugin.name)) {
    if (__DEV__) {
      console.warn(`gfstate: 插件 "${plugin.name}" 已注册，跳过重复注册。`);
    }
    return;
  }
  globalPlugins.push(plugin);
};

// 获取全局插件副本
export const getGlobalPlugins = (): GfstatePlugin[] => {
  return [...globalPlugins];
};

// 清除所有全局插件（主要用于测试）
export const clearGlobalPlugins = (): void => {
  globalPlugins.length = 0;
};

// 创建 onBeforeSet 运行器（预过滤）
export const createBeforeSetRunner = (
  plugins: GfstatePlugin[],
  context: PluginContext,
) => {
  const setPlugins = plugins.filter((p) => p.onBeforeSet);
  if (setPlugins.length === 0) return null;

  return (key: string, newVal: unknown, oldVal: unknown): OnBeforeSetResult => {
    let currentVal = newVal;
    for (const plugin of setPlugins) {
      try {
        const result = plugin.onBeforeSet!(key, currentVal, oldVal, context);
        if (result === false) return false;
        if (result && typeof result === 'object' && 'value' in result) {
          currentVal = result.value;
        }
      } catch (e) {
        if (__DEV__) {
          console.error(
            `gfstate 插件 "${plugin.name}" onBeforeSet 执行出错:`,
            e,
          );
        }
      }
    }
    return currentVal !== newVal ? { value: currentVal } : undefined;
  };
};

// 创建 onAfterSet 运行器（预过滤）
export const createAfterSetRunner = (
  plugins: GfstatePlugin[],
  context: PluginContext,
) => {
  const setPlugins = plugins.filter((p) => p.onAfterSet);
  if (setPlugins.length === 0) return null;

  return (key: string, newVal: unknown, oldVal: unknown): void => {
    for (const plugin of setPlugins) {
      try {
        plugin.onAfterSet!(key, newVal, oldVal, context);
      } catch (e) {
        if (__DEV__) {
          console.error(
            `gfstate 插件 "${plugin.name}" onAfterSet 执行出错:`,
            e,
          );
        }
      }
    }
  };
};

// 创建 onSubscribe 运行器（预过滤）
export const createSubscribeRunner = (
  plugins: GfstatePlugin[],
  context: PluginContext,
) => {
  const subPlugins = plugins.filter((p) => p.onSubscribe);
  if (subPlugins.length === 0) return null;

  return (key: string | null): void => {
    for (const plugin of subPlugins) {
      try {
        plugin.onSubscribe!(key, context);
      } catch (e) {
        if (__DEV__) {
          console.error(
            `gfstate 插件 "${plugin.name}" onSubscribe 执行出错:`,
            e,
          );
        }
      }
    }
  };
};
