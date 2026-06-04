# 统一 Provider（阶段 2：migration + seed + 运行时数据迁移）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement task-by-task. Steps use checkbox (`- [ ]`).
> **Git safety:** implementers/reviewers must NOT run `git checkout/switch/reset/stash/restore/rebase` (it corrupted HEAD in Phase 1). Use read-only `git diff/show/log` only. Work on branch `feature/unified-db-providers`.

**Goal:** 把 spec 附录 A 的写死配置作为初始数据 seed 进 `custom_providers`（7 条全局 provider，幂等），新增 `gradio` 的 DB 枚举支持与 openai 适配器的 `endpointPath` 覆盖（Pollinations `/openai`），并把现有 per-user token 迁移并入对应全局 provider 的 secret（不丢数据）。

**Architecture:** migration `003` 扩 `format` 枚举；`CustomProviderRepository` 增 `findGlobalByName` 支撑幂等 seed；`providers/seed.ts` 持有 `SEED_PROVIDERS` 数据 + `seedGlobalProviders`；`providers/migrateData.ts` 收集所有用户 token 去重并入全局 provider secret（仅当该 provider secret 为空时，不覆盖 admin 改动）；`index.ts` 启动链在 `bootstrapAdmin` 后调用 seed + 迁移。代码与 in-memory 单测在本阶段完成；真实 MySQL 的 migration/seed/迁移运行验证由用户在 docker 环境执行（见末尾「真实 DB 验证步骤」）。

**Tech Stack:** TypeScript (Node 20), Express, mysql2, vitest. 复用 Phase 1 的 `AdapterContext/ModelDef/gradio` 引擎与 `customProviders` service（`createGlobalProvider`/`adminUpdate`）、`userConfig`（`getProviderTokens`）。

参考：`docs/superpowers/specs/2026-06-04-unified-db-providers-design.md`（§7 seed、§13 迁移、附录 A 数据）。

---

## File Structure（本阶段涉及）

- Create `server/migrations/003_gradio_format.sql` — `ALTER` `format` 枚举加 `gradio`。
- Modify `server/src/repositories/types.ts` — `CustomProviderRepository` 接口加 `findGlobalByName`；`ModelDef` 无关（在 shared）。
- Modify `server/src/repositories/mysql.ts` + `memory.ts` — 实现 `findGlobalByName`。
- Modify `server/src/providers/formats/shared.ts` — `ModelDef` 加可选 `endpointPath`。
- Modify `server/src/providers/formats/openai.ts` — `text`/`generate` 支持 `endpointPath` 覆盖。
- Create `server/src/providers/seed.ts` (+ `seed.test.ts`) — `SEED_PROVIDERS` + `seedGlobalProviders`。
- Create `server/src/providers/migrateData.ts` (+ `migrateData.test.ts`) — `migrateRuntimeData`。
- Modify `server/src/index.ts` — 启动链接入 seed + 迁移。
- Modify `server/src/providers/formats/formats.test.ts` — endpointPath 用例。

> 测试命令在 `server/` 下：`npx vitest run <file>`、`npx tsc --noEmit`。

---

## Task 1: migration 003 + `findGlobalByName`

**Files:** Create `server/migrations/003_gradio_format.sql`; Modify `server/src/repositories/types.ts`, `mysql.ts`, `memory.ts`; Test: `server/src/repositories/customProviders.repo.test.ts` (new) 或并入现有。

- [ ] **Step 1: 写失败测试**

Create `server/src/repositories/customProviders.repo.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { createMemoryRepositories } from "./memory";

describe("CustomProviderRepository.findGlobalByName", () => {
  it("finds a global provider by exact name, ignores user-scoped and other names", async () => {
    const repos = createMemoryRepositories();
    await repos.customProviders.create({
      id: "g1", scope: "global", ownerUserId: null, managedBy: "admin",
      name: "OpenAI", apiUrl: "https://api.openai.com", format: "openai",
      modelsJson: "[]", secretEncrypted: null, enabled: true,
    });
    await repos.customProviders.create({
      id: "u1", scope: "user", ownerUserId: 7, managedBy: "admin",
      name: "OpenAI", apiUrl: "https://x", format: "openai",
      modelsJson: "[]", secretEncrypted: null, enabled: true,
    });

    const found = await repos.customProviders.findGlobalByName("OpenAI");
    expect(found?.id).toBe("g1");
    expect(await repos.customProviders.findGlobalByName("Nope")).toBeNull();
  });
});
```

