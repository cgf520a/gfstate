# Skill: 编写文档

## 使用场景

为 gfstate 库添加或更新文档时使用。

## 文档系统

- **框架**: dumi v2
- **配置**: `.dumirc.ts`
- **位置**: `docs/` 目录
- **语言**: 中文（zh-CN）

## 文件结构

```
docs/
  index.md      # 首页（hero + 特性卡片，order 隐式为 0）
  guide.md      # 快速开始指南（order: 1）
  gfstate.md    # gfstate() API 示例（order: 2）
  use-store.md  # useStore() Hook 示例（order: 3）
  api.md        # 完整 API 参考（order: 4）
```

## Frontmatter 格式

每个文档文件以 YAML frontmatter 开头:

```yaml
---
title: 页面标题（中文）
order: N
---
```

`order` 控制导航排序（数字越小越靠前）。

## 编写代码示例

dumi 将 tsx 代码块渲染为可交互的实时演示。每个示例必须:

1. 是完整的、自包含的 React 组件
2. 使用 `export default () => { ... }` 格式
3. 从 `'gfstate'` 导入（dumi 自动解析为本地包）
4. 顶部包含所有必要的 import

### 示例模板

````markdown
```tsx
import React from 'react';
import { gfstate } from 'gfstate';

const store = gfstate({ count: 0 });

export default () => {
  return (
    <div>
      <p>计数: {store.count}</p>
      <button onClick={() => store.count++}>+1</button>
    </div>
  );
};
```
````

### useStore 示例模板

````markdown
```tsx
import React from 'react';
import { useStore } from 'gfstate';

export default () => {
  const store = useStore({
    state: { count: 0 },
    action: {
      increment() {
        store.state.count++;
      },
    },
  });

  return (
    <div>
      <p>计数: {store.state.count}</p>
      <button onClick={store.action.increment}>+1</button>
    </div>
  );
};
```
````

## 文档风格

- `##` (h2) 用于主要章节，`###` (h3) 用于子章节
- 每个 API 功能有独立章节和实时代码示例
- 代码块前用中文解释行为
- API 参考（api.md）中用 typescript 代码块展示类型签名
- 用表格对比数据类型行为

## 运行文档服务器

```bash
pnpm dev    # 启动 dumi 开发服务器（热重载）
```

## 构建文档站

```bash
pnpm build:site   # 构建静态站
pnpm preview      # 预览构建结果
```
