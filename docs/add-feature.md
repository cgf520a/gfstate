# Skill: 添加新功能

## 使用场景

为 gfstate 库添加新功能或增强现有功能时使用。

## 源码位置

| 文件                              | 职责                                |
| --------------------------------- | ----------------------------------- |
| `src/index.ts`                    | 公共 API 导出（添加新导出时需更新） |
| `src/GfState/index.ts`            | 核心 gfstate() 函数（~628 行）      |
| `src/GfState/MemoizedFnHelper.ts` | 稳定函数引用包装器                  |
| `src/useStore/index.ts`           | useStore() React Hook（~113 行）    |

## 步骤

### 1. 实现功能

- **Store 核心功能**: 修改 `src/GfState/index.ts`
- **Hook 功能**: 修改 `src/useStore/index.ts`
- **新模块**: 在 `src/` 下创建新目录 + `index.ts`
- **新公共导出**: 更新 `src/index.ts`

### 2. 遵循内部模式

**状态属性处理模式**（在 gfstate 中）:

- 为每个 state key 创建 `subscribe`、`getSnapshot`、`triggerUpdate`，用 `Set<VoidFn>` 管理订阅者
- 函数用 `MemoizedFnHelper` 包装以保持引用稳定
- 纯对象递归调用 `gfstate()` 创建子 store
- 特殊处理: `ref` key 直通、检查 `noGfstateKeys`、检测 `isValidElement`

**类型定义模式**:

- 类型定义放在文件顶部
- 使用 TypeScript 泛型和条件类型（参考 `IsPlainObject<T>`）
- 默认导出主函数，命名导出类型和工具

**Proxy handler 模式**:

- get trap: 调用 `useSyncExternalStore` 订阅特定 key，组件外 try/catch 回退到原始数据
- set trap: 引用比较新旧值，不同则更新 data 并触发所有订阅回调
- apply trap: 支持函数调用方式更新 `store('key', val)` 或 `store({...})`

### 3. 编写测试

测试文件与源码同目录，命名 `*.test.tsx`（组件）或 `*.test.ts`（纯逻辑）。

```typescript
import '@testing-library/jest-dom';
import { render, fireEvent } from '@testing-library/react';
import React from 'react';
import gfstate from './index'; // 或相应的导入

describe('功能名称', () => {
  test('行为描述', () => {
    // 1. 创建 store
    const store = gfstate({ count: 0 });

    // 2. 渲染使用 store 的组件
    const App = () => <p>count: {store.count}</p>;
    const { getByText } = render(<App />);

    // 3. 断言初始状态
    expect(getByText('count: 0')).toBeInTheDocument();

    // 4. 触发交互
    // fireEvent.click(button);

    // 5. 断言更新后状态
  });
});
```

**重要**: 响应式测试必须在 React 组件内读取 store 属性。组件外直接读取走 fallback 路径，不触发订阅。

### 4. 更新文档

- 在 `docs/` 对应文件中添加使用示例
- 新 API 需在 `docs/api.md` 中添加类型签名
- 代码示例必须自包含: `export default () => { ... }`
- 文档用中文编写

### 5. 验证

```bash
npx jest --verbose          # 运行全部测试
pnpm build                  # 验证构建成功
```

## 编码标准

- TypeScript strict 模式
- 单引号、尾随逗号
- 中文注释和文档
- Conventional Commits 提交消息（`feat:`, `fix:`, `refactor:` 等）