- [ ] **Step 2: 确认失败**

Run: `cd server && npx vitest run src/repositories/customProviders.repo.test.ts`
Expected: FAIL (`findGlobalByName` not a function).

- [ ] **Step 3: 接口加 `findGlobalByName`**

In `server/src/repositories/types.ts`, in `interface CustomProviderRepository`, add after `findById`:

```typescript
  findGlobalByName(name: string): Promise<CustomProviderRecord | null>;
```

- [ ] **Step 4: memory 实现**

In `server/src/repositories/memory.ts`, in `MemoryCustomProviderRepository`, add after `findById`:

```typescript
  async findGlobalByName(name: string): Promise<CustomProviderRecord | null> {
    for (const p of this.rows.values()) {
      if (p.scope === "global" && p.name === name) return p;
    }
    return null;
  }
```

- [ ] **Step 5: mysql 实现**

In `server/src/repositories/mysql.ts`, in `MysqlCustomProviderRepository`, add after `findById`:

```typescript
  async findGlobalByName(name: string): Promise<CustomProviderRecord | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT * FROM custom_providers WHERE scope = 'global' AND name = ? LIMIT 1",
      [name],
    );
    return rows[0] ? mapCustomProvider(rows[0]) : null;
  }
```

- [ ] **Step 6: migration SQL**

Create `server/migrations/003_gradio_format.sql`:

```sql
-- 003_gradio_format: allow the 'gradio' provider format (HuggingFace Spaces driven
-- by a per-model args template). Existing rows keep their openai/claude/gemini value.
ALTER TABLE custom_providers
  MODIFY COLUMN format ENUM('openai','claude','gemini','gradio') NOT NULL;
```

- [ ] **Step 7: 确认通过 + 全量**

Run: `cd server && npx vitest run src/repositories/customProviders.repo.test.ts && npx tsc --noEmit && npx vitest run`
Expected: 新测试通过；tsc clean；全量绿。

- [ ] **Step 8: 提交**

```bash
git add server/migrations/003_gradio_format.sql server/src/repositories/types.ts server/src/repositories/mysql.ts server/src/repositories/memory.ts server/src/repositories/customProviders.repo.test.ts
git commit -m "feat(server): 003 migration (gradio format) + customProviders.findGlobalByName"
```

---

## Task 2: openai 适配器 `endpointPath` 覆盖（Pollinations）

让 `format='openai'` 的某个模型可指定非标准端点子路径（Pollinations 的 `/openai` 而非 `/v1/chat/completions`）。

**Files:** Modify `server/src/providers/formats/shared.ts`, `server/src/providers/formats/openai.ts`, `server/src/providers/formats/formats.test.ts`.

- [ ] **Step 1: 加失败测试**

In `server/src/providers/formats/formats.test.ts`, inside `describe("OpenAI format adapter", ...)`, append:

```typescript
  it("text honors a model endpointPath override (e.g. Pollinations /openai)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ choices: [{ message: { content: "opt" } }] }));
    vi.stubGlobal("fetch", fetchMock);

    const c: AdapterContext = {
      apiUrl: "https://text.pollinations.ai",
      secret: null,
      model: { modelId: "openai-fast", name: "x", capabilities: ["text"], endpointPath: "/openai" },
    };
    const out = await ADAPTERS.openai.text!(c, "cat", "SYS");

    expect(out).toBe("opt");
    expect(lastCall(fetchMock).url).toBe("https://text.pollinations.ai/openai");
  });
```

- [ ] **Step 2: 确认失败**

Run: `cd server && npx vitest run src/providers/formats/formats.test.ts`
Expected: FAIL (current `text` builds `/v1/chat/completions`, and `endpointPath` not on `ModelDef`).

