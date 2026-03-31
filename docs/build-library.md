# Skill: 构建库和文档站

## 使用场景

需要构建库发布包、构建文档站或验证构建产物时使用。

## 构建库（ESM）

```bash
pnpm build
```

运行 `father build`，读取 `.fatherrc.ts` 配置，输出 ESM 到 `es/` 目录。

### 构建产物

```
es/
  index.js          # 主入口（ESM）
  index.d.ts        # TypeScript 声明
  GfState/
    index.js
    index.d.ts
    MemoizedFnHelper.js
    MemoizedFnHelper.d.ts
  useStore/
    index.js
    index.d.ts
```

### 验证构建

```bash
ls -la es/
ls -la es/index.js es/index.d.ts
```

## 构建文档站

```bash
pnpm build:site
```

运行 `dumi build` 生成静态文档站到 `dist/` 目录。

## 预览文档站

```bash
pnpm preview
```

## 发布前检查

`prepublishOnly` 脚本会自动运行:

```bash
father doctor && npm run build
```

- `father doctor` 检查包配置问题
- `npm run build` 构建 ESM 产物

## 完整验证流程

```bash
npx jest --verbose     # 确保测试通过
pnpm build             # 构建库
ls -la es/index.js     # 验证产物存在
```

## 配置文件

- `.fatherrc.ts` — father 构建配置（ESM 输出到 es/）
- `.dumirc.ts` — dumi 文档站配置
- `tsconfig.json` — TypeScript 编译配置
