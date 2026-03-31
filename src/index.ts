export {
  default as gfstate,
  isGfstateStore,
  syncWrapper,
  shallowEqual,
  deepEqual,
  type Store,
  type TransformData,
  type StoreWithComputed,
  type Options,
  type EqualityFn,
  EMPTY_ARRAY,
  IS_GFSTATE_STORE,
  RESET,
  DESTROY,
  SNAPSHOT,
} from './GfState';
export { default as useStore, type StoreWithStateAndProps } from './useStore';

// 插件系统类型
export type { GfstatePlugin, PluginContext } from './GfState/plugins';

// 内置插件
export {
  logger,
  persist,
  devtools,
  type LoggerOptions,
  type PersistOptions,
  type StorageAdapter,
  type DevToolsOptions,
} from './plugins';