- [ ] **Step 3: `ModelDef` 加 `endpointPath`**

In `server/src/providers/formats/shared.ts`, in `interface ModelDef`, add after `capabilities`:

```typescript
  /** openai-format only: override the endpoint sub-path (relative to apiUrl), e.g. "/openai" for Pollinations. Default uses /v1/chat/completions or /v1/images/generations. */
  endpointPath?: string;
```

- [ ] **Step 4: openai 适配器使用覆盖**

In `server/src/providers/formats/openai.ts`, replace the `text` method body's URL build and the `generate` URL build to honor `endpointPath`. Concretely, change `text`:

```typescript
  async text(c: AdapterContext, prompt: string, systemPrompt: string) {
    const url = c.model.endpointPath ? trimBase(c.apiUrl) + c.model.endpointPath : v1(c.apiUrl, "/chat/completions");
    const res = await fetchWithRetry(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(c.secret) },
      body: JSON.stringify({
        model: c.model.modelId,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        stream: false,
      }),
    });
    if (!res.ok) throw new Error("error_prompt_optimization_failed");
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return data?.choices?.[0]?.message?.content || prompt;
  },
```

(generate/edit keep `v1(...)`; only `text` needs the override for Pollinations. Leave generate/edit unchanged.)

- [ ] **Step 5: 确认通过 + 全量**

Run: `cd server && npx vitest run src/providers/formats/formats.test.ts && npx tsc --noEmit && npx vitest run`
Expected: green.

- [ ] **Step 6: 提交**

```bash
git add server/src/providers/formats/shared.ts server/src/providers/formats/openai.ts server/src/providers/formats/formats.test.ts
git commit -m "feat(server): openai adapter endpointPath override (Pollinations /openai)"
```

---

## Task 3: `seed.ts` — 全局 provider 初始数据 + 幂等 seed

**Files:** Create `server/src/providers/seed.ts`, `server/src/providers/seed.test.ts`.

- [ ] **Step 1: 写失败测试**

Create `server/src/providers/seed.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { buildTestContext } from "../testing/helpers";
import { SEED_PROVIDERS, seedGlobalProviders } from "./seed";
import { listGlobal } from "../services/customProviders";

describe("seedGlobalProviders", () => {
  it("seeds all SEED_PROVIDERS as global, and is idempotent", async () => {
    const ctx = buildTestContext();
    const n1 = await seedGlobalProviders(ctx);
    expect(n1).toBe(SEED_PROVIDERS.length);

    const globals = await listGlobal(ctx);
    expect(globals.map((g) => g.name).sort()).toEqual(SEED_PROVIDERS.map((s) => s.name).sort());

    // Second run creates nothing (idempotent by name).
    const n2 = await seedGlobalProviders(ctx);
    expect(n2).toBe(0);
    expect((await listGlobal(ctx)).length).toBe(SEED_PROVIDERS.length);
  });

  it("HuggingFace is a gradio provider whose z-image-turbo carries full Gradio config", async () => {
    const ctx = buildTestContext();
    await seedGlobalProviders(ctx);
    const hf = (await listGlobal(ctx)).find((g) => g.name === "HuggingFace")!;
    expect(hf.format).toBe("gradio");
    const turbo = hf.models.find((m) => m.modelId === "z-image-turbo")!;
    expect(turbo.gradio?.baseUrl).toBe("https://mrfakename-z-image-turbo.hf.space");
    expect(turbo.gradio?.fnIndex).toBe(2);
    expect(turbo.gradio?.argsTemplate).toEqual(["$prompt", "$height", "$width", "$steps", "$seed", false]);
  });

  it("Pollinations openai-fast carries endpointPath /openai", async () => {
    const ctx = buildTestContext();
    await seedGlobalProviders(ctx);
    const poll = (await listGlobal(ctx)).find((g) => g.name === "Pollinations")!;
    expect(poll.models[0].endpointPath).toBe("/openai");
  });
});
```

- [ ] **Step 2: 确认失败**

