import gfstate from '../GfState/index';
import { persist, StorageAdapter } from './persist';

afterEach(() => {
  gfstate.clearPlugins();
  jest.restoreAllMocks();
});

// Mock storage adapter（同步）
const createMockStorage = (): StorageAdapter & {
  data: Record<string, string>;
} => {
  const data: Record<string, string> = {};
  return {
    data,
    getItem: (key: string) => data[key] ?? null,
    setItem: (key: string, value: string) => {
      data[key] = value;
    },
    removeItem: (key: string) => {
      delete data[key];
    },
  };
};

describe('persist 插件', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('基本持久化：变更后写入存储', () => {
    const storage = createMockStorage();
    const store = gfstate(
      { count: 0, name: 'test' },
      { plugins: [persist({ key: 'test-store', storage })] },
    );

    store.count = 5;
    jest.advanceTimersByTime(200);

    const stored = JSON.parse(storage.data['test-store']);
    expect(stored.state.count).toBe(5);
    expect(stored.state.name).toBe('test');
    expect(stored.version).toBe(0);
  });

  it('rehydration：从存储恢复状态', () => {
    const storage = createMockStorage();
    storage.data['test-store'] = JSON.stringify({
      version: 0,
      state: { count: 42, name: 'saved' },
    });

    const store = gfstate(
      { count: 0, name: 'default' },
      { plugins: [persist({ key: 'test-store', storage })] },
    );

    // rehydrate 是同步执行的（同步 storage）
    expect(store.snapshot().count).toBe(42);
    expect(store.snapshot().name).toBe('saved');
  });

  it('include 白名单', () => {
    const storage = createMockStorage();
    const store = gfstate(
      { count: 0, name: 'test', secret: 'hidden' },
      {
        plugins: [
          persist({ key: 'whitelist', storage, include: ['count', 'name'] }),
        ],
      },
    );

    store.count = 5;
    store.secret = 'visible';
    jest.advanceTimersByTime(200);

    const stored = JSON.parse(storage.data['whitelist']);
    expect(stored.state.count).toBe(5);
    expect(stored.state.name).toBe('test');
    expect(stored.state.secret).toBeUndefined();
  });

  it('exclude 黑名单', () => {
    const storage = createMockStorage();
    const store = gfstate(
      { count: 0, name: 'test', secret: 'hidden' },
      {
        plugins: [persist({ key: 'blacklist', storage, exclude: ['secret'] })],
      },
    );

    store.count = 5;
    jest.advanceTimersByTime(200);

    const stored = JSON.parse(storage.data['blacklist']);
    expect(stored.state.count).toBe(5);
    expect(stored.state.secret).toBeUndefined();
  });

  it('版本迁移', () => {
    const storage = createMockStorage();
    storage.data['migrate-store'] = JSON.stringify({
      version: 1,
      state: { count: 10, oldField: 'legacy' },
    });

    const migrate = jest.fn((state, version) => {
      if (version === 1) {
        return { count: state.count, name: 'migrated' };
      }
      return state;
    });

    const store = gfstate(
      { count: 0, name: 'default' },
      {
        plugins: [
          persist({
            key: 'migrate-store',
            storage,
            version: 2,
            migrate,
          }),
        ],
      },
    );

    expect(migrate).toHaveBeenCalledWith({ count: 10, oldField: 'legacy' }, 1);
    expect(store.snapshot().count).toBe(10);
    expect(store.snapshot().name).toBe('migrated');
  });

  it('自定义序列化/反序列化', () => {
    const storage = createMockStorage();
    const serialize = jest.fn(JSON.stringify);
    const deserialize = jest.fn(JSON.parse);

    storage.data['custom-serde'] = JSON.stringify({
      version: 0,
      state: { count: 7 },
    });

    const store = gfstate(
      { count: 0 },
      {
        plugins: [
          persist({
            key: 'custom-serde',
            storage,
            serialize,
            deserialize,
          }),
        ],
      },
    );

    expect(deserialize).toHaveBeenCalled();

    store.count = 10;
    jest.advanceTimersByTime(200);
    expect(serialize).toHaveBeenCalled();
  });

  it('防抖合并写入', () => {
    const storage = createMockStorage();
    const store = gfstate(
      { count: 0 },
      {
        plugins: [persist({ key: 'debounce', storage, debounce: 100 })],
      },
    );

    store.count = 1;
    store.count = 2;
    store.count = 3;

    // 100ms 内只写一次
    jest.advanceTimersByTime(50);
    expect(storage.data['debounce']).toBeUndefined();

    jest.advanceTimersByTime(100);
    const stored = JSON.parse(storage.data['debounce']);
    expect(stored.state.count).toBe(3);
  });

  it('onRehydrated 回调', () => {
    const storage = createMockStorage();
    storage.data['rehydrated'] = JSON.stringify({
      version: 0,
      state: { count: 99 },
    });

    const onRehydrated = jest.fn();
    gfstate(
      { count: 0 },
      {
        plugins: [
          persist({
            key: 'rehydrated',
            storage,
            onRehydrated,
          }),
        ],
      },
    );

    expect(onRehydrated).toHaveBeenCalledWith({ count: 99 });
  });

  it('异步 storage adapter', async () => {
    // 异步测试需要真实计时器
    jest.useRealTimers();

    const data: Record<string, string> = {};
    const asyncStorage: StorageAdapter = {
      getItem: async (key) => data[key] ?? null,
      setItem: async (key, value) => {
        data[key] = value;
      },
      removeItem: async (key) => {
        delete data[key];
      },
    };

    data['async-store'] = JSON.stringify({
      version: 0,
      state: { count: 50 },
    });

    const onRehydrated = jest.fn();
    const store = gfstate(
      { count: 0 },
      {
        plugins: [
          persist({
            key: 'async-store',
            storage: asyncStorage,
            onRehydrated,
          }),
        ],
      },
    );

    // 等待微任务（Promise resolve）
    await Promise.resolve();
    await Promise.resolve();

    expect(onRehydrated).toHaveBeenCalledWith({ count: 50 });
    expect(store.snapshot().count).toBe(50);
  });

  it('反序列化失败时不崩溃', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation();
    const storage = createMockStorage();
    storage.data['invalid'] = 'not json at all{{{';

    const store = gfstate(
      { count: 0 },
      {
        plugins: [persist({ key: 'invalid', storage })],
      },
    );

    // store 应正常使用
    expect(store.snapshot().count).toBe(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('反序列化失败'));
    warn.mockRestore();
  });

  it('destroy 时执行最后一次持久化', () => {
    const storage = createMockStorage();
    const store = gfstate(
      { count: 0 },
      {
        plugins: [persist({ key: 'destroy-persist', storage })],
      },
    );

    store.count = 100;
    // 不等防抖，直接 destroy
    store.destroy();

    const stored = JSON.parse(storage.data['destroy-persist']);
    expect(stored.state.count).toBe(100);
  });

  it('include 在 rehydration 时也生效', () => {
    const storage = createMockStorage();
    storage.data['include-rehydrate'] = JSON.stringify({
      version: 0,
      state: { count: 10, name: 'saved', extra: 'should-not' },
    });

    const store = gfstate(
      { count: 0, name: 'default' },
      {
        plugins: [
          persist({
            key: 'include-rehydrate',
            storage,
            include: ['count'],
          }),
        ],
      },
    );

    expect(store.snapshot().count).toBe(10);
    // name 不在 include 中，不应被 rehydrate
    expect(store.snapshot().name).toBe('default');
  });
});
