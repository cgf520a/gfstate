# 功能路线图

## 竞品对比分析

对标 2025/2026 主流 React 状态管理库（Zustand v5、Valtio v2、Jotai v2、MobX v6、Redux Toolkit v2、Legend State v3、TanStack Store），梳理 gfstate 的现状与差距。

### 各竞品核心特点速览（2025/2026）

| 库                  | 核心范式            | 包体积 | 核心亮点                                                             |
| ------------------- | ------------------- | ------ | -------------------------------------------------------------------- |
| **Zustand v5**      | 单 store + selector | ~1.1kB | 极简 API、强中间件生态（persist/devtools/immer）、Context 隔离 store |
| **Valtio v2**       | Proxy 可变 store    | ~3.5kB | 直接赋值、snapshot 不可变快照、derive 跨 store、proxyMap/proxySet    |
| **Jotai v2**        | 原子化              | ~2.4kB | 自底向上组合、Suspense 原生支持、atomFamily、SSR 完善                |
| **MobX v6**         | 可观察对象          | ~16kB  | 最成熟的响应式系统、autorun/reaction/when、flow 异步、enforceActions |
| **RTK v2**          | Flux + createSlice  | ~11kB  | Redux DevTools、createAsyncThunk、listener middleware、RTK Query     |
| **Legend State v3** | 细粒度信号          | ~4kB   | 极致性能、内置持久化与同步层、表单状态管理                           |
| **TanStack Store**  | 框架无关            | ~1kB   | 框架无关核心、derived state、batched updates                         |

### 当前优势（已具备的能力）

| 能力             | 说明                                                 | 竞品对标                                 |
| ---------------- | ---------------------------------------------------- | ---------------------------------------- |
| 自动依赖收集     | Proxy 拦截读取，组件只订阅实际使用的 key             | Valtio、MobX                             |
| 防撕裂           | 底层使用 useSyncExternalStore                        | Zustand、Valtio                          |
| 细粒度订阅       | 每个属性独立 subscribe/getSnapshot                   | 优于 Zustand selector 模式               |
| 极简 API         | `store.key = val` 直接赋值更新                       | Valtio 风格                              |
| 无 Provider      | 不需要包裹 Provider 组件                             | Zustand、Valtio                          |
| computed 属性    | 支持依赖追踪、computed 依赖 computed                 | MobX computed、Jotai derived atom        |
| watch 监听器     | 支持 state/computed/嵌套子 store                     | MobX reaction                            |
| 嵌套对象自动代理 | 纯对象递归包装为子 store                             | MobX、Valtio                             |
| 稳定函数引用     | MemoizedFnHelper 保证函数引用不变                    | 无需 useCallback                         |
| 外部订阅 API     | `store.subscribe(cb)` / `store.subscribe('key', cb)` | Zustand subscribe                        |
| 组件级 store     | useStore 提供 state/props/action/ref 命名空间        | 独有特色                                 |
| batch 批量更新   | `gfstate.config({ batch })` 配置批量调度             | MobX transaction、React 18 auto-batching |

### 功能差距矩阵

