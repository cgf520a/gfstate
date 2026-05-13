import React from 'react';
import { render, fireEvent, act } from '@testing-library/react';
import gfstate from './index';
import type { GfstatePlugin } from './plugins';

afterEach(() => {
  gfstate.clearPlugins();
});

describe('插件系统', () => {
  describe('全局插件注册', () => {
    it('gfstate.use 注册全局插件', () => {
      const onInit = jest.fn();
      gfstate.use({ name: 'test-plugin', onInit });

      const store = gfstate({ count: 0 });
      expect(onInit).toHaveBeenCalledTimes(1);
      const ctx = onInit.mock.calls[0][0];
      expect(ctx.store).toBe(store);
      expect(ctx.storeName).toBe('anonymous');
    });

    it('重复注册同名插件跳过', () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation();
      const onInit = jest.fn();
      gfstate.use({ name: 'dup', onInit });
      gfstate.use({ name: 'dup', onInit });

      gfstate({ count: 0 });
      expect(onInit).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('已注册'));
      warn.mockRestore();
    });

    it('clearPlugins 清除所有全局插件', () => {
      const onInit = jest.fn();
      gfstate.use({ name: 'to-clear', onInit });
      gfstate.clearPlugins();

      gfstate({ count: 0 });
      expect(onInit).not.toHaveBeenCalled();
    });
  });

  describe('per-store 插件', () => {
    it('options.plugins 仅影响当前 store', () => {
      const onInit = jest.fn();
      const plugin: GfstatePlugin = { name: 'local', onInit };

      const store1 = gfstate({ count: 0 }, { plugins: [plugin] });
      const store2 = gfstate({ count: 0 });

      expect(onInit).toHaveBeenCalledTimes(1);
      const ctx = onInit.mock.calls[0][0];
      expect(ctx.store).toBe(store1);
    });

    it('storeName 传递到上下文', () => {
      const onInit = jest.fn();
      gfstate(
        { count: 0 },
        {
          plugins: [{ name: 'named', onInit }],
          storeName: 'myStore',
        },
      );
      expect(onInit).toHaveBeenCalledWith(
        expect.objectContaining({ storeName: 'myStore' }),
      );
    });
  });

  describe('执行顺序', () => {
    it('全局插件先于 per-store 插件', () => {
      const order: string[] = [];
      gfstate.use({
        name: 'global',
        onInit: () => {
          order.push('global');
        },
      });

      gfstate(
        { count: 0 },
        {
          plugins: [
            {
              name: 'local',
              onInit: () => {
                order.push('local');
              },
            },
          ],
        },
      );

      expect(order).toEqual(['global', 'local']);
    });
  });

  describe('onInit', () => {
    it('返回清理函数在 destroy 时调用', () => {
      const cleanup = jest.fn();
      const store = gfstate(
        { count: 0 },
        {
          plugins: [
            {
              name: 'with-cleanup',
              onInit: () => cleanup,
            },
          ],
        },
      );

      expect(cleanup).not.toHaveBeenCalled();
      store.destroy();
      expect(cleanup).toHaveBeenCalledTimes(1);
    });

    it('onInit 出错时不阻塞 store 创建', () => {
      const error = jest.spyOn(console, 'error').mockImplementation();
      const store = gfstate(
        { count: 0 },
        {
          plugins: [
            {
              name: 'bad-init',
              onInit: () => {
                throw new Error('init failed');
              },
            },
          ],
        },
      );

      // store 应该正常创建
      expect(store.count).toBe(0);
      expect(error).toHaveBeenCalled();
      error.mockRestore();
    });

    it('PluginContext.getSnapshot 返回当前快照', () => {
      let ctx: any;
      const store = gfstate(
        { count: 0, name: 'test' },
        {
          plugins: [
            {
              name: 'snapshot-test',
              onInit: (context) => {
                ctx = context;
              },
            },
          ],
        },
      );

      const snap = ctx.getSnapshot();
      expect(snap).toEqual({ count: 0, name: 'test' });
    });

    it('PluginContext.getInitialData 返回初始数据', () => {
      let ctx: any;
      const store = gfstate(
        { count: 0 },
        {
          plugins: [
            {
              name: 'initial-test',
              onInit: (context) => {
                ctx = context;
              },
            },
          ],
        },
      );

      // 修改 store 后，getInitialData 仍返回初始值
      store.count = 10;
      expect(ctx.getInitialData()).toEqual({ count: 0 });
    });
  });

  describe('onBeforeSet', () => {
    it('返回 false 取消设置', () => {
      const store = gfstate(
        { count: 0 },
        {
          plugins: [
            {
              name: 'cancel',
              onBeforeSet: () => false,
            },
          ],
        },
      );

      store.count = 10;
      // 组件外读取走 fallback 路径
      expect(store.snapshot().count).toBe(0);
    });

    it('返回 { value } 替换值', () => {
      const store = gfstate(
        { count: 0 },
        {
          plugins: [
            {
              name: 'transform',
              onBeforeSet: (_key, newVal) => ({
                value: (newVal as number) * 2,
              }),
            },
          ],
        },
      );

      store.count = 5;
      expect(store.snapshot().count).toBe(10);
    });

    it('链式调用多个 onBeforeSet 插件', () => {
      const store = gfstate(
        { count: 0 },
        {
          plugins: [
            {
              name: 'add1',
              onBeforeSet: (_key, newVal) => ({
                value: (newVal as number) + 1,
              }),
            },
            {
              name: 'double',
              onBeforeSet: (_key, newVal) => ({
                value: (newVal as number) * 2,
              }),
            },
          ],
        },
      );

      store.count = 5; // 5 → (+1) → 6 → (*2) → 12
      expect(store.snapshot().count).toBe(12);
    });

    it('链中某个插件返回 false 短路后续插件', () => {
      const afterPlugin = jest.fn();
      const store = gfstate(
        { count: 0 },
        {
          plugins: [
            {
              name: 'cancel',
              onBeforeSet: () => false,
            },
            {
              name: 'after-cancel',
              onBeforeSet: afterPlugin,
            },
          ],
        },
      );

      store.count = 10;
      expect(afterPlugin).not.toHaveBeenCalled();
      expect(store.snapshot().count).toBe(0);
    });

    it('替换后值与旧值相同则跳过更新', () => {
      const afterSet = jest.fn();
      const store = gfstate(
        { count: 5 },
        {
          plugins: [
            {
              name: 'same-val',
              onBeforeSet: () => ({ value: 5 }), // 始终返回 5
            },
            {
              name: 'after',
              onAfterSet: afterSet,
            },
          ],
        },
      );

      store.count = 10;
      expect(afterSet).not.toHaveBeenCalled();
      expect(store.snapshot().count).toBe(5);
    });
  });

  describe('onAfterSet', () => {
    it('在值设置后调用', () => {
      const afterSet = jest.fn();
      const store = gfstate(
        { count: 0 },
        {
          plugins: [{ name: 'after', onAfterSet: afterSet }],
        },
      );

      store.count = 5;
      expect(afterSet).toHaveBeenCalledWith('count', 5, 0, expect.any(Object));
    });

    it('值未变化时不触发', () => {
      const afterSet = jest.fn();
      const store = gfstate(
        { count: 5 },
        {
          plugins: [{ name: 'after', onAfterSet: afterSet }],
        },
      );

      store.count = 5; // 同值
      expect(afterSet).not.toHaveBeenCalled();
    });

    it('onAfterSet 出错不阻塞其他插件', () => {
      const error = jest.spyOn(console, 'error').mockImplementation();
      const secondAfter = jest.fn();

      const store = gfstate(
        { count: 0 },
        {
          plugins: [
            {
              name: 'bad-after',
              onAfterSet: () => {
                throw new Error('after failed');
              },
            },
            {
              name: 'good-after',
              onAfterSet: secondAfter,
            },
          ],
        },
      );

      store.count = 1;
      expect(secondAfter).toHaveBeenCalled();
      expect(error).toHaveBeenCalled();
      error.mockRestore();
    });

    it('reset 时触发 onAfterSet', () => {
      const afterSet = jest.fn();
      const store = gfstate(
        { count: 0 },
        {
          plugins: [{ name: 'after', onAfterSet: afterSet }],
        },
      );

      store.count = 10;
      afterSet.mockClear();

      store.reset();
      expect(afterSet).toHaveBeenCalledWith('count', 0, 10, expect.any(Object));
    });
  });

  describe('onSubscribe', () => {
    it('全局订阅时 key 为 null', () => {
      const onSubscribe = jest.fn();
      const store = gfstate(
        { count: 0 },
        {
          plugins: [{ name: 'sub', onSubscribe }],
        },
      );

      store.subscribe(() => {});
      expect(onSubscribe).toHaveBeenCalledWith(null, expect.any(Object));
    });

    it('按 key 订阅时传递 key', () => {
      const onSubscribe = jest.fn();
      const store = gfstate(
        { count: 0 },
        {
          plugins: [{ name: 'sub', onSubscribe }],
        },
      );

      store.subscribe('count', () => {});
      expect(onSubscribe).toHaveBeenCalledWith('count', expect.any(Object));
    });
  });

  describe('onDestroy', () => {
    it('销毁时调用，可访问 store', () => {
      const onDestroy = jest.fn();
      const store = gfstate(
        { count: 0 },
        {
          plugins: [{ name: 'destroy', onDestroy }],
        },
      );

      store.count = 5;
      store.destroy();

      expect(onDestroy).toHaveBeenCalledTimes(1);
      // onDestroy 在 destroyed = true 之前调用
      const ctx = onDestroy.mock.calls[0][0];
      expect(ctx.store).toBe(store);
    });

    it('onDestroy 出错不阻塞销毁流程', () => {
      const error = jest.spyOn(console, 'error').mockImplementation();
      const store = gfstate(
        { count: 0 },
        {
          plugins: [
            {
              name: 'bad-destroy',
              onDestroy: () => {
                throw new Error('destroy error');
              },
            },
          ],
        },
      );

      // 不应抛出
      expect(() => store.destroy()).not.toThrow();
      expect(error).toHaveBeenCalled();
      error.mockRestore();
    });
  });

  describe('无 name 的插件注册', () => {
    it('name 为空字符串时抛出错误', () => {
      expect(() => {
        gfstate.use({ name: '' } as any);
      }).toThrow('gfstate 插件必须提供 name 属性');
    });

    it('name 为 undefined 时抛出错误', () => {
      expect(() => {
        gfstate.use({ name: undefined } as any);
      }).toThrow('gfstate 插件必须提供 name 属性');
    });
  });

  describe('onBeforeSet 执行出错', () => {
    it('onBeforeSet 抛出异常时打印 console.error 且不阻塞', () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();
      const store = gfstate(
        { count: 0 },
        {
          plugins: [
            {
              name: 'bad-before-set',
              onBeforeSet: () => {
                throw new Error('onBeforeSet boom');
              },
            },
          ],
        },
      );

      store.count = 10;
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('bad-before-set'),
        expect.any(Error),
      );
      errorSpy.mockRestore();
    });
  });

  describe('onSubscribe 执行出错', () => {
    it('onSubscribe 抛出异常时打印 console.error 且不阻塞', () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();
      const store = gfstate(
        { count: 0 },
        {
          plugins: [
            {
              name: 'bad-subscribe',
              onSubscribe: () => {
                throw new Error('onSubscribe boom');
              },
            },
          ],
        },
      );

      // 全局订阅触发 onSubscribe
      store.subscribe(() => {});
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('bad-subscribe'),
        expect.any(Error),
      );

      errorSpy.mockClear();

      // 按 key 订阅也触发 onSubscribe
      store.subscribe('count', () => {});
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('bad-subscribe'),
        expect.any(Error),
      );

      errorSpy.mockRestore();
    });
  });

  describe('与组件集成', () => {
    it('插件钩子在组件更新中正确触发', () => {
      const changes: Array<{ key: string; newVal: unknown; oldVal: unknown }> =
        [];
      const store = gfstate(
        { count: 0 },
        {
          plugins: [
            {
              name: 'tracker',
              onAfterSet: (key, newVal, oldVal) => {
                changes.push({ key, newVal, oldVal });
              },
            },
          ],
        },
      );

      function App() {
        return (
          <div>
            <span data-testid="count">{store.count}</span>
            <button onClick={() => (store.count = store.count + 1)}>inc</button>
          </div>
        );
      }

      const { getByTestId, getByText } = render(<App />);
      expect(getByTestId('count').textContent).toBe('0');

      act(() => {
        fireEvent.click(getByText('inc'));
      });

      expect(getByTestId('count').textContent).toBe('1');
      expect(changes).toEqual([{ key: 'count', newVal: 1, oldVal: 0 }]);
    });
  });
});

