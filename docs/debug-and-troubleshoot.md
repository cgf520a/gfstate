# Skill: 调试排错

## 使用场景

诊断 gfstate store 行为异常、测试失败或构建问题时使用。

## 常见问题

### 1. 组件状态更新后不重渲染

**原因**: 数组使用 push/pop/splice 原地修改，或赋值了相同引用。

**修复**: 始终替换数组引用:

```typescript
// 错误
store.items.push('new');

// 正确
store.items = [...store.items, 'new'];
```

### 2. 嵌套对象不是响应式的

**原因**: 对象在 `noGfstateKeys` 列表中，或是非纯对象（Date, RegExp, 类实例, React element）。

**检查**: 使用 `isGfstateStore(store.property)` 验证是否被包装为子 store。

**纯对象判断标准**: `Object.getPrototypeOf(obj) === Object.prototype` 或 `Object.getPrototypeOf(obj) === null`

### 3. "hooks rule" 错误

**原因**: gfstate 内部使用 `useSyncExternalStore`，读取属性时会调用 hook。如果在非 React 渲染上下文中读取，会通过 try/catch 回退到直接返回原始数据。

**修复**: 确保需要响应式更新的 store 属性读取在组件渲染体内进行。

### 4. Computed 属性赋值报错

**原因**: computed 属性是只读的，开发模式下赋值会抛出 Error。

**修复**: 只修改 computed 依赖的源 state 属性。

### 5. Watch 回调不触发

**原因**: watched key 必须是直接的 state 属性（不能是嵌套子 store 的 key，也不能是 computed 属性）。

**修复**: 确保 key 存在于初始 data 对象中，且不是纯对象（纯对象会变成子 store）。

### 6. 测试中 "act" 警告

**原因**: 状态更新发生在 React 感知之外。

**修复**: 在测试中用 `act(() => { ... })` 包装状态变更，或使用 `fireEvent`（自动处理）。

### 7. 相同值赋值仍触发渲染

**原因**: gfstate 使用引用相等（`===`）比较。对象/数组每次创建新引用会被视为不同值。

**修复**: 对于不变的对象/数组，保持引用不变。可利用 `EMPTY_ARRAY` 常量避免空数组引用变化。

## 调试技巧

### 检查是否为 gfstate Store

```typescript
import { isGfstateStore } from 'gfstate';
console.log(isGfstateStore(obj)); // true/false
```

### 查看 Store 的所有 Key

```typescript
console.log(Object.keys(store));
// 列出所有 state、action、computed 和子 store 的 key
```

### 开发模式警告

gfstate 在开发模式（`process.env.NODE_ENV !== 'production'`）下会输出警告:

- 检测到循环引用
- Symbol 值警告
- Watch key 不存在警告
- Computed key 与 state key 冲突警告

### 运行特定测试调试

```bash
npx jest --verbose -t "测试名称" src/GfState/index.test.tsx
```

### 检查订阅者数量

在源码调试时，可检查内部 `setters` Map 中每个 key 的 `Set<VoidFn>` 大小来确认订阅是否正常建立。