| 功能                    | Zustand | Valtio | Jotai | MobX | RTK | Legend | gfstate | 优先级 |
| ----------------------- | ------- | ------ | ----- | ---- | --- | ------ | ------- | ------ |
| DevTools 集成           | ✅      | ✅     | ✅    | ✅   | ✅  | ✅     | ✅      | 🔴 高  |
| 中间件/插件系统         | ✅      | ❌     | ✅    | ❌   | ✅  | ✅     | ✅      | 🔴 高  |
| 状态持久化              | ✅      | ✅     | ✅    | ✅   | ❌  | ✅     | ✅      | 🔴 高  |
| Store 重置              | ✅      | ✅     | ✅    | ✅   | ✅  | ✅     | ❌      | 🔴 高  |
| TypeScript 路径推断     | ⚠️      | ⚠️     | ✅    | ⚠️   | ✅  | ✅     | ✅      | 🔴 高  |
| SSR/Hydration           | ✅      | ✅     | ✅    | ✅   | ✅  | ✅     | ❌      | 🟡 中  |
| 异步状态辅助            | ❌      | ❌     | ✅    | ✅   | ✅  | ✅     | ❌      | 🟡 中  |
| Store 销毁/清理         | ✅      | ✅     | ✅    | ✅   | ❌  | ✅     | ❌      | 🟡 中  |
| 响应式 Map/Set          | ❌      | ✅     | ❌    | ✅   | ❌  | ❌     | ❌      | 🟡 中  |
| 状态快照                | ✅      | ✅     | ✅    | ✅   | ✅  | ✅     | ❌      | 🟡 中  |
| 撤销/重做               | ❌      | ✅     | ❌    | ❌   | ✅  | ✅     | ❌      | 🟡 中  |
| 跨 Store 派生           | ❌      | ✅     | ✅    | ✅   | ✅  | ✅     | ❌      | 🟡 中  |
| Store 作用域隔离        | ✅      | ❌     | ✅    | ❌   | ✅  | ❌     | ❌      | 🟡 中  |
| Vanilla（非 React）模式 | ✅      | ✅     | ❌    | ✅   | ✅  | ✅     | ❌      | 🟡 中  |
| Store 工厂/Family       | ❌      | ❌     | ✅    | ❌   | ❌  | ❌     | ❌      | 🟡 中  |
| 自定义相等函数          | ✅      | ❌     | ✅    | ✅   | ✅  | ✅     | ✅      | 🟢 低  |
| Suspense 集成           | ❌      | ✅     | ✅    | ❌   | ❌  | ❌     | ❌      | 🟢 低  |
| Immer 集成              | ✅      | ❌     | ✅    | ❌   | ✅  | ❌     | ❌      | 🟢 低  |
| 变更拦截器              | ✅      | ❌     | ✅    | ✅   | ✅  | ✅     | ✅      | 🟢 低  |
| 状态迁移                | ✅      | ❌     | ❌    | ❌   | ❌  | ✅     | ❌      | 🟢 低  |
| 表单状态管理            | ❌      | ❌     | ❌    | ❌   | ❌  | ✅     | ❌      | 🟢 低  |
| ESLint 插件             | ❌      | ❌     | ✅    | ✅   | ✅  | ❌     | ❌      | 🟢 低  |
| React Native 持久化     | ✅      | ❌     | ✅    | ✅   | ❌  | ✅     | ❌      | 🟢 低  |

---

## 设计决策记录

### 已决策

- **onChange 回调**：不需要额外提供，组件内状态变更自动触发 re-render。现有 `watch` 满足需求，但需扩展支持 computed 和嵌套 key
- **异步状态**：当前 `created` / `mounted` 异步模式已够用，计划提供 `gfstate.fromAsync()` 便利工具
- **Suspense**：中低优先级，分阶段实现。近期提供 `gfstate.suspense()` 兼容 React 19 `use()`
- **选项式 vs 组合式**：保持选项式 API，组合能力通过多 store 实例天然实现
- **全局 Provider**：不提供，由用户使用 React Context 自行处理
- **子级 Context**：不提供，子级传递对象自动应用 gfstate
- **Immer 集成**：低优先级，gfstate 直接赋值已足够简洁，嵌套深层更新可通过展开运算符或 `store(prev => ...)` 完成

---

## 功能路线图

### Phase 1 — 核心补齐（v0.1.0）✅

- [x] 外部订阅 API: `store.subscribe(cb): unsubscribe`
- [x] computed 依赖 computed（修复 `subscribeToDepKey` 仅检查 state 的限制）
- [x] watch 扩展：支持 computed 属性和嵌套子 store key

### Phase 2 — Store 生命周期与快照（v0.2.0）✅

核心目标：补齐 Store 基础管理能力，这是后续插件系统和 DevTools 的前置依赖。

- [x] **Store 重置**: `store.reset()` / `store.reset('key')`
  - 重置到初始状态（初始化时的 data 深拷贝快照）
  - 支持重置单个 key 或全部 key
  - 重置时触发 computed 重算和 watch 回调
  - 嵌套子 store 递归重置
  - 对标: Zustand `initialState` 模式、Valtio `snapshot` + 赋值、MobX `reset()`
