# 统一 Provider（阶段 3：admin gradio 全表单 + 模型启用开关 + 移除 per-user 配置）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development，逐 task 执行。Steps 用 `- [ ]`。
> **Git safety（强制）：** implementer/reviewer 不得运行 `git checkout/switch/reset/stash/restore/rebase`（Phase 1 曾因此污染 HEAD）。只用只读 `git diff/show/log`。在分支 `feature/unified-db-providers` 上工作（基于 Phase 2 tip `8b6ae53`）。
> **部署提醒：** 改 server 代码后真实验证必须 `docker compose -f docker-compose.external-mysql.yml up -d --build api` 重建镜像（容器跑的是 `dist`）。前端 UI 效果需用户 visual 验证。

**Goal:** ① admin 能在面板编辑/新建 `gradio` 接口（含每模型的 Gradio 全字段）；② 接口与模型各有启用开关，禁用项在用户侧既不显示、也不可调用（dispatch 强制）；③ 移除「给单个用户单独配置 API」的入口与后端路由。

**Architecture:** 新增 `ModelDef.enabled`（缺省=启用）。用户侧可见性由 `customModelsToClient` 按 `model.enabled` 过滤（接口级 `enabled` 已由 `effectiveForUser` 过滤）。安全由 dispatch 强制：`resolveForUse` 校验 provider `enabled`、`resolveCustom` 校验 model `enabled`。后端 zod 扩展接受 gradio/video/upscale/endpointPath/enabled。前端 `ProviderForm` 增 gradio 格式 + gradio 字段 + 每模型启用开关；`AdminView`/`providerService`/后端路由移除 per-user 链路。

**Tech Stack:** TS, Express, mysql2, zod, React, vitest。

参考：`docs/superpowers/specs/2026-06-04-unified-db-providers-design.md`（§5/§6/§8）。前端 `tests/` 用 vitest。

---

## File Structure

- Modify `server/src/providers/formats/shared.ts` — `ModelDef.enabled?`
- Modify `server/src/services/customProviders.ts` — `resolveForUse` 校验 provider `enabled`
- Modify `server/src/providers/index.ts` — `resolveCustom` 校验 model `enabled`
- Modify `server/src/providers/models.ts` — `customModelsToClient` 过滤 `enabled`
- Modify `server/src/routes/providerSchemas.ts` — zod 接受 gradio/video/upscale/endpointPath/enabled
- Modify `server/src/routes/adminProviders.ts` — 移除 per-user 路由
- Modify `types.ts`（前端）— 对齐 gradio/video/upscale + GradioModelConfig + enabled/endpointPath
- Modify `components/ProviderForm.tsx` — gradio 全表单 + 每模型启用开关
- Modify `views/AdminView.tsx` — 移除 `UserConfigEditor` + per-user `ProvidersManager`
- Modify `services/providerService.ts` — 移除 per-user 函数
- Delete `components/admin/UserConfigEditor.tsx`
- Modify `translations/{zh,en}.ts` — 新增 gradio/启用文案；移除已无引用的 per-user 文案
- Tests: `server/src/providers/dispatch.test.ts`、`server/src/providers/models.test.ts`、`server/src/routes/*`、`tests/providerService.test.ts`

---

## Task 1: 后端 —— 模型级 `enabled` + dispatch/列表强制

**Files:** `server/src/providers/formats/shared.ts`、`server/src/services/customProviders.ts`、`server/src/providers/index.ts`、`server/src/providers/models.ts`；Test: `server/src/providers/dispatch.test.ts`、`server/src/providers/models.test.ts`

- [ ] **Step 1: 失败测试（dispatch 强制 + 列表过滤）**

在 `server/src/providers/dispatch.test.ts` 的 `describe("generation dispatch — custom providers", ...)` 内追加：

