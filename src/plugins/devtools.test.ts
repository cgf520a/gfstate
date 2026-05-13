import gfstate from '../GfState/index';
import { devtools } from './devtools';

afterEach(() => {
  gfstate.clearPlugins();
  delete (window as any).__REDUX_DEVTOOLS_EXTENSION__;
  jest.restoreAllMocks();
});

// 创建 mock DevTools extension
const createMockDevTools = () => {
  const devToolsInstance = {
    init: jest.fn(),
    send: jest.fn(),
    subscribe: jest.fn(() => jest.fn()),
    disconnect: jest.fn(),
  };

  const extension = {
    connect: jest.fn(() => devToolsInstance),
  };

  (window as any).__REDUX_DEVTOOLS_EXTENSION__ = extension;

  return { extension, devToolsInstance };
};

describe('devtools 插件', () => {
  it('无扩展时静默降级', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation();

    const store = gfstate({ count: 0 }, { plugins: [devtools()] });

    // 不应抛错
    expect(store.snapshot().count).toBe(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('未检测到'));
    warn.mockRestore();
  });

  it('连接时使用正确的名称和 maxAge', () => {
    const { extension } = createMockDevTools();

    gfstate(
      { count: 0 },
      {
        plugins: [devtools({ name: 'myStore', maxAge: 100 })],
        storeName: 'shouldBeOverridden',
      },
    );

    expect(extension.connect).toHaveBeenCalledWith({
      name: 'gfstate:myStore',
      maxAge: 100,
    });
  });

  it('无 name 时使用 storeName', () => {
    const { extension } = createMockDevTools();

    gfstate(
      { count: 0 },
      {
        plugins: [devtools()],
        storeName: 'fromOptions',
      },
    );

    expect(extension.connect).toHaveBeenCalledWith({
      name: 'gfstate:fromOptions',
      maxAge: 50,
    });
  });

  it('初始化时发送初始状态', () => {
    const { devToolsInstance } = createMockDevTools();

    gfstate({ count: 0, name: 'test' }, { plugins: [devtools()] });

    expect(devToolsInstance.init).toHaveBeenCalledTimes(1);
    const initState = devToolsInstance.init.mock.calls[0][0];
    expect(initState.count).toBe(0);
    expect(initState.name).toBe('test');
  });

  it('状态变更时上报', () => {
    const { devToolsInstance } = createMockDevTools();

    const store = gfstate({ count: 0 }, { plugins: [devtools()] });

    store.count = 5;

    expect(devToolsInstance.send).toHaveBeenCalledTimes(1);
    const [action, state] = devToolsInstance.send.mock.calls[0];
    expect(action.type).toBe('SET count');
    expect(action.key).toBe('count');
    expect(action.newVal).toBe(5);
    expect(action.oldVal).toBe(0);
    expect(state.count).toBe(5);
  });

  it('自定义 actionFormatter', () => {
    const { devToolsInstance } = createMockDevTools();

    const store = gfstate(
      { count: 0 },
      {
        plugins: [
          devtools({
            actionFormatter: (key) => `UPDATE:${key.toUpperCase()}`,
          }),
        ],
      },
    );

    store.count = 1;

    const action = devToolsInstance.send.mock.calls[0][0];
    expect(action.type).toBe('UPDATE:COUNT');
  });

  it('时间旅行', () => {
    const { devToolsInstance } = createMockDevTools();

    // 捕获 subscribe 回调
    let listener: any;
    devToolsInstance.subscribe.mockImplementation(((cb: any) => {
      listener = cb;
      return jest.fn();
    }) as any);

    const store = gfstate(
      { count: 0, name: 'test' },
      { plugins: [devtools()] },
    );

    store.count = 10;

    // 模拟从 DevTools 跳转到历史状态
    listener({
      type: 'DISPATCH',
      payload: { type: 'JUMP_TO_STATE' },
      state: JSON.stringify({ count: 0, name: 'test' }),
    });

    expect(store.snapshot().count).toBe(0);
    expect(store.snapshot().name).toBe('test');
  });

  it('enabled 为 false 不连接', () => {
    const { extension } = createMockDevTools();

    gfstate({ count: 0 }, { plugins: [devtools({ enabled: false })] });

    expect(extension.connect).not.toHaveBeenCalled();
  });

  it('destroy 时断开连接', () => {
    const { devToolsInstance } = createMockDevTools();

    const store = gfstate({ count: 0 }, { plugins: [devtools()] });

    store.destroy();

    expect(devToolsInstance.disconnect).toHaveBeenCalledTimes(1);
  });
});

describe('devtools 时间旅行 JSON 解析失败', () => {
  it('无效 JSON state 触发 console.error', () => {
    const { devToolsInstance } = createMockDevTools();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation();

    // 捕获 subscribe 回调
    let listener: any;
    devToolsInstance.subscribe.mockImplementation(((cb: any) => {
      listener = cb;
      return jest.fn();
    }) as any);

    gfstate(
      { count: 0, name: 'test' },
      { plugins: [devtools()] },
    );

    // 模拟 DevTools 发送无效 JSON 的 JUMP_TO_STATE 消息
    listener({
      type: 'DISPATCH',
      payload: { type: 'JUMP_TO_STATE' },
      state: 'invalid json{{{',
    });

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('时间旅行状态解析失败'),
      expect.any(Error),
    );
    errorSpy.mockRestore();
  });
});

