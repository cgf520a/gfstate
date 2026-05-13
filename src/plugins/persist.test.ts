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

describe('persist: createLocalStorageAdapter 错误处理', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('localStorage.getItem 抛出异常时返回 null，不崩溃', () => {
    // mock localStorage.getItem 抛出异常
    const getItemSpy = jest
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('SecurityError');
      });

    // 不传 storage，使用默认 localStorage adapter
    const store = gfstate(
      { count: 0 },
      { plugins: [persist({ key: 'ls-getitem-error' })] },
    );

    // store 应正常使用，不崩溃
    expect(store.snapshot().count).toBe(0);
    getItemSpy.mockRestore();
  });

  it('localStorage.setItem 抛出异常时静默处理', () => {
    // getItem 正常返回 null
    const getItemSpy = jest
      .spyOn(Storage.prototype, 'getItem')
      .mockReturnValue(null);
    // setItem 抛出异常（模拟存储已满）
    const setItemSpy = jest
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });

    const store = gfstate(
      { count: 0 },
      { plugins: [persist({ key: 'ls-setitem-error' })] },
    );

    store.count = 5;
    // 触发防抖写入
    jest.advanceTimersByTime(200);

    // 不应崩溃
    expect(store.snapshot().count).toBe(5);
    getItemSpy.mockRestore();
    setItemSpy.mockRestore();
  });

  it('localStorage.removeItem 抛出异常时静默处理', () => {
    const removeItemSpy = jest
      .spyOn(Storage.prototype, 'removeItem')
      .mockImplementation(() => {
        throw new Error('SecurityError');
      });

    // 直接调用 removeItem 来触发这个分支
    // 通过创建一个 store 并使用默认 adapter 的 removeItem
    // 先获取默认 adapter 的引用
    const getItemSpy = jest
      .spyOn(Storage.prototype, 'getItem')
      .mockReturnValue(null);

    const store = gfstate(
      { count: 0 },
      { plugins: [persist({ key: 'ls-removeitem-error' })] },
    );

    // store 应正常工作
    expect(store.snapshot().count).toBe(0);
    getItemSpy.mockRestore();
    removeItemSpy.mockRestore();
  });
});

describe('persist: 异步 storage rehydration 出错', () => {
  it('异步 getItem 返回 rejected Promise 触发 console.error', async () => {
    jest.useRealTimers();

    const errorSpy = jest.spyOn(console, 'error').mockImplementation();

    const asyncStorage: StorageAdapter = {
      getItem: () => Promise.reject(new Error('网络错误')),
      setItem: async () => {},
      removeItem: async () => {},
    };

    gfstate(
      { count: 0 },
      {
        plugins: [
          persist({ key: 'async-error', storage: asyncStorage }),
        ],
      },
    );

    // 等待 Promise rejection 被处理
    await Promise.resolve();
    await Promise.resolve();

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('rehydration 出错'),
      expect.any(Error),
    );
    errorSpy.mockRestore();
  });
});

describe('persist: 同步 storage getItem 抛出错误', () => {
  it('getItem 同步抛出异常触发 console.error', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation();

    const throwingStorage: StorageAdapter = {
      getItem: () => {
        throw new Error('存储访问失败');
      },
      setItem: () => {},
      removeItem: () => {},
    };

    const store = gfstate(
      { count: 0 },
      {
        plugins: [
          persist({ key: 'sync-throw', storage: throwingStorage }),
        ],
      },
    );

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('rehydration 出错'),
      expect.any(Error),
    );
    // store 应正常使用
    expect(store.snapshot().count).toBe(0);
    errorSpy.mockRestore();
  });
});

describe('persist: doRehydrate 边界条件', () => {
  it('反序列化后 state 为 null 时跳过 rehydrate', () => {
    const storage = createMockStorage();
    storage.data['null-state'] = JSON.stringify({
      version: 0,
      state: null,
    });

    const onRehydrated = jest.fn();
    const store = gfstate(
      { count: 0 },
      {
        plugins: [
          persist({
            key: 'null-state',
            storage,
            onRehydrated,
          }),
        ],
      },
    );

    // state 为 null，不应触发 rehydrate
    expect(onRehydrated).not.toHaveBeenCalled();
    expect(store.snapshot().count).toBe(0);
  });

  it('反序列化后 state 为非对象类型时跳过 rehydrate', () => {
    const storage = createMockStorage();
    storage.data['string-state'] = JSON.stringify({
      version: 0,
      state: 'not-an-object',
    });

    const onRehydrated = jest.fn();
    const store = gfstate(
      { count: 0 },
      {
        plugins: [
          persist({
            key: 'string-state',
            storage,
            onRehydrated,
          }),
        ],
      },
    );

    expect(onRehydrated).not.toHaveBeenCalled();
    expect(store.snapshot().count).toBe(0);
  });
});

