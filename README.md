# Duck Ninja

测试管理平台。

## 结构

| 包 | 说明 |
|---|---|
| `apps/api` | Elysia + Better Auth + D1（Cloudflare Workers） |
| `apps/web` | React + Tailwind + shadcn（Cloudflare Pages） |

## 开发

```bash
bun install
# 配置 apps/api/.dev.vars（见示例密钥字段：BETTER_AUTH_SECRET、API_BASE_URL、S3_*）
bun run dev:api   # http://localhost:8787
bun run dev:web   # http://localhost:5173
cd apps/api && bun test
```