- [x] **Store 销毁**: `store.destroy()`
  - 清理所有订阅、watch、computed 监听
  - 断开嵌套子 store 的父子关联
  - 标记 store 为已销毁，后续读写给出开发模式警告
  - 解决动态创建/销毁 store 场景的内存泄漏
  - 对标: MobX `dispose`、Jotai atom GC
- [x] **状态快照**: `store.snapshot()` → 返回不可变的普通对象
  - 深拷贝当前状态（含 computed 值）
  - 返回纯 JS 对象，不带 Proxy
  - 可用于序列化、调试、日志、SSR 数据传输
  - 对标: Valtio `snapshot()`、MobX `toJS()`

### Phase 3 — 中间件/插件系统（v0.3.0）✅

核心目标：提供可扩展架构，对标 Zustand middleware 和 Legend State 插件生态。

- [x] **插件 API**: `gfstate.use(plugin)` / `options.plugins`
  - 插件接口: `{ name, onInit?, onBeforeSet?, onAfterSet?, onSubscribe?, onDestroy? }`
  - 插件可访问 store 内部钩子，拦截状态读写
  - 支持插件组合和执行顺序控制（全局插件先于 per-store 插件）
  - `onBeforeSet` 支持取消设置（返回 false）和值替换（返回 { value }）
  - 对标: Zustand middleware 链式组合
- [x] **persist 插件**: 状态持久化
  - 支持 localStorage / sessionStorage / IndexedDB
  - 支持 AsyncStorage（React Native）
  - 支持自定义 storage adapter
  - 支持部分 key 持久化（whitelist / blacklist）
  - 支持状态版本号与迁移函数 `migrate(oldState, version)`
  - 支持序列化/反序列化自定义
  - 支持 rehydration 完成回调
  - 对标: Zustand `persist`、Legend State `persistObservable`
- [x] **logger 插件**: 开发环境状态变更日志
  - 格式化输出: `[gfstate] key: oldVal → newVal`
  - 支持 filter 过滤特定 key（include/exclude）
  - 支持 collapsed console.group
  - 支持自定义 logger（如接入 Sentry / LogRocket）
- [x] **DevTools 插件**: 接入 Redux DevTools Extension
  - 状态变更自动上报（action name、key、oldVal、newVal）
  - 支持时间旅行（回退到历史状态）
  - 支持状态导入/导出
  - 实现为可选插件，不增加生产包体积（tree-shakable）
  - 对标: Zustand devtools middleware、Jotai DevTools

### Phase 4 — TypeScript 增强与 DX 提升（v0.4.0）✅

核心目标：提升开发体验和类型安全性。

- [x] **嵌套属性路径类型推断**: 支持 `'user.profile.name'` 路径字符串的类型安全
  - `store.subscribe('user.profile.name', cb)` 类型自动推导 newVal/oldVal
  - `store.watch` 中支持嵌套路径
  - 利用 Template Literal Types 实现（`NestedKeyPaths<T>`、`PathValue<T, P>`）
  - 对标: Legend State 的 `obs.user.profile.name` 深层访问、MobX `observe` path
- [x] **变更拦截器**: `options.intercept`
  - `intercept: { key: (newVal, oldVal) => finalVal | false }`
  - 返回 `false` 取消本次更新
  - 可用于数据校验、格式化、权限控制
  - 对标: MobX `intercept`
- [x] **自定义相等函数**: `options.equals` / 属性级 `equals`
  - 全局配置: `gfstate(data, { equals: shallowEqual })`
  - 属性级配置: `gfstate(data, { equals: { items: deepEqual } })`
  - 内置: `shallowEqual`、`deepEqual`（导出自 `gfstate` 包）
  - 解决数组/对象引用频繁变化但值未变的多余渲染
  - 对标: Zustand `createWithEqualityFn`、Jotai atom `areEqual`
- [x] **严格模式**: `gfstate.config({ enforceActions: true })`
  - 开启后，直接赋值 `store.key = val` 必须在 action 函数内调用
  - 防止意外的散落式状态修改，提升大型项目可维护性
  - 对标: MobX `configure({ enforceActions: 'always' })`
- [x] **开发模式错误增强**
  - computed 循环依赖检测（自引用 & 传递性 A→B→A）并给出具体的依赖链路
  - watch 支持嵌套路径（如 `'user.name'`）