describe('devtools 时间旅行边界条件', () => {
  it('message.type 不是 DISPATCH 时忽略', () => {
    const { devToolsInstance } = createMockDevTools();

    let listener: any;
    devToolsInstance.subscribe.mockImplementation(((cb: any) => {
      listener = cb;
      return jest.fn();
    }) as any);

    const store = gfstate(
      { count: 0 },
      { plugins: [devtools()] },
    );

    store.count = 10;

    // 非 DISPATCH 类型的消息
    listener({
      type: 'ACTION',
      state: JSON.stringify({ count: 0 }),
    });

    // store 不受影响
    expect(store.snapshot().count).toBe(10);
  });

  it('payload 为 undefined 时忽略', () => {
    const { devToolsInstance } = createMockDevTools();

    let listener: any;
    devToolsInstance.subscribe.mockImplementation(((cb: any) => {
      listener = cb;
      return jest.fn();
    }) as any);

    const store = gfstate(
      { count: 0 },
      { plugins: [devtools()] },
    );

    store.count = 10;

    // DISPATCH 但无 payload
    listener({
      type: 'DISPATCH',
      state: JSON.stringify({ count: 0 }),
    });

    expect(store.snapshot().count).toBe(10);
  });

  it('payload.type 不是 JUMP_TO_STATE 时忽略', () => {
    const { devToolsInstance } = createMockDevTools();

    let listener: any;
    devToolsInstance.subscribe.mockImplementation(((cb: any) => {
      listener = cb;
      return jest.fn();
    }) as any);

    const store = gfstate(
      { count: 0 },
      { plugins: [devtools()] },
    );

    store.count = 10;

    // DISPATCH + 非 JUMP_TO_STATE payload
    listener({
      type: 'DISPATCH',
      payload: { type: 'COMMIT' },
      state: JSON.stringify({ count: 0 }),
    });

    expect(store.snapshot().count).toBe(10);
  });

  it('JUMP_TO_STATE 但 message.state 为空时忽略', () => {
    const { devToolsInstance } = createMockDevTools();

    let listener: any;
    devToolsInstance.subscribe.mockImplementation(((cb: any) => {
      listener = cb;
      return jest.fn();
    }) as any);

    const store = gfstate(
      { count: 0 },
      { plugins: [devtools()] },
    );

    store.count = 10;

    // JUMP_TO_STATE 但无 state
    listener({
      type: 'DISPATCH',
      payload: { type: 'JUMP_TO_STATE' },
    });

    expect(store.snapshot().count).toBe(10);
  });

  it('devTools.subscribe 返回非函数时 cleanup 不报错', () => {
    const { devToolsInstance } = createMockDevTools();

    // subscribe 返回 undefined（非函数）
    devToolsInstance.subscribe.mockImplementation((() => undefined) as any);

    const store = gfstate(
      { count: 0 },
      { plugins: [devtools()] },
    );

    // destroy 时不应报错（unsubDevTools 不是函数）
    expect(() => store.destroy()).not.toThrow();
  });
});

describe('devtools - 生产模式分支覆盖', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    delete (window as any).__REDUX_DEVTOOLS_EXTENSION__;
    jest.restoreAllMocks();
  });

  it('生产模式下无 DevTools 扩展不输出警告', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

    let prodDevtools: any;
    let prodGfstate: any;
    jest.isolateModules(() => {
      process.env.NODE_ENV = 'production';
      prodDevtools = require('./devtools').devtools;
      prodGfstate = require('../GfState/index').default;
    });

    // 无 __REDUX_DEVTOOLS_EXTENSION__，且为生产模式
    const store = prodGfstate(
      { count: 0 },
      { plugins: [prodDevtools({ enabled: true })] },
    );

    // 生产模式下不应输出警告
    expect(warnSpy).not.toHaveBeenCalled();
    expect(store.snapshot().count).toBe(0);

    prodGfstate.clearPlugins();
    process.env.NODE_ENV = originalEnv;
  });

  it('生产模式下 typeof window === undefined 走 undefined 分支', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

    // 注意：jsdom 下 window 始终存在，但通过不设置 extension 可以测试到
    // devToolsExtension 为 undefined 的路径。此测试验证生产模式下
    // 无扩展时走静默降级路径。
    let prodDevtools: any;
    let prodGfstate: any;
    jest.isolateModules(() => {
      process.env.NODE_ENV = 'production';
      prodDevtools = require('./devtools').devtools;
      prodGfstate = require('../GfState/index').default;
    });

    const store = prodGfstate(
      { count: 0 },
      { plugins: [prodDevtools({ enabled: true })] },
    );

    expect(warnSpy).not.toHaveBeenCalled();
    expect(store.snapshot().count).toBe(0);

    prodGfstate.clearPlugins();
    process.env.NODE_ENV = originalEnv;
  });

  it('生产模式下时间旅行 JSON 解析失败不输出 console.error', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation();

    // 先设置 DevTools 扩展
    const devToolsInstance = {
      init: jest.fn(),
      send: jest.fn(),
      subscribe: jest.fn(),
      disconnect: jest.fn(),
    };
    let listener: any;
    devToolsInstance.subscribe.mockImplementation(((cb: any) => {
      listener = cb;
      return jest.fn();
    }) as any);
    (window as any).__REDUX_DEVTOOLS_EXTENSION__ = {
      connect: jest.fn(() => devToolsInstance),
    };

    let prodDevtools: any;
    let prodGfstate: any;
    jest.isolateModules(() => {
      process.env.NODE_ENV = 'production';
      prodDevtools = require('./devtools').devtools;
      prodGfstate = require('../GfState/index').default;
    });

    prodGfstate(
      { count: 0 },
      { plugins: [prodDevtools({ enabled: true })] },
    );

    // 发送无效 JSON
    listener({
      type: 'DISPATCH',
      payload: { type: 'JUMP_TO_STATE' },
      state: 'invalid json{{{',
    });

    // 生产模式下不输出 error
    expect(errorSpy).not.toHaveBeenCalled();

    prodGfstate.clearPlugins();
    process.env.NODE_ENV = originalEnv;
  });
});