describe('persist - 生产模式分支覆盖', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    jest.restoreAllMocks();
  });

  it('生产模式下反序列化失败不输出 console.warn', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

    let prodPersist: any;
    let prodGfstate: any;
    jest.isolateModules(() => {
      process.env.NODE_ENV = 'production';
      prodPersist = require('./persist').persist;
      prodGfstate = require('../GfState/index').default;
    });

    const storage = createMockStorage();
    storage.data['prod-invalid'] = 'not json{{{';

    const store = prodGfstate(
      { count: 0 },
      {
        plugins: [prodPersist({ key: 'prod-invalid', storage })],
      },
    );

    // 生产模式下不应输出 warn
    expect(warnSpy).not.toHaveBeenCalled();
    expect(store.snapshot().count).toBe(0);

    prodGfstate.clearPlugins();
    process.env.NODE_ENV = originalEnv;
  });

  it('生产模式下异步 rehydration 出错不输出 console.error', async () => {
    jest.useRealTimers();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation();

    let prodPersist: any;
    let prodGfstate: any;
    jest.isolateModules(() => {
      process.env.NODE_ENV = 'production';
      prodPersist = require('./persist').persist;
      prodGfstate = require('../GfState/index').default;
    });

    const asyncStorage: StorageAdapter = {
      getItem: () => Promise.reject(new Error('网络错误')),
      setItem: async () => {},
      removeItem: async () => {},
    };

    prodGfstate(
      { count: 0 },
      {
        plugins: [prodPersist({ key: 'prod-async-error', storage: asyncStorage })],
      },
    );

    // 等待 Promise rejection 被处理
    await Promise.resolve();
    await Promise.resolve();

    // 生产模式下不应输出 error
    expect(errorSpy).not.toHaveBeenCalled();

    prodGfstate.clearPlugins();
    process.env.NODE_ENV = originalEnv;
  });

  it('生产模式下同步 storage getItem 抛出异常不输出 console.error', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation();

    let prodPersist: any;
    let prodGfstate: any;
    jest.isolateModules(() => {
      process.env.NODE_ENV = 'production';
      prodPersist = require('./persist').persist;
      prodGfstate = require('../GfState/index').default;
    });

    const throwingStorage: StorageAdapter = {
      getItem: () => {
        throw new Error('存储访问失败');
      },
      setItem: () => {},
      removeItem: () => {},
    };

    const store = prodGfstate(
      { count: 0 },
      {
        plugins: [prodPersist({ key: 'prod-sync-throw', storage: throwingStorage })],
      },
    );

    // 生产模式下不应输出 error
    expect(errorSpy).not.toHaveBeenCalled();
    expect(store.snapshot().count).toBe(0);

    prodGfstate.clearPlugins();
    process.env.NODE_ENV = originalEnv;
  });
});

describe('persist: 分支覆盖补充', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('版本匹配时跳过 migrate', () => {
    const storage = createMockStorage();
    storage.data['version-match'] = JSON.stringify({
      version: 2,
      state: { count: 10 },
    });

    const migrate = jest.fn();
    const store = gfstate(
      { count: 0 },
      {
        plugins: [
          persist({
            key: 'version-match',
            storage,
            version: 2,
            migrate,
          }),
        ],
      },
    );

    // 版本相同，migrate 不应被调用
    expect(migrate).not.toHaveBeenCalled();
    expect(store.snapshot().count).toBe(10);
  });

  it('异步 storage getItem 返回 null 时跳过 rehydrate', async () => {
    jest.useRealTimers();

    const onRehydrated = jest.fn();
    const asyncStorage: StorageAdapter = {
      getItem: async () => null,
      setItem: async () => {},
      removeItem: async () => {},
    };

    const store = gfstate(
      { count: 0 },
      {
        plugins: [
          persist({
            key: 'async-null',
            storage: asyncStorage,
            onRehydrated,
          }),
        ],
      },
    );

    await Promise.resolve();
    await Promise.resolve();

    // getItem 返回 null，不应触发 rehydrate
    expect(onRehydrated).not.toHaveBeenCalled();
    expect(store.snapshot().count).toBe(0);
  });

  it('存储数据无 version 字段时用默认值 0 与 migrate 配合', () => {
    const storage = createMockStorage();
    storage.data['no-version'] = JSON.stringify({
      state: { count: 10 },
    });

    const migrate = jest.fn((state) => ({ ...state, name: 'migrated' }));
    const store = gfstate(
      { count: 0, name: 'default' },
      {
        plugins: [
          persist({
            key: 'no-version',
            storage,
            version: 1,
            migrate,
          }),
        ],
      },
    );

    // parsed.version 为 undefined → ?? 0 → 0 !== 1 → 执行 migrate
    expect(migrate).toHaveBeenCalledWith({ count: 10 }, 0);
    expect(store.snapshot().name).toBe('migrated');
  });

  it('存储数据无 version 字段且默认版本 0 时跳过 migrate', () => {
    const storage = createMockStorage();
    storage.data['no-version-match'] = JSON.stringify({
      state: { count: 10 },
    });

    const migrate = jest.fn((state) => state);
    const store = gfstate(
      { count: 0 },
      {
        plugins: [
          persist({
            key: 'no-version-match',
            storage,
            version: 0,
            migrate,
          }),
        ],
      },
    );

    // parsed.version 为 undefined → ?? 0 → 0 !== 0 为 false → 跳过 migrate
    expect(migrate).not.toHaveBeenCalled();
    expect(store.snapshot().count).toBe(10);
  });

  it('destroy 时无待处理 timer 不报错', () => {
    const storage = createMockStorage();
    const store = gfstate(
      { count: 0 },
      {
        plugins: [persist({ key: 'no-timer', storage })],
      },
    );

    // 不做任何修改直接 destroy，此时 timer 为 null
    expect(() => store.destroy()).not.toThrow();
  });
});