### Phase 5 — 异步与测试（v0.5.0）

核心目标：提升异步场景和测试场景的开发体验。

- [ ] **异步状态辅助**: `gfstate.fromAsync(asyncFn, options?)`
  - 返回带 `{ data, loading, error, refetch, mutate }` 的 store
  - 支持初始数据、缓存策略、轮询间隔
  - 自动管理 loading/error 状态
  - 支持竞态取消（AbortController）
  - 支持乐观更新（optimistic update）
  - 对标: RTK `createAsyncThunk`、Jotai `atomWithQuery`、Legend State async observe
  - **注意**: 不做完整的数据获取层，复杂场景推荐 TanStack Query
- [ ] **autorun**: `gfstate.autorun(fn)` — 自动追踪依赖并执行副作用
  - fn 中读取的 store 属性自动成为依赖
  - 依赖变更时自动重新执行
  - 返回 dispose 函数
  - 对标: MobX `autorun`
- [ ] **reaction**: `gfstate.reaction(dataFn, effectFn)` — 精确控制副作用依赖
  - dataFn 返回追踪值，effectFn 在追踪值变化时执行
  - 首次不执行 effectFn（区别于 autorun）
  - 对标: MobX `reaction`
- [ ] **测试工具集**
  - `createMockStore(data, options?)` — 创建可控的 mock store
  - `store.reset()` — 测试间重置状态（依赖 Phase 2）
  - `store.snapshot()` — 断言状态快照（依赖 Phase 2）
  - `flushUpdates()` — 同步刷新所有 pending 更新
  - Jest/Vitest 自定义 matcher: `expect(store).toHaveState({ key: val })`

### Phase 6 — 高级响应式与 Store 组合（v0.6.0）

核心目标：增强数据结构支持与 Store 间协作。

- [ ] **跨 Store 派生**: `gfstate.derive(stores, deriveFn)`
  - 从多个独立 store 派生计算值
  - 自动订阅所有依赖 store 的相关 key
  - 示例: `const total = gfstate.derive([cartStore, discountStore], (cart, discount) => cart.sum * discount.rate)`
  - 对标: Valtio `derive`、Jotai `atom(get => get(a) + get(b))`
- [ ] **Store 工厂 / Family**: `gfstate.family(factory, keyFn?)`
  - 根据参数动态创建/复用 store 实例
  - 相同参数返回同一 store（内置缓存与 GC）
  - 示例: `const userStore = gfstate.family((id: string) => ({ name: '', age: 0 }))`
  - 对标: Jotai `atomFamily`、Recoil `atomFamily`
- [ ] **Store 作用域隔离**: `<GfstateProvider>`
  - 通过 React Context 实现 store 实例隔离
  - 同一 store 定义在不同 Provider 下持有独立状态
  - 用于 SSR 请求级隔离、测试并行运行、微前端场景
  - 对标: Zustand `createContext`、Jotai `<Provider>`
- [ ] **响应式 Map**: `gfstate.map(entries?)`
  - 支持 `set`/`get`/`delete`/`has`/`forEach`/`size`
  - 单个 entry 变更只触发相关订阅
  - 支持迭代器（for...of、spread）
  - 对标: Valtio `proxyMap`、MobX `observable.map`
- [ ] **响应式 Set**: `gfstate.set(values?)`
  - 支持 `add`/`delete`/`has`/`forEach`/`size`
  - 变更触发订阅
  - 对标: Valtio `proxySet`、MobX `observable.set`
- [ ] **撤销/重做**: `gfstate.withHistory(store, options?)`
  - 记录状态变更历史
  - `store.undo()` / `store.redo()` / `store.history` / `store.canUndo` / `store.canRedo`
  - 可配置历史记录上限（默认 100）
  - 支持分组操作（多个赋值合并为一条历史）
  - 对标: Valtio `proxyWithHistory`、RTK `undoable` reducer

### Phase 7 — 现代 React 与框架适配（v0.7.0）

核心目标：适配 React 19+ 新特性与多框架支持。

