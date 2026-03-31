// 相等性比较工具函数

export type EqualityFn<T = unknown> = (a: T, b: T) => boolean;

/**
 * 浅比较：比较对象的第一层属性是否相等（使用 Object.is 比较每个属性值）
 * 适用于对象/数组引用频繁变化但浅层值未变的场景
 */
export const shallowEqual = (a: unknown, b: unknown): boolean => {
  if (Object.is(a, b)) return true;
  if (
    a === null ||
    b === null ||
    typeof a !== 'object' ||
    typeof b !== 'object'
  ) {
    return false;
  }
  const keysA = Object.keys(a as object);
  const keysB = Object.keys(b as object);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (
      !Object.prototype.hasOwnProperty.call(b, key) ||
      !Object.is((a as any)[key], (b as any)[key])
    ) {
      return false;
    }
  }
  return true;
};

/**
 * 深比较：递归比较对象/数组的所有层级是否相等
 * 适用于深层嵌套对象引用频繁变化但深层值未变的场景
 * 注意：不支持 Map/Set/Date/RegExp 等特殊对象，如需支持请使用第三方库
 */
export const deepEqual = (a: unknown, b: unknown): boolean => {
  if (Object.is(a, b)) return true;
  if (
    a === null ||
    b === null ||
    typeof a !== 'object' ||
    typeof b !== 'object'
  ) {
    return false;
  }
  const isArrayA = Array.isArray(a);
  const isArrayB = Array.isArray(b);
  if (isArrayA !== isArrayB) return false;
  const keysA = Object.keys(a as object);
  const keysB = Object.keys(b as object);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!deepEqual((a as any)[key], (b as any)[key])) return false;
  }
  return true;
};