```typescript
  it("rejects a disabled provider even if requested directly", async () => {
    const ctx = buildTestContext();
    const alice = (await seedUser(ctx, { username: "alice", password: "pw" })).id;
    const p = await createGlobalProvider(ctx, {
      name: "Relay", apiUrl: "https://relay", format: "openai",
      models: [{ modelId: "img-1", name: "Img", capabilities: ["image"] }], secret: "sk-1",
      enabled: false,
    });
    await expect(
      dispatchGenerate(ctx, alice, `${p.id}:img-1`, { prompt: "x", aspectRatio: "1:1" }),
    ).rejects.toThrow("PROVIDER_NOT_AVAILABLE");
  });

  it("rejects a disabled model even if requested directly", async () => {
    const ctx = buildTestContext();
    const alice = (await seedUser(ctx, { username: "alice", password: "pw" })).id;
    const p = await createGlobalProvider(ctx, {
      name: "Relay", apiUrl: "https://relay", format: "openai",
      models: [{ modelId: "img-1", name: "Img", capabilities: ["image"], enabled: false }], secret: "sk-1",
    });
    await expect(
      dispatchGenerate(ctx, alice, `${p.id}:img-1`, { prompt: "x", aspectRatio: "1:1" }),
    ).rejects.toThrow("MODEL_DISABLED");
  });
```

在 `server/src/providers/models.test.ts` 追加（若文件不存在则创建，import `customModelsToClient` from `./models`）：

```typescript
import { describe, it, expect } from "vitest";
import { customModelsToClient } from "./models";

describe("customModelsToClient enabled filtering", () => {
  it("drops models with enabled === false, keeps undefined/true", () => {
    const out = customModelsToClient("p1", [
      { modelId: "a", name: "A", capabilities: ["image"] },
      { modelId: "b", name: "B", capabilities: ["image"], enabled: true },
      { modelId: "c", name: "C", capabilities: ["image"], enabled: false },
    ] as any);
    expect(out.map((m) => m.id)).toEqual(["p1:a", "p1:b"]);
  });
});
```

- [ ] **Step 2: 确认失败**

Run: `cd server && npx vitest run src/providers/dispatch.test.ts src/providers/models.test.ts`
Expected: 新用例 FAIL（禁用未被强制；filter 未实现）。

- [ ] **Step 3: `ModelDef.enabled`**

`server/src/providers/formats/shared.ts` 的 `ModelDef` 增加字段（放在 `capabilities` 之后、`endpointPath` 之前）：

```typescript
  /** Per-model enable switch. Absent/true = enabled; false = hidden from users and refused by dispatch. */
  enabled?: boolean;
```

- [ ] **Step 4: `resolveForUse` 校验 provider enabled**

`server/src/services/customProviders.ts` 的 `resolveForUse`，把 usable 判断加上 `rec.enabled`：

```typescript
  const rec = await ctx.repos.customProviders.findById(providerId);
  const usable = rec && rec.enabled && (rec.scope === "global" || rec.ownerUserId === userId);
  if (!rec || !usable) throw new Error("PROVIDER_NOT_AVAILABLE");
```

- [ ] **Step 5: `resolveCustom` 校验 model enabled**

`server/src/providers/index.ts` 的 `resolveCustom`，在 `MODEL_NOT_FOUND` 之后加：

```typescript
  const model = cp.models.find((m) => m.modelId === modelId);
  if (!model) throw new Error("MODEL_NOT_FOUND");
  if (model.enabled === false) throw new Error("MODEL_DISABLED");
```

- [ ] **Step 6: `customModelsToClient` 过滤 enabled**

`server/src/providers/models.ts` 的 `customModelsToClient`，在 `.map` 前加过滤：

```typescript
export function customModelsToClient(
  providerId: string,
  models: { modelId: string; name: string; capabilities: ModelCapability[]; enabled?: boolean }[],
): ClientModel[] {
  return models
    .filter((m) => m.enabled !== false)
    .map((m) => ({
      id: `${providerId}:${m.modelId}`,
      name: m.name,
      type: (m.capabilities ?? []).map((c) => CAP_TO_TYPE[c]).filter(Boolean) as ModelType[],
    }))
    .filter((m) => m.type.length > 0);
}
```

- [ ] **Step 7: 确认通过 + 全量**

Run: `cd server && npx vitest run src/providers/dispatch.test.ts src/providers/models.test.ts && npx tsc --noEmit && npx vitest run`
Expected: 全绿。

- [ ] **Step 8: 提交**

```bash
git add server/src/providers/formats/shared.ts server/src/services/customProviders.ts server/src/providers/index.ts server/src/providers/models.ts server/src/providers/dispatch.test.ts server/src/providers/models.test.ts
git commit -m "feat(server): model-level enabled + enforce provider/model enabled in dispatch and model listing"
```

---

## Task 2: 后端 zod —— 接受 gradio / video / upscale / endpointPath / enabled

**Files:** `server/src/routes/providerSchemas.ts`；Test: `server/src/routes/adminProviders.test.ts`（若无则在 `app.test.ts` 加）

