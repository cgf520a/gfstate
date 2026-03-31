import type { GfstatePlugin } from '../GfState/plugins';

const __DEV__ = process.env.NODE_ENV !== 'production';

export interface DevToolsOptions {
  /** DevTools 中显示的 store 名称 */
  name?: string;
  /** 是否启用，默认 __DEV__ */
  enabled?: boolean;
  /** 最大记录数，默认 50 */
  maxAge?: number;
  /** 自定义 action 类型格式化 */
  actionFormatter?: (key: string) => string;
}

// Redux DevTools Extension 接口
interface DevToolsInstance {
  init: (state: any) => void;
  send: (action: any, state: any) => void;
  subscribe: (
    listener: (message: {
      type: string;
      state?: string;
      payload?: any;
    }) => void,
  ) => (() => void) | void;
  disconnect: () => void;
}

interface DevToolsExtension {
  connect: (options: { name: string; maxAge?: number }) => DevToolsInstance;
}

export const devtools = (options: DevToolsOptions = {}): GfstatePlugin => {
  return {
    name: 'gfstate:devtools',

    onInit(context) {
      const { name, enabled = __DEV__, maxAge = 50, actionFormatter } = options;

      if (!enabled) return;

      // 检测 Redux DevTools Extension
      const devToolsExtension: DevToolsExtension | undefined =
        typeof window !== 'undefined'
          ? (window as any).__REDUX_DEVTOOLS_EXTENSION__
          : undefined;

      if (!devToolsExtension) {
        if (__DEV__) {
          console.warn('gfstate devtools: 未检测到 Redux DevTools Extension。');
        }
        return;
      }

      const storeName = name || context.storeName;
      const devTools = devToolsExtension.connect({
        name: `gfstate:${storeName}`,
        maxAge,
      });

      // 初始化状态
      devTools.init(context.getSnapshot());

      // 订阅变更并上报
      const unsub = context.store.subscribe(
        (key: string, newVal: unknown, oldVal: unknown) => {
          const actionType = actionFormatter
            ? actionFormatter(key)
            : `SET ${key}`;

          devTools.send(
            { type: actionType, key, newVal, oldVal },
            context.getSnapshot(),
          );
        },
      );

      // 监听时间旅行
      const unsubDevTools = devTools.subscribe(
        (message: { type: string; state?: string; payload?: any }) => {
          if (
            message.type === 'DISPATCH' &&
            message.payload?.type === 'JUMP_TO_STATE'
          ) {
            if (message.state) {
              try {
                const targetState = JSON.parse(message.state);
                context.store(targetState);
              } catch (e) {
                if (__DEV__) {
                  console.error('gfstate devtools: 时间旅行状态解析失败:', e);
                }
              }
            }
          }
        },
      );

      return () => {
        unsub();
        if (typeof unsubDevTools === 'function') {
          unsubDevTools();
        }
        devTools.disconnect();
      };
    },
  };
};