Run: `cd server && npx vitest run src/providers/seed.test.ts`
Expected: FAIL (`./seed` missing).

- [ ] **Step 3: 创建 `seed.ts`**

Create `server/src/providers/seed.ts` with the EXACT content below. The negative-prompt literals are copied verbatim from `server/src/providers/huggingface.ts` lines 22–25 — keep them byte-identical.

```typescript
import type { AppContext } from "../context";
import { createGlobalProvider, type ProviderInput } from "../services/customProviders";

/**
 * Initial global providers seeded into custom_providers on first boot (idempotent
 * by name). Values are lifted from the legacy hardcoded config (huggingface.ts,
 * constants.ts API_MODEL_MAP) per spec appendix A. Secrets are left null — the
 * admin fills them in the global panel; the runtime-data migration (migrateData.ts)
 * also folds in existing per-user tokens.
 */

// Verbatim from huggingface.ts:22-23
const Z_IMAGE_NEGATIVE_PROMPT =
  "worst quality, low quality, JPEG compression artifacts, ugly, incomplete, extra fingers, poorly drawn hands, poorly drawn face, deformed, disfigured, malformed limbs, fused fingers, cluttered background, three legs";
// Verbatim from huggingface.ts:24-25
const VIDEO_NEGATIVE_PROMPT =
  "Vivid colors, overexposed, static, blurry details, subtitles, style, artwork, painting, image, still, overall grayish tone, worst quality, low quality, JPEG compression artifacts, ugly, incomplete, extra fingers, poorly drawn hands, poorly drawn face, deformed, disfigured, malformed limbs, fused fingers, still image, cluttered background, three legs, many people in the background, walking backward, Screen shaking";

export const SEED_PROVIDERS: ProviderInput[] = [
  {
    name: "HuggingFace",
    format: "gradio",
    apiUrl: "", // gradio endpoints are per-model (model.gradio.baseUrl)
    secret: null,
    models: [
      { modelId: "z-image-turbo", name: "Z-Image Turbo", capabilities: ["image"],
        gradio: { baseUrl: "https://mrfakename-z-image-turbo.hf.space", fnIndex: 2, triggerId: 16,
          argsTemplate: ["$prompt", "$height", "$width", "$steps", "$seed", false],
          stepsDefault: 9, outputPath: "data[0]", seedPath: "data[1]" } },
      { modelId: "z-image", name: "Z-Image", capabilities: ["image"],
        gradio: { baseUrl: "https://mrfakename-z-image.hf.space", fnIndex: 2, triggerId: 18,
          argsTemplate: ["$prompt", "$negativePrompt", "$height", "$width", "$steps", "$guidance", "$seed", false],
          stepsDefault: 30, guidanceDefault: 4, negativePrompt: Z_IMAGE_NEGATIVE_PROMPT, outputPath: "data[0]" } },
      { modelId: "qwen-image", name: "Qwen Image", capabilities: ["image"],
        gradio: { baseUrl: "https://mcp-tools-qwen-image-fast.hf.space", fnIndex: 1, triggerId: 6,
          argsTemplate: ["$prompt", "$seed", false, "$aspectRatio", 3, "$steps"],
          stepsDefault: 8, outputPath: "data[0]" } },
      { modelId: "ovis-image", name: "Ovis Image", capabilities: ["image"],
        gradio: { baseUrl: "https://aidc-ai-ovis-image-7b.hf.space", fnIndex: 2, triggerId: 5,
          argsTemplate: ["$prompt", "$height", "$width", "$seed", "$steps", 4],
          stepsDefault: 20, outputPath: "data[0]" } },
      { modelId: "flux-1-schnell", name: "FLUX.1 Schnell", capabilities: ["image"],
        gradio: { baseUrl: "https://black-forest-labs-flux-1-schnell.hf.space", fnIndex: 2, triggerId: 5,
          argsTemplate: ["$prompt", "$seed", false, "$width", "$height", "$steps"],
          stepsDefault: 4, outputPath: "data[0]" } },
      { modelId: "qwen-image-edit", name: "Qwen Image Edit", capabilities: ["edit"],
        gradio: { baseUrl: "https://linoyts-qwen-image-edit-2511-fast.hf.space", fnIndex: 0, triggerId: 12,
          argsTemplate: ["$imagePayload", "$prompt", "$seed", false, "$guidance", "$steps", "$height", "$width", true],
          stepsDefault: 4, guidanceDefault: 1, outputPath: "data[0][0].image.url" } },
      { modelId: "wan2_2-i2v", name: "Wan 2.2", capabilities: ["video"],
        gradio: { baseUrl: "https://fradeck619-wan2-2-fp8da-aoti-faster.hf.space", fnIndex: 0, triggerId: 16,
          argsTemplate: ["$imageFile", "$prompt", "$steps", "$negativePrompt", "$duration", "$guidance", "$guidance", "$seed", false],
          negativePrompt: VIDEO_NEGATIVE_PROMPT, outputPath: "data[0]" } },
      { modelId: "RealESRGAN_x4plus", name: "RealESRGAN x4 Plus", capabilities: ["upscale"],
        gradio: { baseUrl: "https://tuan2308-upscaler.hf.space", fnIndex: 1, triggerId: 17,
          argsTemplate: ["$imageFile", "RealESRGAN_x4plus", 0.5, false, 4], outputPath: "data[0].url" } },
    ],
  },
  {
    name: "Pollinations", format: "openai", apiUrl: "https://text.pollinations.ai", secret: null,
    models: [{ modelId: "openai-fast", name: "OpenAI 4o mini", capabilities: ["text"], endpointPath: "/openai" }],
  },
  {
    // NOTE: modelId "gpt-5.4" carried over from the legacy default (userConfig.ts);
    // admin should set the real image model in the panel.
    name: "OpenAI", format: "openai", apiUrl: "https://api.openai.com", secret: null,
    models: [{ modelId: "gpt-5.4", name: "OpenAI Image", capabilities: ["image", "edit"] }],
  },
  {
    name: "Google", format: "gemini", apiUrl: "https://generativelanguage.googleapis.com/v1beta", secret: null,
    models: [{ modelId: "gemini-3.1-flash-image-preview", name: "Gemini Image", capabilities: ["image", "edit"] }],
  },
  {
    // modelIds are the upstream API names (constants.ts API_MODEL_MAP.gitee values).
    name: "Gitee AI", format: "openai", apiUrl: "https://ai.gitee.com", secret: null,
    models: [
      { modelId: "z-image-turbo", name: "Z-Image Turbo", capabilities: ["image"] },
      { modelId: "Qwen-Image", name: "Qwen Image", capabilities: ["image"] },
      { modelId: "FLUX.2-dev", name: "FLUX.2", capabilities: ["image"] },
      { modelId: "flux-1-schnell", name: "FLUX.1 Schnell", capabilities: ["image"] },
      { modelId: "FLUX_1-Krea-dev", name: "FLUX.1 Krea", capabilities: ["image"] },
      { modelId: "FLUX.1-dev", name: "FLUX.1", capabilities: ["image"] },
      { modelId: "Qwen-Image-Edit", name: "Qwen Image Edit", capabilities: ["edit"] },
      { modelId: "DeepSeek-V3.2", name: "DeepSeek V3.2", capabilities: ["text"] },
      { modelId: "Qwen3-Next-80B-A3B-Instruct", name: "Qwen 3", capabilities: ["text"] },
    ],
  },
  {
    name: "ModelScope", format: "openai", apiUrl: "https://api-inference.modelscope.cn", secret: null,
    models: [
      { modelId: "Tongyi-MAI/Z-Image-Turbo", name: "Z-Image Turbo", capabilities: ["image"] },
      { modelId: "Tongyi-MAI/Z-Image", name: "Z-Image", capabilities: ["image"] },
      { modelId: "black-forest-labs/FLUX.2-dev", name: "FLUX.2", capabilities: ["image"] },
      { modelId: "black-forest-labs/FLUX.1-Krea-dev", name: "FLUX.1 Krea", capabilities: ["image"] },
      { modelId: "MusePublic/489_ckpt_FLUX_1", name: "FLUX.1", capabilities: ["image"] },
      { modelId: "Qwen/Qwen-Image-Edit-2509", name: "Qwen Image Edit", capabilities: ["edit"] },
      { modelId: "deepseek-ai/DeepSeek-V3.2", name: "DeepSeek V3.2", capabilities: ["text"] },
      { modelId: "Qwen/Qwen3-Next-80B-A3B-Instruct", name: "Qwen 3", capabilities: ["text"] },
    ],
  },
  {
    name: "A4F", format: "openai", apiUrl: "https://api.a4f.co", secret: null,
    models: [
      { modelId: "provider-8/z-image", name: "Z-Image Turbo", capabilities: ["image"] },
      { modelId: "provider-8/imagen-4", name: "Google Imagen 4", capabilities: ["image"] },
      { modelId: "provider-4/imagen-3.5", name: "Google Imagen 3.5", capabilities: ["image"] },
      { modelId: "provider-5/gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite", capabilities: ["text"] },
      { modelId: "provider-2/deepseek-v3.1", name: "DeepSeek V3.1", capabilities: ["text"] },
      { modelId: "provider-2/deepseek-r1", name: "DeepSeek R1", capabilities: ["text"] },
      { modelId: "provider-8/qwen3-235b", name: "Qwen 3", capabilities: ["text"] },
      { modelId: "provider-8/glm-4.5", name: "GLM 4.5", capabilities: ["text"] },
      { modelId: "provider-8/kimi-k2-0905", name: "Kimi K2", capabilities: ["text"] },
    ],
  },
];

/** Seed any SEED_PROVIDERS not already present (matched by global name). Returns count created. */
export async function seedGlobalProviders(ctx: AppContext): Promise<number> {
  let created = 0;
  for (const seed of SEED_PROVIDERS) {
    if (await ctx.repos.customProviders.findGlobalByName(seed.name)) continue;
    await createGlobalProvider(ctx, seed);
    created++;
  }
  return created;
}
```