- [ ] **Step 1: 失败测试（创建 gradio provider 经路由）**

在 `server/src/routes/adminProviders.test.ts`（或现有 admin 路由测试文件）追加一条：以 admin 身份 `POST /api/admin/providers` 一个 `format:"gradio"`、模型含 `gradio` 配置 + `enabled:false` + `capabilities:["video"]` 的 provider，断言 `201` 且返回的 provider `format==="gradio"`、模型保留了 `gradio`/`enabled` 字段。（参考该文件现有用例的登录/请求方式；若没有此文件，在 `server/src/app.test.ts` 仿照其 admin 登录流程新增。）

- [ ] **Step 2: 确认失败**

Run: `cd server && npx vitest run src/routes/`
Expected: FAIL（zod 拒 `format:"gradio"` 与未知 model 字段 / `capabilities:["video"]`）。

- [ ] **Step 3: 扩展 zod schema**

完整替换 `server/src/routes/providerSchemas.ts` 的 schema 部分（保留 `sendServiceError`）：

```typescript
import { z } from "zod";
import type { Response } from "express";

/** Shared zod schemas + helpers for the custom-provider routes. */

const capability = z.enum(["image", "edit", "text", "video", "upscale"]);

const gradioConfig = z.object({
  baseUrl: z.string().min(1).max(1024),
  fnIndex: z.number().int(),
  triggerId: z.number().int(),
  argsTemplate: z.array(z.unknown()).max(64),
  stepsDefault: z.number().optional(),
  guidanceDefault: z.number().optional(),
  negativePrompt: z.string().max(4096).optional(),
  outputPath: z.string().min(1).max(256),
  seedPath: z.string().max(256).optional(),
});

const modelDef = z.object({
  modelId: z.string().min(1).max(128),
  name: z.string().min(1).max(128),
  capabilities: z.array(capability).min(1),
  enabled: z.boolean().optional(),
  endpointPath: z.string().max(256).optional(),
  gradio: gradioConfig.optional(),
});

const format = z.enum(["openai", "claude", "gemini", "gradio"]);

export const providerCreateSchema = z.object({
  name: z.string().min(1).max(128),
  apiUrl: z.string().max(1024), // gradio providers may have an empty provider-level apiUrl (per-model baseUrl)
  format,
  models: z.array(modelDef).max(200),
  secret: z.string().max(4096).nullish(),
  enabled: z.boolean().optional(),
});

export const providerPatchSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  apiUrl: z.string().max(1024).optional(),
  format: format.optional(),
  models: z.array(modelDef).max(200).optional(),
  secret: z.string().max(4096).nullish(),
  enabled: z.boolean().optional(),
});

/** Map service errors to HTTP statuses. */
export function sendServiceError(res: Response, err: unknown): void {
  const msg = (err as Error)?.message ?? "error";
  if (msg === "FORBIDDEN") {
    res.status(403).json({ error: "forbidden" });
  } else if (msg === "NOT_FOUND" || msg === "PROVIDER_NOT_AVAILABLE") {
    res.status(404).json({ error: "not_found" });
  } else {
    res.status(500).json({ error: msg });
  }
}
```

> 注意：`apiUrl` 由 `min(1)` 放宽为允许空串（gradio provider 的 endpoint 在每个 model 的 `gradio.baseUrl`，provider 级 apiUrl 可空）。

- [ ] **Step 4: 确认通过 + 全量**

Run: `cd server && npx vitest run src/routes/ && npx tsc --noEmit && npx vitest run`
Expected: 全绿。

- [ ] **Step 5: 提交**

```bash
git add server/src/routes/providerSchemas.ts server/src/routes/adminProviders.test.ts
git commit -m "feat(server): provider zod accepts gradio/video/upscale + endpointPath/enabled + per-model gradio config"
```

---

## Task 3: 后端 —— 移除 per-user provider 路由

**Files:** `server/src/routes/adminProviders.ts`；Test: 相应 admin 路由测试

- [ ] **Step 1: 失败测试**

在 admin 路由测试里追加：`GET /api/admin/users/:uid/providers` 与 `POST /api/admin/users/:uid/providers` 返回 `404`（路由已移除）。若现有测试有 per-user 用例，改为断言 404 或删除。

- [ ] **Step 2: 确认失败**

Run: `cd server && npx vitest run src/routes/`
Expected: per-user 路由仍 201/200（未移除）→ 新断言 FAIL。

