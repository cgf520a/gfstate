import gfstate from '../GfState/index';
import { logger } from './logger';

afterEach(() => {
  gfstate.clearPlugins();
  jest.restoreAllMocks();
});

describe('logger 插件', () => {
  it('状态变更时输出日志', () => {
    const groupCollapsed = jest
      .spyOn(console, 'groupCollapsed')
      .mockImplementation();
    const log = jest.spyOn(console, 'log').mockImplementation();
    const groupEnd = jest.spyOn(console, 'groupEnd').mockImplementation();

    const store = gfstate(
      { count: 0 },
      { plugins: [logger()], storeName: 'test' },
    );

    store.count = 5;

    expect(groupCollapsed).toHaveBeenCalledTimes(1);
    expect(groupCollapsed.mock.calls[0][0]).toContain('[gfstate:test]');
    expect(groupCollapsed.mock.calls[0][0]).toContain('count');
    expect(log).toHaveBeenCalledWith('旧值:', 0);
    expect(log).toHaveBeenCalledWith('新值:', 5);
    expect(groupEnd).toHaveBeenCalledTimes(1);
  });

  it('collapsed 为 false 时使用 console.group', () => {
    const group = jest.spyOn(console, 'group').mockImplementation();
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'groupEnd').mockImplementation();

    const store = gfstate(
      { count: 0 },
      { plugins: [logger({ collapsed: false })] },
    );

    store.count = 1;
    expect(group).toHaveBeenCalledTimes(1);
  });

  it('include 只记录匹配的 key', () => {
    const groupCollapsed = jest
      .spyOn(console, 'groupCollapsed')
      .mockImplementation();
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'groupEnd').mockImplementation();

    const store = gfstate(
      { count: 0, name: 'test' },
      { plugins: [logger({ include: ['name'] })] },
    );

    store.count = 1;
    expect(groupCollapsed).not.toHaveBeenCalled();

    store.name = 'changed';
    expect(groupCollapsed).toHaveBeenCalledTimes(1);
  });

  it('exclude 排除匹配的 key', () => {
    const groupCollapsed = jest
      .spyOn(console, 'groupCollapsed')
      .mockImplementation();
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'groupEnd').mockImplementation();

    const store = gfstate(
      { count: 0, name: 'test' },
      { plugins: [logger({ exclude: ['count'] })] },
    );

    store.count = 1;
    expect(groupCollapsed).not.toHaveBeenCalled();

    store.name = 'changed';
    expect(groupCollapsed).toHaveBeenCalledTimes(1);
  });

  it('自定义 logger 对象', () => {
    const customLogger = {
      log: jest.fn(),
      group: jest.fn(),
      groupCollapsed: jest.fn(),
      groupEnd: jest.fn(),
    };

    const store = gfstate(
      { count: 0 },
      { plugins: [logger({ logger: customLogger })] },
    );

    store.count = 1;
    expect(customLogger.groupCollapsed).toHaveBeenCalledTimes(1);
    expect(customLogger.log).toHaveBeenCalledWith('旧值:', 0);
    expect(customLogger.log).toHaveBeenCalledWith('新值:', 1);
  });

  it('enabled 为 false 不输出', () => {
    const groupCollapsed = jest
      .spyOn(console, 'groupCollapsed')
      .mockImplementation();

    const store = gfstate(
      { count: 0 },
      { plugins: [logger({ enabled: false })] },
    );

    store.count = 1;
    expect(groupCollapsed).not.toHaveBeenCalled();
  });

  it('自定义 formatter', () => {
    const log = jest.spyOn(console, 'log').mockImplementation();
    const formatter = jest.fn(
      (key, newVal, oldVal) => `${key}: ${oldVal} → ${newVal}`,
    );

    const store = gfstate({ count: 0 }, { plugins: [logger({ formatter })] });

    store.count = 5;
    expect(formatter).toHaveBeenCalledWith('count', 5, 0);
    expect(log).toHaveBeenCalledWith('count: 0 → 5');
  });

  it('timestamp 为 false 不包含时间', () => {
    const groupCollapsed = jest
      .spyOn(console, 'groupCollapsed')
      .mockImplementation();
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'groupEnd').mockImplementation();

    const store = gfstate(
      { count: 0 },
      { plugins: [logger({ timestamp: false })] },
    );

    store.count = 1;
    const label = groupCollapsed.mock.calls[0][0] as string;
    // 没有时间戳，label 应该是 "[gfstate] count"
    expect(label).toBe('[gfstate] count');
  });

  it('嵌套 key 正确记录', () => {
    const groupCollapsed = jest
      .spyOn(console, 'groupCollapsed')
      .mockImplementation();
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'groupEnd').mockImplementation();

    const store = gfstate(
      { nested: { x: 1 } },
      { plugins: [logger({ timestamp: false })] },
    );

    (store as any).nested.x = 2;

    expect(groupCollapsed).toHaveBeenCalledTimes(1);
    expect(groupCollapsed.mock.calls[0][0]).toContain('nested.x');
  });

  it('销毁后不再记录', () => {
    const groupCollapsed = jest
      .spyOn(console, 'groupCollapsed')
      .mockImplementation();
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'groupEnd').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();

    const store = gfstate({ count: 0 }, { plugins: [logger()] });

    store.destroy();
    groupCollapsed.mockClear();

    // destroy 后写入会被警告但不会触发 logger
    store.count = 1;
    expect(groupCollapsed).not.toHaveBeenCalled();
  });
});
