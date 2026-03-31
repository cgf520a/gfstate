import type { GfstatePlugin } from '../GfState/plugins';

export interface LoggerOptions {
  /** 只记录这些 key 的变更 */
  include?: string[];
  /** 排除这些 key */
  exclude?: string[];
  /** 是否使用 collapsed group，默认 true */
  collapsed?: boolean;
  /** 自定义 logger 对象 */
  logger?: {
    log: (...args: any[]) => void;
    group: (...args: any[]) => void;
    groupCollapsed: (...args: any[]) => void;
    groupEnd: () => void;
  };
  /** 是否启用，默认 true */
  enabled?: boolean;
  /** 自定义格式化函数 */
  formatter?: (key: string, newVal: unknown, oldVal: unknown) => string;
  /** 是否包含时间戳，默认 true */
  timestamp?: boolean;
}

const matchKey = (key: string, patterns: string[]): boolean => {
  return patterns.some((p) => key === p || key.startsWith(p + '.'));
};

export const logger = (options: LoggerOptions = {}): GfstatePlugin => {
  return {
    name: 'gfstate:logger',

    onInit(context) {
      const {
        include,
        exclude,
        collapsed = true,
        logger: customLogger = console,
        enabled = true,
        formatter,
        timestamp = true,
      } = options;

      if (!enabled) return;

      const unsub = context.store.subscribe(
        (key: string, newVal: unknown, oldVal: unknown) => {
          if (include && !matchKey(key, include)) return;
          if (exclude && matchKey(key, exclude)) return;

          const time = timestamp ? new Date().toLocaleTimeString() : '';
          const storeName =
            context.storeName !== 'anonymous' ? ':' + context.storeName : '';
          const label = `[gfstate${storeName}]${time ? ' ' + time : ''} ${key}`;

          if (formatter) {
            customLogger.log(formatter(key, newVal, oldVal));
            return;
          }

          const groupFn = collapsed
            ? customLogger.groupCollapsed
            : customLogger.group;

          groupFn.call(customLogger, label);
          customLogger.log('旧值:', oldVal);
          customLogger.log('新值:', newVal);
          customLogger.groupEnd.call(customLogger);
        },
      );

      return unsub;
    },
  };
};