- [ ] **Step 3: 移除 per-user 路由**

完整替换 `server/src/routes/adminProviders.ts`：

```typescript
import { Router } from "express";
import type { AppContext } from "../context";
import { createAuthMiddleware } from "../auth/middleware";
import {
  listGlobal,
  createGlobalProvider,
  adminUpdate,
  adminDelete,
} from "../services/customProviders";
import { providerCreateSchema, providerPatchSchema, sendServiceError } from "./providerSchemas";

/**
 * Admin management of GLOBAL custom providers (all under requireAdmin):
 *   GET/POST   /api/admin/providers        — list / create global providers
 *   PATCH/DEL  /api/admin/providers/:pid    — edit / delete any provider by id
 *
 * Per-user provider assignment was removed (unified to global, admin-only).
 */
export function createAdminProviderRouter(ctx: AppContext): Router {
  const router = Router();
  const { requireAdmin } = createAuthMiddleware(ctx);
  router.use(requireAdmin);

  router.get("/providers", async (_req, res) => {
    res.json({ providers: await listGlobal(ctx) });
  });

  router.post("/providers", async (req, res) => {
    const parsed = providerCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request" });
      return;
    }
    const provider = await createGlobalProvider(ctx, parsed.data);
    res.status(201).json({ provider });
  });

  router.patch("/providers/:pid", async (req, res) => {
    const parsed = providerPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request" });
      return;
    }
    try {
      const provider = await adminUpdate(ctx, req.params.pid, parsed.data);
      res.json({ provider });
    } catch (err) {
      sendServiceError(res, err);
    }
  });

  router.delete("/providers/:pid", async (req, res) => {
    await adminDelete(ctx, req.params.pid);
    res.json({ ok: true });
  });

  return router;
}
```

> `listForUser`/`createForUser` 不再被路由引用（仍存在于 service，留待 Phase 5 视情况清理；§13.3 的遗留 user-scope provider 仍可被其 owner 使用、可由 admin 按 id PATCH/DELETE）。

- [ ] **Step 4: 确认通过 + 全量**

Run: `cd server && npx vitest run src/routes/ && npx tsc --noEmit && npx vitest run`
Expected: 全绿（per-user 路由 404）。

- [ ] **Step 5: 提交**

```bash
git add server/src/routes/adminProviders.ts server/src/routes/adminProviders.test.ts
git commit -m "feat(server): remove per-user provider routes (global-only admin config)"
```

---

## Task 4: 前端 —— 类型对齐 + ProviderForm gradio 全表单 + 每模型启用开关

**Files:** `types.ts`、`components/ProviderForm.tsx`、`translations/zh.ts`、`translations/en.ts`

- [ ] **Step 1: 前端类型对齐**

在 `types.ts` 中：

```typescript
// 替换：
export type ApiProviderFormat = 'openai' | 'claude' | 'gemini';
export type ApiProviderCapability = 'image' | 'edit' | 'text';
// 为：
export type ApiProviderFormat = 'openai' | 'claude' | 'gemini' | 'gradio';
export type ApiProviderCapability = 'image' | 'edit' | 'text' | 'video' | 'upscale';

export interface GradioModelConfig {
    baseUrl: string;
    fnIndex: number;
    triggerId: number;
    argsTemplate: unknown[];
    stepsDefault?: number;
    guidanceDefault?: number;
    negativePrompt?: string;
    outputPath: string;
    seedPath?: string;
}
```

并把 `ApiProviderModelDef` 改为：

```typescript
export interface ApiProviderModelDef {
    modelId: string;
    name: string;
    capabilities: ApiProviderCapability[];
    enabled?: boolean;
    endpointPath?: string;
    gradio?: GradioModelConfig;
}
```

- [ ] **Step 2: ProviderForm —— 格式、能力、启用开关、gradio 字段**

改 `components/ProviderForm.tsx`（基于现有结构增量；现有文件已读，保持其 className/风格）：

1. 常量扩展：
```typescript
const CAPS: ApiProviderCapability[] = ["image", "edit", "text", "video", "upscale"];
const FORMATS: ApiProviderFormat[] = ["openai", "claude", "gemini", "gradio"];
```

