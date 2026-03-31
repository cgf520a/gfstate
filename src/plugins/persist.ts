import type { GfstatePlugin } from '../GfState/plugins';

export interface StorageAdapter {
  getItem: (key: string) => string | null | Promise<string | null>;
  setItem: (key: string, value: string) => void | Promise<void>;
  removeItem: (key: string) => void | Promise<void>;
}

export interface PersistOptions {
  /** 存储 key（必填） */
  key: string;
  /** 存储适配器，默认 localStorage */
  storage?: StorageAdapter;
  /** 白名单：只持久化这些 key */
  include?: string[];
  /** 黑名单：排除这些 key */
  exclude?: string[];
  /** 状态版本号，默认 0 */
  version?: number;
  /** 状态迁移函数 */
  migrate?: (
    oldState: Record<string, unknown>,
    version: number,
  ) => Record<string, unknown>;
  /** 序列化函数，默认 JSON.stringify */
  serialize?: (data: any) => string;
  /** 反序列化函数，默认 JSON.parse */
  deserialize?: (str: string) => any;
  /** 写入防抖时间（ms），默认 100 */
  debounce?: number;
  /** rehydration 完成回调 */
  onRehydrated?: (state: Record<string, unknown>) => void;
}

const filterKeys = (
  state: Record<string, unknown>,
  include?: string[],
  exclude?: string[],
): Record<string, unknown> => {
  let keys = Object.keys(state);
  if (include) {
    keys = keys.filter((k) => include.includes(k));
  }
  if (exclude) {
    keys = keys.filter((k) => !exclude.includes(k));
  }
  const result: Record<string, unknown> = {};
  keys.forEach((k) => {
    result[k] = state[k];
  });
  return result;
};

const createLocalStorageAdapter = (): StorageAdapter => {
  return {
    getItem: (key: string) => {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    setItem: (key: string, value: string) => {
      try {
        localStorage.setItem(key, value);
      } catch {
        // 存储满等异常静默处理
      }
    },
    removeItem: (key: string) => {
      try {
        localStorage.removeItem(key);
      } catch {
        // 静默处理
      }
    },
  };
};

export const persist = (options: PersistOptions): GfstatePlugin => {
  const {
    key,
    storage = createLocalStorageAdapter(),
    include,
    exclude,
    version = 0,
    migrate,
    serialize = JSON.stringify,
    deserialize = JSON.parse,
    debounce: debounceMs = 100,
    onRehydrated,
  } = options;

  return {
    name: 'gfstate:persist',

    onInit(context) {
      // rehydration（支持同步和异步 storage）
      const doRehydrate = (raw: string) => {
        let parsed: { version?: number; state: Record<string, unknown> };
        try {
          parsed = deserialize(raw);
        } catch {
          if (process.env.NODE_ENV !== 'production') {
            console.warn(`gfstate persist: 反序列化失败，key="${key}"`);
          }
          return;
        }

        let state = parsed.state;
        if (!state || typeof state !== 'object') return;

        // 版本迁移
        if (migrate && (parsed.version ?? 0) !== version) {
          state = migrate(state, parsed.version ?? 0);
        }

        // 应用过滤
        const filteredState = filterKeys(state, include, exclude);

        // 写入 store
        context.store(filteredState);
        onRehydrated?.(filteredState);
      };

      try {
        const result = storage.getItem(key);
        if (result !== null && typeof (result as any)?.then === 'function') {
          // 异步 storage
          (result as Promise<string | null>).then((raw) => {
            if (raw !== null) doRehydrate(raw);
          }).catch((e) => {
            if (process.env.NODE_ENV !== 'production') {
              console.error('gfstate persist: rehydration 出错:', e);
            }
          });
        } else if (result !== null) {
          // 同步 storage
          doRehydrate(result as string);
        }
      } catch (e) {
        if (process.env.NODE_ENV !== 'production') {
          console.error('gfstate persist: rehydration 出错:', e);
        }
      }

      // 订阅变更，防抖写入存储
      let timer: ReturnType<typeof setTimeout> | null = null;

      const doPersist = () => {
        const snapshot = context.getSnapshot();
        const filtered = filterKeys(snapshot, include, exclude);
        const serialized = serialize({ version, state: filtered });
        storage.setItem(key, serialized);
      };

      const debouncedPersist = () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(doPersist, debounceMs);
      };

      const unsub = context.store.subscribe(() => {
        debouncedPersist();
      });

      return () => {
        unsub();
        if (timer) clearTimeout(timer);
      };
    },

    onDestroy(context) {
      // 销毁前最后一次同步持久化
      const snapshot = context.getSnapshot();
      const filtered = filterKeys(snapshot, include, exclude);
      const serialized = serialize({ version, state: filtered });
      storage.setItem(key, serialized);
    },
  };
};