describe('插件系统 - 生产模式分支覆盖', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    jest.restoreAllMocks();
  });

  it('生产模式下 registerGlobalPlugin 无 name 不抛错', () => {
    let prodRegister: any;
    let prodClear: any;
    jest.isolateModules(() => {
      process.env.NODE_ENV = 'production';
      const mod = require('./plugins');
      prodRegister = mod.registerGlobalPlugin;
      prodClear = mod.clearGlobalPlugins;
    });

    // 生产模式下，空 name 不抛出
    expect(() => {
      prodRegister({ name: '' } as any);
    }).not.toThrow();

    prodClear();
    process.env.NODE_ENV = originalEnv;
  });

  it('生产模式下重复注册同名插件静默跳过，不输出 warn', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

    let prodRegister: any;
    let prodClear: any;
    jest.isolateModules(() => {
      process.env.NODE_ENV = 'production';
      const mod = require('./plugins');
      prodRegister = mod.registerGlobalPlugin;
      prodClear = mod.clearGlobalPlugins;
    });

    prodRegister({ name: 'dup-prod', onInit: jest.fn() });
    prodRegister({ name: 'dup-prod', onInit: jest.fn() });

    // 生产模式下不应输出警告
    expect(warnSpy).not.toHaveBeenCalled();

    prodClear();
    process.env.NODE_ENV = originalEnv;
  });

  it('生产模式下 onBeforeSet 抛出异常不输出 console.error', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation();

    let prodCreateBeforeSetRunner: any;
    jest.isolateModules(() => {
      process.env.NODE_ENV = 'production';
      const mod = require('./plugins');
      prodCreateBeforeSetRunner = mod.createBeforeSetRunner;
    });

    const plugins = [
      {
        name: 'bad-plugin',
        onBeforeSet: () => {
          throw new Error('boom');
        },
      },
    ];
    const context = {} as any;
    const runner = prodCreateBeforeSetRunner(plugins, context);

    // 调用 runner 不应崩溃
    const result = runner('key', 'newVal', 'oldVal');
    // 生产模式下不输出 error
    expect(errorSpy).not.toHaveBeenCalled();
    // 异常被吞掉，返回 undefined（currentVal === newVal）
    expect(result).toBeUndefined();

    process.env.NODE_ENV = originalEnv;
  });

  it('生产模式下 onBeforeSet 返回 void 时不干预', () => {
    let prodCreateBeforeSetRunner: any;
    jest.isolateModules(() => {
      process.env.NODE_ENV = 'production';
      const mod = require('./plugins');
      prodCreateBeforeSetRunner = mod.createBeforeSetRunner;
    });

    const plugins = [
      {
        name: 'noop-plugin',
        // 返回 undefined（void），不干预设置
        onBeforeSet: () => undefined,
      },
    ];
    const context = {} as any;
    const runner = prodCreateBeforeSetRunner(plugins, context);

    const result = runner('key', 'newVal', 'oldVal');
    // currentVal === newVal，返回 undefined
    expect(result).toBeUndefined();

    process.env.NODE_ENV = originalEnv;
  });

  it('生产模式下 onAfterSet 抛出异常不输出 console.error', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation();

    let prodCreateAfterSetRunner: any;
    jest.isolateModules(() => {
      process.env.NODE_ENV = 'production';
      const mod = require('./plugins');
      prodCreateAfterSetRunner = mod.createAfterSetRunner;
    });

    const secondAfter = jest.fn();
    const plugins = [
      {
        name: 'bad-after',
        onAfterSet: () => {
          throw new Error('after boom');
        },
      },
      {
        name: 'good-after',
        onAfterSet: secondAfter,
      },
    ];
    const context = {} as any;
    const runner = prodCreateAfterSetRunner(plugins, context);

    runner('key', 'newVal', 'oldVal');

    // 生产模式下不输出 error
    expect(errorSpy).not.toHaveBeenCalled();
    // 后续插件仍正常执行
    expect(secondAfter).toHaveBeenCalled();

    process.env.NODE_ENV = originalEnv;
  });

  it('生产模式下 onSubscribe 抛出异常不输出 console.error', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation();

    let prodCreateSubscribeRunner: any;
    jest.isolateModules(() => {
      process.env.NODE_ENV = 'production';
      const mod = require('./plugins');
      prodCreateSubscribeRunner = mod.createSubscribeRunner;
    });

    const plugins = [
      {
        name: 'bad-subscribe',
        onSubscribe: () => {
          throw new Error('subscribe boom');
        },
      },
    ];
    const context = {} as any;
    const runner = prodCreateSubscribeRunner(plugins, context);

    runner(null);
    runner('key');

    // 生产模式下不输出 error
    expect(errorSpy).not.toHaveBeenCalled();

    process.env.NODE_ENV = originalEnv;
  });
});