- [ ] **Step 4: 确认通过**

Run: `cd server && npx vitest run src/providers/seed.test.ts && npx tsc --noEmit`
Expected: green. (If tsc complains that `ProviderInput.models` doesn't accept `gradio`/`endpointPath`, ensure `ProviderInput.models` is `ProviderModelDef[]` = `ModelDef[]` from Phase 1 + Task 2 — it should.)

- [ ] **Step 5: 提交**

```bash
git add server/src/providers/seed.ts server/src/providers/seed.test.ts
git commit -m "feat(server): seed.ts — 7 global providers (gradio HF + openai/gemini relays) from legacy config"
```

---

## Task 4: 运行时数据迁移 `migrateData.ts`

把现有 per-user token 收集去重并入对应全局 provider 的 secret（仅当该 provider secret 为空——不覆盖 admin 改动；幂等）。

**Files:** Create `server/src/providers/migrateData.ts`, `server/src/providers/migrateData.test.ts`.

- [ ] **Step 1: 写失败测试**

Create `server/src/providers/migrateData.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { buildTestContext, seedUser } from "../testing/helpers";
import { seedGlobalProviders } from "./seed";
import { applyAdminUpdate } from "../services/userConfig";
import { listGlobal, resolveForUse } from "../services/customProviders";
import { migrateRuntimeData } from "./migrateData";

describe("migrateRuntimeData", () => {
  it("folds all users' per-provider tokens into the matching global provider secret (deduped), only when empty", async () => {
    const ctx = buildTestContext();
    await seedGlobalProviders(ctx);
    const alice = (await seedUser(ctx, { username: "alice", password: "pw" })).id;
    const bob = (await seedUser(ctx, { username: "bob", password: "pw" })).id;

    // Admin had set per-user gitee tokens (alice has two, bob shares one with alice).
    await applyAdminUpdate(ctx, alice, { tokens: { gitee: "k1,k2" } });
    await applyAdminUpdate(ctx, bob, { tokens: { gitee: "k2,k3" } });

    await migrateRuntimeData(ctx);

    const gitee = (await listGlobal(ctx)).find((g) => g.name === "Gitee AI")!;
    expect(gitee.hasSecret).toBe(true);
    const resolved = await resolveForUse(ctx, alice, gitee.id);
    // deduped union, comma-joined (order preserved by first appearance)
    expect(resolved.secret).toBe("k1,k2,k3");
  });

  it("does not overwrite a provider secret the admin already set", async () => {
    const ctx = buildTestContext();
    await seedGlobalProviders(ctx);
    const alice = (await seedUser(ctx, { username: "alice", password: "pw" })).id;
    await applyAdminUpdate(ctx, alice, { tokens: { gitee: "user-key" } });

    const gitee0 = (await listGlobal(ctx)).find((g) => g.name === "Gitee AI")!;
    const { adminUpdate } = await import("../services/customProviders");
    await adminUpdate(ctx, gitee0.id, { secret: "admin-key" });

    await migrateRuntimeData(ctx);

    const resolved = await resolveForUse(ctx, alice, gitee0.id);
    expect(resolved.secret).toBe("admin-key"); // untouched
  });
});
```

- [ ] **Step 2: 确认失败**

Run: `cd server && npx vitest run src/providers/migrateData.test.ts`
Expected: FAIL (`./migrateData` missing).

- [ ] **Step 3: 创建 `migrateData.ts`**

Create `server/src/providers/migrateData.ts`:

```typescript
import type { AppContext } from "../context";
import { PROVIDER_IDS, getProviderTokens, type ProviderId } from "../services/userConfig";
import { adminUpdate } from "../services/customProviders";

/** Maps a legacy builtin provider id to the seeded global provider's name. */
const PROVIDER_NAME: Record<ProviderId, string> = {
  huggingface: "HuggingFace",
  gitee: "Gitee AI",
  modelscope: "ModelScope",
  a4f: "A4F",
  openai: "OpenAI",
  google: "Google",
};

/**
 * Fold existing per-user tokens into the matching seeded global provider's secret.
 * Idempotent and non-destructive: only writes when the global provider currently
 * has NO secret (so it won't clobber an admin-set or already-migrated key). Tokens
 * across all users are unioned (dedup, first-seen order) and comma-joined to reuse
 * the adapter's multi-key rotation.
 */
export async function migrateRuntimeData(ctx: AppContext): Promise<void> {
  const userIds = (await ctx.repos.users.list()).map((u) => u.id);

  for (const providerId of PROVIDER_IDS) {
    const provider = await ctx.repos.customProviders.findGlobalByName(PROVIDER_NAME[providerId]);
    if (!provider || provider.secretEncrypted) continue; // missing or already has a secret

    const seen = new Set<string>();
    const tokens: string[] = [];
    for (const uid of userIds) {
      for (const tok of await getProviderTokens(ctx, uid, providerId)) {
        if (!seen.has(tok)) { seen.add(tok); tokens.push(tok); }
      }
    }
    if (tokens.length === 0) continue;

    await adminUpdate(ctx, provider.id, { secret: tokens.join(",") });
  }
}
```

- [ ] **Step 4: 确认通过 + 全量**

Run: `cd server && npx vitest run src/providers/migrateData.test.ts && npx tsc --noEmit && npx vitest run`
Expected: green.

- [ ] **Step 5: 提交**

```bash
git add server/src/providers/migrateData.ts server/src/providers/migrateData.test.ts
git commit -m "feat(server): migrateRuntimeData — fold per-user tokens into global provider secrets (idempotent, non-destructive)"
```

---

## Task 5: 启动链接入（seed + 迁移）

**Files:** Modify `server/src/index.ts`. Test: `server/src/providers/bootstrapSeed.test.ts` (integration, in-memory).

- [ ] **Step 1: 写失败test（整合 seed+migrate 的启动序列）**

Create `server/src/providers/bootstrapSeed.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { buildTestContext, seedUser } from "../testing/helpers";
import { applyAdminUpdate } from "../services/userConfig";
import { seedGlobalProviders } from "./seed";
import { migrateRuntimeData } from "./migrateData";
import { listGlobal, resolveForUse } from "../services/customProviders";

// Mirrors the startup order in index.ts (after bootstrapAdmin): seed then migrate.
describe("startup seed + migrate sequence", () => {
  it("seeds providers then migrates existing tokens, end to end", async () => {
    const ctx = buildTestContext();
    const alice = (await seedUser(ctx, { username: "alice", password: "pw" })).id;
    await applyAdminUpdate(ctx, alice, { tokens: { openai: "sk-real" } });

    await seedGlobalProviders(ctx);
    await migrateRuntimeData(ctx);

    const openai = (await listGlobal(ctx)).find((g) => g.name === "OpenAI")!;
    expect((await resolveForUse(ctx, alice, openai.id)).secret).toBe("sk-real");
  });
});
```

- [ ] **Step 2: 确认通过（逻辑已存在，整合 test 应直接绿）**

Run: `cd server && npx vitest run src/providers/bootstrapSeed.test.ts`
Expected: PASS (seed + migrate already implemented in Tasks 3–4; this locks the sequence contract).

- [ ] **Step 3: 接入 `index.ts`**

In `server/src/index.ts`, add imports near the others:

```typescript
import { seedGlobalProviders } from "./providers/seed";
import { migrateRuntimeData } from "./providers/migrateData";
```

And in `main()`, right after `await bootstrapAdmin(ctx);`, add:

```typescript
  const seeded = await seedGlobalProviders(ctx);
  if (seeded > 0) console.log(`[seed] created ${seeded} global provider(s)`);
  await migrateRuntimeData(ctx);
```

- [ ] **Step 4: 全量验证**

Run: `cd server && npx tsc --noEmit && npx vitest run`
Expected: tsc clean; full suite green.

- [ ] **Step 5: 提交**

```bash
git add server/src/index.ts server/src/providers/bootstrapSeed.test.ts
git commit -m "feat(server): seed global providers + migrate per-user tokens on startup"
```

---

## 阶段 2 完成标准

- `cd server && npx tsc --noEmit` 通过，`npx vitest run` 全绿。
- `findGlobalByName` 可用；`seedGlobalProviders` 幂等地建 7 条全局 provider（HF 为 gradio，含 8 模型完整参数；Pollinations/openai/google/gitee/modelscope/a4f）；`migrateRuntimeData` 把现有 per-user token 去重并入对应 provider secret（仅当空、不覆盖 admin）；启动链接入。
- 向后兼容：HF `huggingface:*` 旧路径仍在；现有 custom_providers 行不受影响（003 只扩枚举）。

## 真实 DB 验证步骤（由用户在 docker 环境执行）

1. 备份数据库（`mysqldump`）以防迁移意外。
2. 拉起本阶段代码，重启 server 容器 → 启动日志应出现 `[migrate] applied 003_gradio_format.sql` 与 `[seed] created N global provider(s)`（首次 N=7）。
3. 以 admin 登录 → 全局接口面板应出现 7 条 provider；HuggingFace 为 gradio、含 8 个模型。
4. 若升级前在「用户配置」给用户填过真实 token：对应全局 provider 的 `hasSecret` 应为 true（已迁移）。用一个 HF 模型（免 key）生成验证 server 模式出图。
5. 再次重启 → 不应重复 seed（日志无 `[seed] created`），provider 不重复。

## 后续阶段

- **Phase 3**：`ProvidersManager` 支持 gradio 全表单；`AdminView` 移除 per-user 配置与 `/api/admin/users/:uid/providers`。
- **Phase 4**：锁定 `serviceMode=server`、删 6 直连 service、精简 `constants.ts`、模型选择走 `/api/v1/models`。
- **Phase 5**：移除 HF 旧路径与 `REGISTRY`、死代码与 stale 注释清理、（可选）`migrateRuntimeData`/seed 的一次性标记化、`migrateData` 也迁移 `openaiConfig/googleConfig` 的 apiUrl 覆盖（本阶段仅迁 token）。
