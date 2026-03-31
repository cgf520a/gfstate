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