2. 初始 model 增加 `enabled: true`；`updateModel` 已支持 `Partial<ApiProviderModelDef>`，无需改。新增 gradio 字段更新助手：
```typescript
const updateGradio = (i: number, patch: Partial<GradioModelConfig>) =>
  setModels((prev) => prev.map((m, idx) =>
    idx === i ? { ...m, gradio: { ...(m.gradio ?? { baseUrl: "", fnIndex: 0, triggerId: 0, argsTemplate: [], outputPath: "data[0]" }), ...patch } } : m));
```

3. 每个 model 卡片内，在 capabilities 行之后增加：
   - **启用开关**（所有格式）：一个 checkbox 绑 `m.enabled !== false`，`onChange` → `updateModel(i, { enabled: e.target.checked })`，文案 `t.prov_model_enabled`。
   - **`format === "openai"` 时**：一个可选输入 `endpointPath`（占位 `t.prov_endpoint_path`，如 `/openai`）→ `updateModel(i, { endpointPath: e.target.value || undefined })`。
   - **`format === "gradio"` 时**：展开 gradio 字段组：
     - `baseUrl`（text，必填，占位 `https://xxx.hf.space`）→ `updateGradio(i, { baseUrl })`
     - `fnIndex`（number）→ `updateGradio(i, { fnIndex: Number(v) })`
     - `triggerId`（number）→ `updateGradio(i, { triggerId: Number(v) })`
     - `outputPath`（text，占位 `data[0]`）→ `updateGradio(i, { outputPath })`
     - `seedPath`（text，可选，占位 `data[1]`）→ `updateGradio(i, { seedPath: v || undefined })`
     - `stepsDefault`/`guidanceDefault`（number，可选）
     - `negativePrompt`（textarea，可选）
     - `argsTemplate`（textarea，**JSON 数组**，占位 `["$prompt","$height","$width","$steps","$seed",false]`）：本地用一个 `gradioArgsText[i]` string state 暂存原始文本，`onChange` 存文本；提交时 `JSON.parse`，失败则 `setError(t.prov_gradio_args_invalid)` 并阻止提交。初始值 `JSON.stringify(m.gradio?.argsTemplate ?? [])`。

4. `format === "gradio"` 时 provider 级 `apiUrl` 非必填：把 `canSubmit` 改为 `apiUrl` 仅在非 gradio 时必填：
```typescript
const canSubmit =
  name.trim() &&
  (format === "gradio" || apiUrl.trim()) &&
  models.some((m) => m.modelId.trim() && m.capabilities.length > 0);
```

5. 提交 `handleSubmit` 的 `cleanModels` 保留新字段并解析 argsTemplate：
```typescript
const cleanModels = models
  .filter((m) => m.modelId.trim() && m.capabilities.length > 0)
  .map((m, i) => {
    const base: ApiProviderModelDef = {
      modelId: m.modelId.trim(),
      name: m.name.trim() || m.modelId.trim(),
      capabilities: m.capabilities,
      enabled: m.enabled !== false,
    };
    if (format === "openai" && m.endpointPath) base.endpointPath = m.endpointPath;
    if (format === "gradio") {
      const g = m.gradio ?? ({} as GradioModelConfig);
      base.gradio = { ...g, argsTemplate: parsedArgs[i] /* 见下 */ };
    }
    return base;
  });
```
在 `handleSubmit` 开头解析每个 gradio model 的 argsTemplate 文本为 `parsedArgs: unknown[][]`，任一非法则 `setError(t.prov_gradio_args_invalid); setSubmitting(false); return;`。

6. 列表项（`ProvidersManager` 已显示 `p.format` badge 与 `p.models.length`）无需改即可显示 gradio；可选：禁用的 model 在管理端仍显示（仅用户侧隐藏）。

- [ ] **Step 3: 文案**

`translations/zh.ts` + `translations/en.ts` 新增键（两语言都加）：
- `prov_model_enabled`：zh「启用此模型」/ en "Model enabled"
- `prov_endpoint_path`：zh「端点路径（可选，如 /openai）」/ en "Endpoint path (optional, e.g. /openai)"
- `prov_gradio_base_url` / `prov_gradio_fn_index` / `prov_gradio_trigger_id` / `prov_gradio_output_path` / `prov_gradio_seed_path` / `prov_gradio_steps_default` / `prov_gradio_guidance_default` / `prov_gradio_negative` / `prov_gradio_args`：对应字段标签
- `prov_gradio_args_invalid`：zh「参数模板必须是合法的 JSON 数组」/ en "Args template must be a valid JSON array"

- [ ] **Step 4: 验证**

