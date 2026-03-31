# 功能参考

在 2024/2025 年的 React 生态中，定义一个“完美”的状态管理库，标准已经比几年前大大提高了。现在的开发者不仅要求能“存取数据”，还要求极致的性能、DX（开发体验）以及对现代 React 特性（如 SSR、RSC）的支持。
如果我们要设计或选择一个完美的 React 状态管理库，它应该具备以下 8 个核心维度的功能：

1. 极致的性能与细粒度更新 (Fine-grained Reactivity)
   这是最基本也是最重要的门槛。
   按需渲染 (Selector / Proxy / Signals)：组件只应该在它真正使用的数据发生变化时才重新渲染。
   反面教材：Context API（只要 Context 变了，所有 Consumer 都会渲染，除非手动 memo）。
   完美方案：自动依赖收集（如 MobX/Valtio）或基于 Selector 的切片（如 Zustand/Redux Toolkit）。最近流行的 Signals 架构更是将更新粒度精确到了 DOM 节点，而非组件级别。
   防止撕裂 (Tearing Prevention)：必须完美支持 React 的 Concurrent Mode (并发模式)。
   技术点：底层必须使用 useSyncExternalStore API 来连接 React 渲染周期。
2. 极简的 API 与低样板代码 (Minimal Boilerplate)
   开发者厌倦了 Redux 早期那种写一个功能要动 4 个文件的噩梦。
   去中心化 vs 中心化：完美库应该支持定义 Store 像定义 Hook 一样简单。
   无 Provider 地狱：不需要在根组件包裹无数个 Provider 就能使用（Zustand/Jotai 模式）。
   Mutable 的 DX，Immutable 的内核：允许开发者直接修改状态（像 Vue 那样 state.count++），但在底层自动处理成不可变数据（利用 Immer.js），这样既符合 React 范式，又写得爽。
3. 第一梯队的 TypeScript 支持 (First-class TypeScript)
   现在没有 TS 支持的库几乎不可用。
   自动类型推断：不需要开发者手动写复杂的 Interface，库应该能根据初始状态自动推断类型。
   泛型支持：在 Action 或 Selector 中能完美识别类型。
4. 现代 React 特性支持 (Modern React Ecosystem)
   React 正在通过 Next.js 等框架发生巨变，状态库不能掉队。
   SSR (服务端渲染) & Hydration：必须能轻松地在服务器端初始化状态，并在客户端“注水”时不发生冲突。
   RSC (React Server Components)：虽然 RSC 无状态，但完美的库应该提供机制，让 Client Component 能无缝接收/同步 RSC 传递的数据。
5. 派生状态与计算属性 (Derived State / Computed)
   状态之间往往有依赖关系。
   自动缓存的计算属性：类似于 Vue 的 computed 或 Recoil 的 selector。如果 state.a 没变，derivedB 就不应该重新计算。
   依赖追踪：当依赖的基础状态变化时，派生状态应自动更新。
6. 组件外访问能力 (External Access)
   很多时候，业务逻辑并不在 React 组件内部（例如在 WebSocket 回调中、在 Router 拦截器中）。
   脱离 Hook 的读写：必须提供 store.getState() 和 store.setState() 这样的方法，允许在普通的 .ts / .js 文件中操作状态，并能触发 UI 更新。
7. 强大的调试工具 (DevTools)
   这是 Redux 留下的宝贵遗产。
   时间旅行 (Time Travel)：可以回退状态，查看历史变更。
   状态快照与 Diff：清晰地看到哪次 Action 修改了哪个字段。
   可视化：如果是原子化状态库（如 Jotai/Recoil），能看到状态依赖图是加分项。
8. 扩展性与中间件 (Middleware & Plugins)
   核心库要小，但功能要能通过插件扩展。
   持久化 (Persist)：一行代码将状态同步到 localStorage 或 AsyncStorage。
   日志 (Logger)：开发环境自动打印变更。
   异步处理：虽然现代开发倾向于用 TanStack Query 处理服务端状态，但 UI 状态库自身也应具备优雅处理 Async Action 的能力。
   低 中间件/插件系统 仅有 batch config，无 persist/logger
   低 DevTools 完全未实现
   低 SSR/RSC 专项支持 仅有基本 getServerSnapshot

---

## 设计决策记录（2026-03-31）

### 已决策

- **onChange 回调**：不需要额外提供，组件内状态变更自动触发 re-render。现有 `watch` 满足需求，但需扩展支持 computed 和嵌套 key
- **异步状态**：当前 `created` / `mounted` 异步模式已够用，计划提供 `gfstate.fromAsync()` 便利工具
- **Suspense**：中低优先级，分阶段实现。近期提供 `gfstate.suspense()` 兼容 React 19 `use()`
- **选项式 vs 组合式**：保持选项式 API，组合能力通过多 store 实例天然实现
- **全局 Provider**：不提供，由用户使用 React Context 自行处理
- **子级 Context**：不提供，子级传递对象自动应用 gfstate

### 功能扩展路线图

#### Phase 1 — 核心补齐（v0.1.0）

- [x] 外部订阅 API: `store.subscribe(cb): unsubscribe`
- [x] computed 依赖 computed（修复 `subscribeToDepKey` 仅检查 state 的限制）
- [x] watch 扩展：支持 computed 属性和嵌套子 store key

#### Phase 2 — 中间件/插件系统（v0.2.0）

- [ ] 插件 API: `gfstate.use(plugin)` / `options.plugins`
- [ ] persist 插件: 状态持久化
- [ ] logger 插件: 开发环境状态变更日志

#### Phase 3 — DX 提升（v0.3.0）

- [ ] `gfstate.fromAsync()` 异步状态辅助工具
- [ ] DevTools: 接入 Redux DevTools Extension
- [ ] 测试工具: `createMockStore()`、`resetStore()`、`getStoreSnapshot()`

#### Phase 4 — 现代 React 支持（v0.4.0）

- [ ] SSR/Hydration: 差异化 `getServerSnapshot`、`gfstate.hydrate()`
- [ ] Suspense/use(): `gfstate.suspense(asyncFn)` 兼容 React 19
