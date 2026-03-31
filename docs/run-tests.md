# Skill: 运行测试

## 使用场景

需要运行测试套件、验证代码变更或检查回归问题时使用。

## 命令

### 全部测试（单次运行，推荐 AI 使用）

```bash
npx jest --verbose
```

### 全部测试（watch 模式，适合开发者手动使用）

```bash
pnpm test
```

### 运行特定测试文件

```bash
npx jest --verbose src/GfState/index.test.tsx
npx jest --verbose src/useStore/index.test.tsx
npx jest --verbose src/GfState/MemoizedFnHelper.test.ts
```

### 按测试名称模式运行

```bash
npx jest --verbose -t "测试名称关键词"
```

### 生成覆盖率报告

```bash
npx jest --verbose --coverage
```

## 测试文件位置

| 文件                                   | 内容                                |
| -------------------------------------- | ----------------------------------- |
| `src/GfState/index.test.tsx`           | gfstate() 核心功能测试（~50+ 用例） |
| `src/GfState/MemoizedFnHelper.test.ts` | MemoizedFnHelper 单元测试（5 用例） |
| `src/useStore/index.test.tsx`          | useStore() Hook 测试（~20 用例）    |

## 测试环境

- Jest 30 + ts-jest 预设
- jsdom 测试环境
- @testing-library/react 进行组件渲染和交互
- @testing-library/jest-dom 提供 DOM 断言
- CSS/LESS/SCSS 导入通过 identity-obj-proxy mock

## 注意事项

- `pnpm test` 启动 watch 模式（交互式），AI agent 应使用 `npx jest --verbose` 执行单次运行
- 部分测试涉及异步操作（setTimeout），使用 findByText 或手动 Promise 等待
- 测试中状态更新需通过 fireEvent 或 act() 包装
