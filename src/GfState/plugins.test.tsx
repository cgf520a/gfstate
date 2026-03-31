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