Run: `npx tsc --noEmit && npx vitest run`（前端，从 repo 根）
Expected: 编译通过、现有前端测试不破。（gradio 表单的实际交互效果由用户在浏览器 visual 验证。）

- [ ] **Step 5: 提交**

```bash
git add types.ts components/ProviderForm.tsx translations/zh.ts translations/en.ts
git commit -m "feat(web): ProviderForm supports gradio full form + per-model enable + openai endpointPath"
```

---

## Task 5: 前端 —— 移除 per-user 配置入口

**Files:** `views/AdminView.tsx`、`services/providerService.ts`、删 `components/admin/UserConfigEditor.tsx`、`translations/{zh,en}.ts`；Test: `tests/providerService.test.ts`

- [ ] **Step 1: providerService 移除 per-user 函数 + 更新测试**

`services/providerService.ts`：删除 `listUserProviders`、`createUserProvider`（保留 `listGlobalProviders/createGlobalProvider/adminUpdateProvider/adminDeleteProvider`）。
`tests/providerService.test.ts`：移除针对 per-user 函数的用例（保留 global/admin 用例；若有则加断言 per-user 函数已不导出可省略）。

- [ ] **Step 2: AdminView 移除 per-user 区块**

`views/AdminView.tsx`：
- 移除 import：`UserConfigEditor`、`listUserProviders`、`createUserProvider`。
- 选中用户的详情区（`selectedUser` 分支）里，**删除** `UserConfigEditor` 的 `<section>` 与 per-user `ProvidersManager` 的 `<section>`。保留账号管理（`UserAccountActions`）。
- 未选用户分支的全局 `ProvidersManager` 保留不变。
- 结果：选中用户只显示账号管理；全局接口配置只在未选用户时的全局 `ProvidersManager` 一处。

- [ ] **Step 3: 删除 UserConfigEditor 组件**

```bash
git rm components/admin/UserConfigEditor.tsx
```

- [ ] **Step 4: 清理文案**

`translations/{zh,en}.ts`：移除已无任何引用的 per-user 配置文案（如 `admin_tokens`、`admin_endpoints`、`admin_token_set/unset/placeholder`、`admin_api_url`、`admin_model_id`、`admin_save_config` 等——**逐个 grep 确认无其它引用再删**；`admin_config`/`admin_account` 等若仍被 AdminView 使用则保留）。

- [ ] **Step 5: 验证**

Run: `npx tsc --noEmit && npx vitest run`（前端）
Expected: 编译通过（无对已删函数/组件/文案的悬空引用）、测试绿。

- [ ] **Step 6: 提交**

```bash
git add views/AdminView.tsx services/providerService.ts translations/zh.ts translations/en.ts
git rm components/admin/UserConfigEditor.tsx
git commit -m "feat(web): remove per-user API config (UserConfigEditor + per-user providers); global-only"
```

---

## 阶段 3 完成标准

- 前后端 `npx tsc --noEmit` + `npx vitest run` 全绿。
- 后端：禁用的 provider/model 既不出现在 `/api/v1/models`，也在 dispatch 被拒（`PROVIDER_NOT_AVAILABLE`/`MODEL_DISABLED`）；zod 接受 gradio/video/upscale/endpointPath/enabled；per-user provider 路由 404。
- 前端：`ProviderForm` 可选 gradio 格式并编辑每模型的 Gradio 全字段 + 每模型启用开关 + openai endpointPath；AdminView 不再有「给单个用户配 token/接口」入口，全局接口配置集中一处。

## 真实验证（用户在 docker）
1. `docker compose -f docker-compose.external-mysql.yml up -d --build api web`（**前端这次也改了，需 rebuild web**）。
2. admin 面板：编辑 seed 的 HuggingFace(gradio) → 应能看到/修改每个模型的 baseUrl/fnIndex/argsTemplate 等；把某个模型「禁用」保存。
3. 普通用户（serviceMode=server）模型列表：被禁用的模型/接口消失；启用的可正常出图。
4. 选中某用户：只剩账号管理，无 token/接口配置入口。

## 后续（Phase 4 / 5）
- Phase 4：锁定 `serviceMode=server`、删 6 个浏览器直连 service、精简 `constants.ts`、模型选择只走 `/api/v1/models`。
- Phase 5：移除 HF 旧路径（`huggingface.ts`/`REGISTRY`/dispatch HF 特判）、清理 `customProviders` 里 `listForUser/createForUser` 等遗留、stale 注释；可选 seed/migrate 一次性标记化。
