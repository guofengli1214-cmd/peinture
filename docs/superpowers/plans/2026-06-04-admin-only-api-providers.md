# 仅管理员可配置 API 接口（移除普通用户自助配置）· 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 移除普通用户自助配置 custom/relay API provider 的能力（前端入口 + 后端接口），仅保留管理员配置 + 普通用户选择使用。

**Architecture:** 删除自助路由 `/api/providers` 与对应前端入口/客户端函数；权限模型收敛为 `global`（人人可用）+ `user/managed_by='admin'`（管理员指派）两类。管理员的全局接口经既有 `/api/v1/models` 聚合自动对所有用户可见可选——无需新建。

**Tech Stack:** Express + TypeScript（server，vitest + supertest）；React + TS + Zustand（前端，vitest）。

**关联：** spec `docs/superpowers/specs/2026-06-04-admin-only-api-providers-design.md`

**任务顺序保证每次提交都可编译、测试通过**（先删消费者，后删被引用者）。`noUnusedLocals` 两端均未开启，未用 import 不会致编译失败。

---

### Task 1: 后端 — 移除自助路由 `/api/providers`

**Files:**
- Modify: `server/src/app.ts:8,27`
- Modify: `server/src/app.test.ts`（新增 404 断言）
- Delete: `server/src/routes/providers.ts`
- Delete: `server/src/routes/providers.test.ts`

- [ ] **Step 1: 先写失败测试 —— 断言自助路由已不存在（404）**

在 `server/src/app.test.ts` 末尾、最后一个 `it(...)` 之后、`});`（describe 收尾）之前，插入：

```ts
  it("self-service /api/providers is removed (404)", async () => {
    const res = await request(createApp(ctx)).post("/api/providers");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "not_found" });
  });
```

- [ ] **Step 2: 运行测试，确认它失败**

Run: `cd server && npm test -- app.test`
Expected: 新用例 FAIL（路由仍挂载，`POST /api/providers` 不返回 404；因 `ctx={}` 触发 requireAuth 报错，返回 500/非 404）。

- [ ] **Step 3: 删除路由挂载与 import（app.ts）**

删除 `server/src/app.ts` 第 8 行：
```ts
import { createProviderRouter } from "./routes/providers";
```
删除 `server/src/app.ts` 第 27 行：
```ts
  app.use("/api/providers", createProviderRouter(ctx));
```

- [ ] **Step 4: 删除自助路由文件及其测试**

Run:
```bash
git rm server/src/routes/providers.ts server/src/routes/providers.test.ts
```

- [ ] **Step 5: 运行测试，确认通过**

Run: `cd server && npm test`
Expected: 全部 PASS（`app.test.ts` 新用例返回 404 通过；`customProviders.ts` 仍导出 self 函数、由其测试与 dispatch.test 引用，编译/测试不受影响）。

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "feat(server): remove self-service /api/providers route"
```

---

### Task 2: 后端 — 清除 customProviders 中已无用的 self 函数

**Files:**
- Modify: `server/src/services/customProviders.ts`（删除 `createSelfProvider`/`updateSelf`/`deleteSelf`/`listSelf`/`selfEditable`）
- Modify: `server/src/services/customProviders.test.ts`（重写，去掉 self 用例）
- Modify: `server/src/providers/dispatch.test.ts`（`createSelfProvider` → `createForUser`）

- [ ] **Step 1: 先改测试以表达新现实 —— 重写 `customProviders.test.ts`**

将 `server/src/services/customProviders.test.ts` 整文件替换为：

```ts
import { describe, it, expect } from "vitest";
import { buildTestContext, seedUser } from "../testing/helpers";
import {
  createGlobalProvider,
  createForUser,
  adminUpdate,
  resolveForUse,
} from "./customProviders";

async function ctxWithUsers() {
  const ctx = buildTestContext();
  const alice = await seedUser(ctx, { username: "alice", password: "pw" });
  const bob = await seedUser(ctx, { username: "bob", password: "pw" });
  return { ctx, alice: alice.id, bob: bob.id };
}

const sample = {
  name: "My Relay",
  apiUrl: "https://relay.example.com",
  format: "openai" as const,
  models: [{ modelId: "gpt-image-1", name: "GPT Image", capabilities: ["image" as const] }],
  secret: "sk-secret-123",
  enabled: true,
};

