---
title: gfstate - React 状态管理
hero:
  title: gfstate
  description: 简单但高性能的 React 状态管理库
  actions:
    - text: 快速上手
      link: /guide
    - text: API 文档
      link: /api
features:
  - title: 细粒度更新
    emoji: ⚡
    description: 基于 Proxy + useSyncExternalStore，组件只在其读取的属性变化时重渲染，天然避免不必要的更新
  - title: 极简 API
    emoji: 💡
    description: 一个 gfstate() 函数创建 store，直接赋值更新状态，无需 reducer、dispatch、action creator
  - title: TypeScript 友好
    emoji: 🔷
    description: 完整的类型推导，store 的属性、方法、计算属性都有准确的类型提示
  - title: 嵌套对象自动代理
    emoji: 🪆
    description: 普通对象属性自动递归包装为子 store，深层嵌套数据也能细粒度响应
  - title: 计算属性 & 监听器
    emoji: 🔄
    description: 支持 computed 派生状态和 watch 监听变化，自动追踪依赖、缓存计算结果
  - title: 组件级状态管理
    emoji: 🧩
    description: useStore Hook 将 state、props、action、ref 统一管理，提供完整生命周期钩子
---
