import MemoizedFnHelper from './MemoizedFnHelper';

describe('MemoizedFnHelper', () => {
  test('run 方法引用在 update 后保持稳定', () => {
    const fn1 = () => 'a';
    const helper = new MemoizedFnHelper(fn1);

    const runRef1 = helper.run;
    helper.update(() => 'b');
    const runRef2 = helper.run;

    expect(runRef1).toBe(runRef2);
  });

  test('run 委托给最新 impl', () => {
    const helper = new MemoizedFnHelper(() => 'a');
    expect(helper.run()).toBe('a');

    helper.update(() => 'b');
    expect(helper.run()).toBe('b');

    helper.update(() => 'c');
    expect(helper.run()).toBe('c');
  });

  test('run 正确转发所有参数', () => {
    let capturedArgs: any[] = [];

    const helper = new MemoizedFnHelper((...args: any[]) => {
      capturedArgs = args;
      return args.reduce((a, b) => a + b, 0);
    });

    const result = helper.run(1, 2, 3, 4);

    expect(capturedArgs).toEqual([1, 2, 3, 4]);
    expect(result).toBe(10);
  });

  test('run 转发 impl 抛出的异常', () => {
    const error = new Error('intentional');
    const helper = new MemoizedFnHelper(() => {
      throw error;
    });

    expect(() => helper.run()).toThrow(error);
  });

  test('run 以 null 作为 this 上下文', () => {
    let capturedThis: any;

    const helper = new MemoizedFnHelper(function (this: any) {
      capturedThis = this;
    });

    helper.run();

    // 在严格模式下，this 应为 null；在非严格模式下，可能是 globalThis
    expect(capturedThis === null || capturedThis === globalThis).toBe(true);
  });

  test('run 返回各种类型的值', () => {
    const helper = new MemoizedFnHelper(() => undefined);
    expect(helper.run()).toBeUndefined();

    helper.update(() => null);
    expect(helper.run()).toBeNull();

    const obj = { a: 1 };
    helper.update(() => obj);
    expect(helper.run()).toBe(obj);

    helper.update(() => 42);
    expect(helper.run()).toBe(42);

    helper.update(() => '');
    expect(helper.run()).toBe('');
  });

  test('无参数调用 run', () => {
    const helper = new MemoizedFnHelper(() => 'no-args');
    expect(helper.run()).toBe('no-args');
  });
});