describe("custom provider service", () => {
  it("admin global create is global/admin-managed and encrypts the secret", async () => {
    const { ctx } = await ctxWithUsers();
    const p = await createGlobalProvider(ctx, sample);

    expect(p.scope).toBe("global");
    expect(p.managedBy).toBe("admin");
    expect(p.ownerUserId).toBeNull();
    expect(p.hasSecret).toBe(true);
    expect((p as Record<string, unknown>).secret).toBeUndefined();

    // stored encrypted, not plaintext
    const row = await ctx.repos.customProviders.findById(p.id);
    expect(row?.secretEncrypted).toBeTruthy();
    expect(row?.secretEncrypted).not.toContain("sk-secret-123");
  });

  it("admin create-for-user is user-scoped/admin-managed", async () => {
    const { ctx, alice } = await ctxWithUsers();
    const p = await createForUser(ctx, alice, sample);
    expect(p.scope).toBe("user");
    expect(p.managedBy).toBe("admin");
    expect(p.ownerUserId).toBe(alice);
  });

  it("admin secret update: omit keeps, null clears, string replaces", async () => {
    const { ctx, alice } = await ctxWithUsers();
    const p = await createForUser(ctx, alice, sample);

    // omit -> unchanged
    await adminUpdate(ctx, p.id, { name: "n" });
    expect((await ctx.repos.customProviders.findById(p.id))?.secretEncrypted).toBeTruthy();

    // replace
    await adminUpdate(ctx, p.id, { secret: "sk-new" });
    const resolved = await resolveForUse(ctx, alice, p.id);
    expect(resolved.secret).toBe("sk-new");

    // clear
    await adminUpdate(ctx, p.id, { secret: null });
    expect((await ctx.repos.customProviders.findById(p.id))?.secretEncrypted).toBeNull();
  });

  it("resolveForUse enforces access (global or owner only) and decrypts", async () => {
    const { ctx, alice, bob } = await ctxWithUsers();
    const own = await createForUser(ctx, alice, sample);
    const glob = await createGlobalProvider(ctx, sample);

    const r1 = await resolveForUse(ctx, alice, own.id);
    expect(r1.secret).toBe("sk-secret-123");
    expect(r1.apiUrl).toBe("https://relay.example.com");
    expect(r1.format).toBe("openai");

    // global usable by anyone
    expect((await resolveForUse(ctx, bob, glob.id)).secret).toBe("sk-secret-123");

    // bob cannot use alice's private provider
    await expect(resolveForUse(ctx, bob, own.id)).rejects.toThrow("PROVIDER_NOT_AVAILABLE");
  });

  it("admin can update any provider", async () => {
    const { ctx, alice } = await ctxWithUsers();
    const own = await createForUser(ctx, alice, sample);
    const updated = await adminUpdate(ctx, own.id, { enabled: false });
    expect(updated.enabled).toBe(false);
  });
});
```

- [ ] **Step 2: 改 `dispatch.test.ts` —— self → admin-assigned（同为 user-scope，解析行为一致）**

`server/src/providers/dispatch.test.ts` 第 3 行：
```ts
import { createSelfProvider, createGlobalProvider } from "../services/customProviders";
```
改为：
```ts
import { createForUser, createGlobalProvider } from "../services/customProviders";
```
再把文件中两处 `await createSelfProvider(ctx, alice, {`（第 14、37 行）均改为 `await createForUser(ctx, alice, {`。

- [ ] **Step 3: 运行测试（self 函数仍存在，应全绿）**

Run: `cd server && npm test`
Expected: PASS（测试已不再引用 self 函数，但函数尚在）。

- [ ] **Step 4: 从 `customProviders.ts` 删除 self 相关函数**

删除 `server/src/services/customProviders.ts` 中以下三段（连同其上方注释/JSDoc）：

`createSelfProvider`（约 133–136 行）：
```ts
/** A user creates their own provider. */
export function createSelfProvider(ctx: AppContext, userId: number, input: ProviderInput) {
  return create(ctx, "user", userId, "self", input, true);
}
```

`selfEditable` + `listSelf`（约 150–161 行）：
```ts
function selfEditable(rec: CustomProviderRecord, userId: number): boolean {
  return rec.managedBy === "self" && rec.ownerUserId === userId;
}

/** Everything a user can see: globals + their own (admin-assigned + self). */
export async function listSelf(ctx: AppContext, userId: number): Promise<PublicProvider[]> {
  const [globals, own] = await Promise.all([
    ctx.repos.customProviders.listGlobal(),
    ctx.repos.customProviders.listByOwner(userId),
  ]);
  return [...globals, ...own].map((r) => toPublic(r, selfEditable(r, userId)));
}
```

`updateSelf` + `deleteSelf`（约 186–205 行）：
```ts
export async function updateSelf(
  ctx: AppContext,
  userId: number,
  id: string,
  patch: ProviderPatch,
): Promise<PublicProvider> {
  const rec = await ctx.repos.customProviders.findById(id);
  if (!rec) throw new Error("NOT_FOUND");
  if (!selfEditable(rec, userId)) throw new Error("FORBIDDEN");
  await ctx.repos.customProviders.update(id, patchToRepo(ctx, patch));
  const updated = await ctx.repos.customProviders.findById(id);
  return toPublic(updated!, true);
}

export async function deleteSelf(ctx: AppContext, userId: number, id: string): Promise<void> {
  const rec = await ctx.repos.customProviders.findById(id);
  if (!rec) throw new Error("NOT_FOUND");
  if (!selfEditable(rec, userId)) throw new Error("FORBIDDEN");
  await ctx.repos.customProviders.delete(id);
}
```

保留：`create`、`createGlobalProvider`、`createForUser`、`listGlobal`、`listForUser`、`effectiveForUser`、`adminUpdate`、`adminDelete`、`resolveForUse`、`toPublic`、`parseModels`、`parseModelsJson`、`patchToRepo`、`encryptSecret` 等。

> 注：`toPublic` 的 `editable` 形参与 `PublicProvider.editable/managedBy` 字段保留（admin 路径仍用 `editable: true`）。

- [ ] **Step 5: 运行测试 + 类型检查，确认通过**

Run: `cd server && npm test && npm run build`
Expected: 测试全 PASS；`tsc` 无错误（已无任何对 self 函数的引用）。

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "refactor(server): drop unused self-managed provider functions"
```

---

### Task 3: 前端 — 移除"API 接口"设置标签页

**Files:**
- Modify: `components/SettingsModal.tsx`（去掉 tab 项、渲染分支、相关 import、未用的 `Server` 图标）
- Modify: `translations/zh.ts:153,156`、`translations/en.ts:153,156`（删 `tab_providers`、`prov_mine`）

- [ ] **Step 1: 删除 `SettingsModal.tsx` 的自助 import（第 22–28 行整段）**

删除：
```tsx
import { ProvidersManager } from "./ProvidersManager";
import {
  listProviders,
  createProvider,
  updateProvider,
  deleteProvider,
} from "../services/providerService";
```

- [ ] **Step 2: 删除 `providers` 标签项与未用的 `Server` 图标**

删除 `tabs` 数组中的第 67 行：
```tsx
      { id: "providers", icon: Server, label: t.tab_providers },
```
并把第 6 行 lucide import 里的 `Server,` 去掉（删除 providers tab 后该图标不再使用）。即：
```tsx
  X,
  Save,
  Settings2,
  Server,
  Cpu,
```
改为：
```tsx
  X,
  Save,
  Settings2,
  Cpu,
```

- [ ] **Step 3: 删除 `providers` 标签的渲染分支（第 137–145 行整段）**

删除：
```tsx
                  {tab.id === "providers" && (
                    <ProvidersManager
                      title={t.prov_mine}
                      load={listProviders}
                      onCreate={createProvider}
                      onUpdate={updateProvider}
                      onDelete={deleteProvider}
                    />
                  )}

```

- [ ] **Step 4: 删除已无引用的翻译键**

`translations/zh.ts`：删除 `  tab_providers: "API 接口",` 与 `  prov_mine: "我的 API 接口",` 两行。
`translations/en.ts`：删除 `  tab_providers: "API Providers",` 与 `  prov_mine: "My API Providers",` 两行。
（`prov_global`/`prov_user`/`prov_add`/`prov_none`/`prov_managed_admin`/`prov_global_badge` 仍被管理员侧 `ProvidersManager` 使用，保留。）

- [ ] **Step 5: 类型检查 + 构建 + 前端测试**

Run（在仓库根目录）: `npm test && npm run build`
Expected: PASS（`tests/providerService.test.ts` 仍引用自助函数、函数尚在，故通过；构建成功）。

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "feat(web): remove the self-service API Providers settings tab"
```

---

### Task 4: 前端 — 清除 providerService 中的自助客户端函数

**Files:**
- Modify: `services/providerService.ts`（删除 `listProviders`/`createProvider`/`updateProvider`/`deleteProvider`）
- Modify: `tests/providerService.test.ts`（重写，去掉自助用例）

- [ ] **Step 1: 先改测试 —— 重写 `tests/providerService.test.ts`**

整文件替换为：

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  listGlobalProviders,
  createUserProvider,
  adminUpdateProvider,
} from "../services/providerService";

const prov = {
  id: "cp1",
  scope: "user",
  managedBy: "admin",
  ownerUserId: 2,
  name: "Relay",
  apiUrl: "https://relay",
  format: "openai",
  models: [],
  enabled: true,
  hasSecret: true,
  editable: true,
};
const ok = (body: unknown, status = 200) => ({ ok: status < 300, status, json: async () => body });

describe("providerService (admin)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("admin endpoints hit the right URLs", async () => {
    const f = vi.fn().mockResolvedValue(ok({ providers: [] }));
    vi.stubGlobal("fetch", f);
    await listGlobalProviders();
    expect(f.mock.calls[0][0]).toBe("/api/admin/providers");

    const f2 = vi.fn().mockResolvedValue(ok({ provider: prov }, 201));
    vi.stubGlobal("fetch", f2);
    await createUserProvider(5, { name: "n", apiUrl: "u", format: "gemini", models: [] });
    expect(f2.mock.calls[0][0]).toBe("/api/admin/users/5/providers");
    expect(f2.mock.calls[0][1].method).toBe("POST");
  });

  it("throws the error code from the response body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok({ error: "forbidden" }, 403)));
    await expect(adminUpdateProvider("cp1", { name: "x" })).rejects.toThrow("forbidden");
  });
});
```

- [ ] **Step 2: 运行测试（自助函数仍在，应全绿）**

Run: `npm test -- providerService`
Expected: PASS。

- [ ] **Step 3: 删除 `services/providerService.ts` 的自助函数段（第 26–38 行）**

删除：
```ts
// --- Self-service (current user) ---

export const listProviders = (): Promise<CustomApiProvider[]> =>
  req("/api/providers", {}, (d) => d.providers as CustomApiProvider[]);

export const createProvider = (input: CustomApiProviderInput): Promise<CustomApiProvider> =>
  req("/api/providers", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(input) }, (d) => d.provider);

export const updateProvider = (id: string, patch: Partial<CustomApiProviderInput>): Promise<CustomApiProvider> =>
  req(`/api/providers/${id}`, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify(patch) }, (d) => d.provider);

export const deleteProvider = (id: string): Promise<void> =>
  req(`/api/providers/${id}`, { method: "DELETE" }, () => undefined);
```
保留文件顶部的 `req` 辅助函数与所有 `// --- Admin: ... ---` 段。

- [ ] **Step 4: 测试 + 构建**

Run（仓库根目录）: `npm test && npm run build`
Expected: 全 PASS；构建成功。

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "refactor(web): drop unused self-service provider client functions"
```

---

### Task 5: 全量验证

- [ ] **Step 1: 后端全量测试 + 构建**

Run: `cd server && npm test && npm run build`
Expected: 全 PASS，`tsc` 无错。

- [ ] **Step 2: 前端全量测试 + 构建**

Run（仓库根目录）: `npm test && npm run build`
Expected: 全 PASS，`vite build` 成功。

- [ ] **Step 3: 静态确认无残留自助引用**

Run:
```bash
grep -rn "createSelfProvider\|updateSelf\|deleteSelf\|listSelf\|listProviders\|createProvider\b\|updateProvider\b\|deleteProvider\b" \
  server/src services components tests --include=*.ts --include=*.tsx
```
Expected: 无输出（self 相关标识符已全部清除）。

- [ ] **Step 4: 手动验证（部署后）**

- 普通用户登录：设置里**无**"API 接口"标签；"模型"标签里能选到管理员创建的全局接口模型并成功生成；浏览器直接 `fetch('/api/providers', {method:'POST', credentials:'include', headers:{'content-type':'application/json'}, body:'{}'})` 返回 **404 `{error:"not_found"}`**。
- 管理员登录：管理面板仍能创建/编辑全局接口与按用户接口；新建的全局接口对其他普通用户立即出现在模型下拉中。

---

## Self-Review

**1. Spec coverage（对照 spec 各节）：**
- §5 后端彻底禁止 → Task 1（删路由 + 404 测试）、Task 2（删死函数）。✓
- §6 前端移除入口 → Task 3（tab + 翻译）、Task 4（providerService）。✓
- §6 `useSettingsForm` activeTab → 已核实默认即 `"general"`，类型联合仅含陈旧的 `"provider"`（单数、`as any` 下未用），**无需改动**；不纳入任务以免无关改动。✓
- §7 测试改动 → Task 1/2/4 覆盖 providers.test 删除、dispatch.test、customProviders.test、providerService.test。✓
- §8 向后兼容（无迁移）→ 计划不含迁移，符合；遗留 self 行仍可用、可由管理员经既有 per-user 面板管理。✓
- §9 验证 → Task 5。✓

**2. Placeholder scan：** 无 TBD/TODO；所有代码步骤均含完整代码块与确切命令。✓

**3. Type/标识一致性：** 跨任务使用的 `createForUser`/`adminUpdate`/`adminUpdateProvider`/`createUserProvider`/`listGlobalProviders`/`resolveForUse` 均为现有导出；删除集合 `createSelfProvider`/`updateSelf`/`deleteSelf`/`listSelf`/`selfEditable`（后端）与 `listProviders`/`createProvider`/`updateProvider`/`deleteProvider`（前端）一致贯穿删除与测试改写。✓
