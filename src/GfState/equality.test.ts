import { deepEqual, shallowEqual } from './equality';

describe('deepEqual 未覆盖分支', () => {
  test('数组 vs 非数组返回 false', () => {
    // Line 50: isArrayA !== isArrayB
    expect(deepEqual([1, 2], { 0: 1, 1: 2 })).toBe(false);
    expect(deepEqual({ 0: 1, 1: 2 }, [1, 2])).toBe(false);
    expect(deepEqual([], {})).toBe(false);
    expect(deepEqual({}, [])).toBe(false);
  });

  test('不同 key 长度的对象返回 false', () => {
    // Line 53: keysA.length !== keysB.length
    expect(deepEqual({ a: 1, b: 2 }, { a: 1 })).toBe(false);
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(deepEqual({}, { a: 1 })).toBe(false);
    expect(deepEqual({ a: 1 }, {})).toBe(false);
  });

  test('b 中没有 a 的某个 key 返回 false', () => {
    // Line 55: !Object.prototype.hasOwnProperty.call(b, key)
    // 两个对象 key 数量相同，但 key 名称不同
    expect(deepEqual({ a: 1, b: 2 }, { a: 1, c: 2 })).toBe(false);
    expect(deepEqual({ x: 1 }, { y: 1 })).toBe(false);
    expect(deepEqual({ foo: 1, bar: 2 }, { foo: 1, baz: 2 })).toBe(false);
  });
});