- [ ] **SSR/Hydration**
  - 差异化 `getServerSnapshot`（返回服务端初始值）
  - `gfstate.hydrate(store, serverState)` — 客户端注水
  - 支持 Next.js App Router（RSC + Client Component 混合场景）
  - 支持 Remix / React Router v7 数据加载模式
  - 避免 hydration mismatch 警告
  - 对标: Zustand SSR recipe、Jotai SSR provider
- [ ] **Suspense 集成**: `gfstate.suspense(asyncFn)`
  - 返回可被 React 19 `use()` 消费的 store
  - 未 resolve 时抛出 Promise 触发 Suspense boundary
  - resolve 后转为普通响应式 store
  - 对标: Jotai async atoms、Valtio suspense 模式
- [ ] **React Compiler（React Forget）兼容性**
  - 验证与 React Compiler 的兼容
  - 确保 Proxy 读取不被 auto-memoization 优化掉
  - 必要时提供 `"use no memo"` 指令或 escape hatch
  - 添加 CI 回归测试确保每次 React Compiler 版本更新不会破坏
- [ ] **React 19 Actions 集成**
  - 支持 `useOptimistic` 与 gfstate store 协作
  - 支持 `useActionState` 与 store action 桥接
  - Server Actions 中安全读写 store
- [ ] **Vanilla 核心（非 React）**: `gfstate/vanilla`
  - 剥离不依赖 React 的核心响应式引擎
  - 可在 Node.js、Web Worker、其他框架中使用
  - React 绑定层单独导出: `gfstate/react`
  - 对标: Zustand `createStore`（vanilla）、Valtio `proxy`（vanilla）

### Phase 8 — 生态与工程化（v0.8.0）

核心目标：完善工具链和开发者生态。

- [ ] **ESLint 插件**: `eslint-plugin-gfstate`
  - 规则: 禁止在渲染阶段直接写 store（`no-write-in-render`）
  - 规则: 检测 Symbol 值作为 state（`no-symbol-state`）
  - 规则: 数组使用 push/splice 而非替换引用（`no-array-mutation`）
  - 规则: computed 中不允许有副作用（`no-side-effect-in-computed`）
  - 对标: `eslint-plugin-mobx`、`@tanstack/eslint-plugin-query`
- [ ] **性能基准测试套件**
  - 单 key 更新 / 多 key 批量更新 / 嵌套 store 更新的渲染性能
  - 大量订阅者（1000+ 组件）下的更新延迟
  - 与 Zustand / Valtio / Jotai / MobX 的对比基准
  - 集成到 CI，防止性能回退
  - 对标: Jotai benchmark suite
- [ ] **Bundle Size 预算**
  - 设置 size-limit 或 bundlewatch
  - 核心包目标: < 3kB gzipped
  - 插件独立 tree-shakable
  - 对标: Zustand 1.1kB、Jotai 2.4kB
- [ ] **竞品迁移指南**
  - 「从 Zustand 迁移到 gfstate」
  - 「从 Valtio 迁移到 gfstate」
  - 「从 MobX 迁移到 gfstate」
  - 常见模式一一映射 + codemod 脚本（可选）
- [ ] **Codesandbox / Stackblitz 模板**
  - 提供一键可运行的在线模板
  - 包含典型场景: TodoMVC、购物车、表单、数据获取

---

## 非目标（明确不做）

以下功能经评估后决定不纳入路线图：

| 功能                                            | 理由                                                          |
| ----------------------------------------------- | ------------------------------------------------------------- |
| 服务端状态管理（类 RTK Query / TanStack Query） | 职责不同，推荐配合 TanStack Query 使用                        |
| 全局 Provider 包裹                              | 与无 Provider 设计理念冲突（但提供可选的作用域隔离 Provider） |
| Signals 架构（绕过 React 渲染）                 | 与 React 生态不一致，useSyncExternalStore 已满足性能需求      |
| Observable / RxJS 集成                          | 增加复杂度，收益有限                                          |
| 原子化状态（类 Jotai atoms）                    | 与 gfstate 的 store 粒度设计不同，属于不同范式                |
| 多端同步 / CRDT                                 | 复杂度极高，推荐配合 Yjs / Automerge 等专用方案               |
| GraphQL 集成                                    | 推荐使用 Apollo / urql 等专用客户端                           |
