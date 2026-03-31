# gfstate - 项目指南

基于 Proxy + useSyncExternalStore 的 React 细粒度状态管理库。

## 基本信息

- **包名**: gfstate (v0.0.1-alpha.x, MIT)
- **语言**: TypeScript (strict, target ES2015)
- **运行时**: React 18+ (peer dependency)
- **包管理器**: pnpm (使用 npmmirror 镜像)
- **核心机制**: ES6 Proxy + useSyncExternalStore，每个属性独立订阅，只有被读取的属性变更时才触发组件重渲染

## 命令速查

| 任务                   | 命令                       |
| ---------------------- | -------------------------- |
| 启动文档开发服务器     | `pnpm dev` 或 `pnpm start` |
| 构建库（ESM → es/）    | `pnpm build` (father)      |
| 构建文档站             | `pnpm build:site` (dumi)   |
| 运行测试（watch 模式） | `pnpm test`                |
| 运行测试（单次）       | `npx jest --verbose`       |
| 预览文档站             | `pnpm preview`             |

## 源码结构

```
src/
  index.ts                    # 公共 API 导出入口
  GfState/
    index.ts                  # 核心 gfstate() 函数（~628行）
    MemoizedFnHelper.ts       # 稳定函数引用包装器
    index.test.tsx            # 核心测试（~50+ 用例）
    MemoizedFnHelper.test.ts  # MemoizedFnHelper 测试
    todo.md                   # 功能路线图
  useStore/
    index.ts                  # useStore() React Hook（~113行）
    index.test.tsx            # Hook 测试（~20 用例）
docs/                         # dumi v2 文档（中文）
  index.md                    # 首页
  guide.md                    # 快速开始
  gfstate.md                  # gfstate 核心 API 示例
  use-store.md                # useStore Hook 示例
  api.md                      # 完整 API 参考
```

### 构建产物

- ESM 输出到 `es/` 目录（.fatherrc.ts 配置）
- 入口: `es/index.js`，类型: `es/index.d.ts`
- 仅 `es/` 目录发布到 npm

## 核心 API

### 1. `gfstate(data, options?)` — 创建响应式 Store

- **属性**: 每个 key 独立订阅，通过 useSyncExternalStore 连接 React
- **函数**: 自动用 MemoizedFnHelper 包装，引用永远稳定
- **嵌套对象**: 纯对象自动递归包装为子 gfstate store
- **数组**: 引用比较（必须替换整个数组引用才触发更新）
- **更新方式**: `store.key = val` | `store('key', val)` | `store({...})` | `store(prev => partial)`
- **Options**: `computed`（计算属性）、`watch`（监听）、`created`（生命周期）、`noGfstateKeys`（排除自动包装的 key）
- **静态方法**: `gfstate.config({ batch })` 配置批量更新

### 2. `useStore({ state, props, action, ref, lifecycle, options })` — 组件级 Store

- 创建带命名空间的复合 store: `store.state`, `store.props`, `store.action`, `store.ref`
- 生命周期: `beforeCreate`, `created`, `mounted`, `unmounted`
- props/action 每次渲染自动同步最新值

### 3. 工具函数与类型

- `isGfstateStore(obj)` — 检查是否为 gfstate store
- `syncWrapper(fn)` — 同步初始化辅助
- `EMPTY_ARRAY` — 共享空数组常量
- 类型: `Store<Data>`, `TransformData`, `StoreWithComputed`, `Options`, `StoreWithStateAndProps`

## 编码规范

- **Prettier**: 单引号、尾随逗号(all)、80 字符宽度
- **ESLint**: react + react-hooks + @typescript-eslint
- **提交**: Conventional Commits（commitlint 强制）
- **文档/注释语言**: 中文（zh-CN）

## 测试约定

- **框架**: Jest 30 + ts-jest + jsdom 环境
- **React 测试**: @testing-library/react (render, fireEvent, renderHook)
- **断言**: @testing-library/jest-dom (toBeInTheDocument 等)
- **文件位置**: 与源码同目录，命名 `*.test.tsx` 或 `*.test.ts`
- **模式**: 创建 store → 渲染使用 store 的组件 → fireEvent 交互 → 断言 DOM
- **异步测试**: 使用 findByText 或手动 setTimeout + Promise

## 文档约定（dumi v2）

- 文件在 `docs/` 目录下，`.md` 格式
- Frontmatter: `title`（中文）、`order`（导航排序）
- 代码示例为自包含的 tsx 块，格式: `export default () => { ... }`
- dumi 将代码块渲染为可交互的实时演示

## 重要注意事项

- 数组不能用 push/pop/splice — 必须替换整个引用: `store.items = [...store.items, newItem]`
- 不要用 Symbol 值作为 state（每次访问都会触发重渲染）
- computed 属性是只读的，赋值在开发模式下会抛错
- `ref` 是保留属性名，绕过响应式系统（不代理、不触发更新）
- 纯对象自动包装为子 store，除非列在 `noGfstateKeys` 中
- 在组件外读取 store 属性会走 fallback 路径（直接返回原始数据，不触发订阅）

## Skills

### 开发者技能（`.claude/skills/`）

- `run-tests.md` — 运行测试
- `build-library.md` — 构建库和文档站
- `add-feature.md` — 添加新功能
- `write-documentation.md` — 编写文档
- `debug-and-troubleshoot.md` — 调试排错

### 使用方技能（`gfstate-skill/`）

供其他项目的 AI agent 安装使用的 skill，帮助在 React 项目中正确使用 gfstate：

- `gfstate-skill/SKILL.md` — 主技能文件（安装、快速开始、核心 API、注意事项）
- `gfstate-skill/references/gfstate-api.md` — gfstate() 完整 API 参考
- `gfstate-skill/references/usestore-api.md` — useStore() 完整 API 参考
