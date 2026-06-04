# 统一 Provider 引擎（阶段 1：后端调用引擎）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把生成调度统一到「按 provider 格式（含新增的 `gradio`）+ 模型能力路由」的适配器引擎，使数据库里的 gradio/openai/claude/gemini provider 都能驱动 generate/edit/text/video/upscale；HuggingFace 旧路径本阶段保留以不破坏现有功能。

**Architecture:** 在 `formats/shared.ts` 定义统一的 `AdapterContext`（携带 provider 级 `apiUrl/secret` 与选中的 `ModelDef`）与「方法可选」的 `FormatAdapter`（补 `video?/upscale?`）；改造现有 openai/claude/gemini 适配器到新签名；新增 `gradio` 适配器（用参数模板 DSL 驱动任意 Gradio Space）；重构 `providers/index.ts` 的 dispatch，对自定义 provider 一律走 `ADAPTERS[format][capability]`，缺失能力时明确报错。`huggingface` 内置特判保留，待 seed（阶段2）与清理（阶段5）后移除。

**Tech Stack:** TypeScript (Node 20), Express, vitest；复用现有 `providers/gradio.ts`（队列引擎）、`providers/tokenRetry.ts`、`providers/dimensions.ts`、`providers/http.ts`。

参考规格：`docs/superpowers/specs/2026-06-04-unified-db-providers-design.md`（§5 数据模型、§6 调用引擎）。

---

## File Structure（本阶段涉及）

- Modify `server/src/providers/formats/shared.ts` — 统一类型（`Capability`/`GradioModelConfig`/`ModelDef`/`AdapterContext`/`EditOpts`/`VideoOpts`/`ImageResult`）与 `FormatAdapter` 接口。
- Modify `server/src/providers/formats/openai.ts`、`claude.ts`、`gemini.ts` — 改到新签名（从 `AdapterContext` 取 `apiUrl/secret/model.modelId`）。
- Modify `server/src/services/customProviders.ts` — `ProviderModelDef` 复用 `shared.ModelDef`、`Capability` 复用 shared（含 `video/upscale`）。
- Modify `server/src/providers/models.ts` — `ModelCapability` 与 `CAP_TO_TYPE` 补 `video/upscale`。
- Create `server/src/providers/formats/gradio.ts` — `renderTemplate`/`getByPath`/`extractUrl` 纯函数（Task 2）+ `gradioAdapter`（Task 3）。
- Modify `server/src/repositories/types.ts` — `ProviderFormat` 增加 `'gradio'`（Task 3）。
- Modify `server/src/providers/formats/index.ts` — `ADAPTERS` 注册 `gradio`（Task 3）。
- Modify `server/src/providers/index.ts` — dispatch 重构（Task 4）。
- Modify `server/src/providers/formats/formats.test.ts` — 适配新签名（Task 1）。
- Create `server/src/providers/formats/gradio.test.ts` — 纯函数 + 适配器测试（Task 2/3）。
- Modify `server/src/providers/dispatch.test.ts` — 新增 gradio dispatch 用例（Task 4）。

> 所有测试命令在 `server/` 目录下运行。

---

## Task 1: 统一适配器签名（类型 + 三个 HTTP 适配器）

接口变更横切，必须一次改完所有实现者才能编译。

**Files:**
- Modify: `server/src/providers/formats/shared.ts`
- Modify: `server/src/providers/formats/openai.ts`
- Modify: `server/src/providers/formats/claude.ts`
- Modify: `server/src/providers/formats/gemini.ts`
- Modify: `server/src/services/customProviders.ts`
- Modify: `server/src/providers/models.ts`
- Test: `server/src/providers/formats/formats.test.ts`

- [ ] **Step 1: 把 `formats.test.ts` 改写为新签名（失败测试）**

完整替换 `server/src/providers/formats/formats.test.ts`：

```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import { ADAPTERS } from "./index";
import type { AdapterContext, ModelDef } from "./shared";

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body, text: async () => "" });

function lastCall(mock: ReturnType<typeof vi.fn>) {
  const [url, init] = mock.mock.calls[mock.mock.calls.length - 1];
  return { url, init, body: init?.body ? JSON.parse(init.body) : undefined, headers: init?.headers ?? {} };
}

/** Build an AdapterContext for a given endpoint/secret/model id. */
function ctx(apiUrl: string, secret: string | null, modelId: string): AdapterContext {
  const model: ModelDef = { modelId, name: modelId, capabilities: ["image"] };
  return { apiUrl, secret, model };
}

describe("OpenAI format adapter", () => {
  afterEach(() => vi.restoreAllMocks());

  it("generate posts to /v1/images/generations with Bearer auth and parses url", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ data: [{ url: "https://img/out.png" }] }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await ADAPTERS.openai.generate!(ctx("https://relay.example.com", "sk-x", "gpt-image-1"), {
      prompt: "a cat",
      aspectRatio: "1:1",
    });

    expect(res.url).toBe("https://img/out.png");
    const c = lastCall(fetchMock);
    expect(c.url).toBe("https://relay.example.com/v1/images/generations");
    expect(c.init.method).toBe("POST");
    expect(c.headers["Authorization"]).toBe("Bearer sk-x");
    expect(c.body.model).toBe("gpt-image-1");
    expect(c.body.prompt).toBe("a cat");
  });

  it("does not double /v1 when base already ends with it, and parses b64_json", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ data: [{ b64_json: "QUJD" }] }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await ADAPTERS.openai.generate!(ctx("https://api.openai.com/v1", "sk-x", "m"), {
      prompt: "p",
      aspectRatio: "1:1",
    });

    expect(lastCall(fetchMock).url).toBe("https://api.openai.com/v1/images/generations");
    expect(res.url).toBe("data:image/png;base64,QUJD");
  });

  it("text posts to /v1/chat/completions and parses content", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ choices: [{ message: { content: "better prompt" } }] }));
    vi.stubGlobal("fetch", fetchMock);

    const out = await ADAPTERS.openai.text!(ctx("https://relay.example.com", "sk-x", "gpt-4o-mini"), "cat", "SYS");

    expect(out).toBe("better prompt");
    const c = lastCall(fetchMock);
    expect(c.url).toBe("https://relay.example.com/v1/chat/completions");
    expect(c.body.messages[0].role).toBe("system");
    expect(c.body.messages[0].content).toContain("SYS");
  });
});

describe("Claude format adapter", () => {
  afterEach(() => vi.restoreAllMocks());

  it("text posts to /v1/messages with x-api-key + anthropic-version", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ content: [{ type: "text", text: "claude says hi" }] }));
    vi.stubGlobal("fetch", fetchMock);

    const out = await ADAPTERS.claude.text!(ctx("https://api.anthropic.com", "ak-1", "claude-x"), "cat", "SYS");

    expect(out).toBe("claude says hi");
    const c = lastCall(fetchMock);
    expect(c.url).toBe("https://api.anthropic.com/v1/messages");
    expect(c.headers["x-api-key"]).toBe("ak-1");
    expect(c.headers["anthropic-version"]).toBeTruthy();
    expect(c.body.system).toContain("SYS");
  });

  it("generate is unsupported", async () => {
    await expect(
      ADAPTERS.claude.generate!(ctx("https://api.anthropic.com", "ak-1", "m"), { prompt: "x", aspectRatio: "1:1" }),
    ).rejects.toThrow("format_no_image");
  });
});

describe("Gemini format adapter", () => {
  afterEach(() => vi.restoreAllMocks());

  it("generate hits generateContent with x-goog-api-key and parses inline image", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      ok({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "QUJD" } }] } }] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await ADAPTERS.gemini.generate!(ctx("https://generativelanguage.googleapis.com", "gk-1", "gemini-img"), {
      prompt: "a cat",
      aspectRatio: "1:1",
    });

    expect(res.url).toBe("data:image/png;base64,QUJD");
    const c = lastCall(fetchMock);
    expect(c.url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-img:generateContent");
    expect(c.headers["x-goog-api-key"]).toBe("gk-1");
  });

  it("text parses candidates text", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      ok({ candidates: [{ content: { parts: [{ text: "gemini text" }] } }] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const out = await ADAPTERS.gemini.text!(ctx("https://generativelanguage.googleapis.com", "gk-1", "gemini-pro"), "cat", "SYS");
    expect(out).toBe("gemini text");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd server && npx vitest run src/providers/formats/formats.test.ts`
Expected: 编译/类型错误（适配器仍是旧签名，`ADAPTERS.openai.generate!(ctx(...), ...)` 与旧 `(base,key,modelId,params)` 不符）。

- [ ] **Step 3: 重写 `shared.ts` 的类型与接口**

完整替换 `server/src/providers/formats/shared.ts`：

```typescript
import { getDimensions } from "../dimensions";

/** Capabilities a model can expose. */
export type Capability = "image" | "edit" | "text" | "video" | "upscale";

/** Per-model Gradio Space config (only present on gradio-format models). */
export interface GradioModelConfig {
  baseUrl: string;
  fnIndex: number;
  triggerId: number;
  /** Positional args template; "$var" entries are substituted at call time. */
  argsTemplate: unknown[];
  stepsDefault?: number;
  guidanceDefault?: number;
  /** Literal negative prompt, injected wherever the template uses "$negativePrompt". */
  negativePrompt?: string;
  /** Path into the Gradio result, e.g. "data[0]" or "data[0][0].image.url". */
  outputPath: string;
  /** Optional path to read back a server-chosen seed, e.g. "data[1]". */
  seedPath?: string;
}

/** A model definition as stored in a provider's models_json. */
export interface ModelDef {
  modelId: string;
  name: string;
  capabilities: Capability[];
  gradio?: GradioModelConfig;
}

/** What every adapter call receives: provider-level endpoint/secret + the chosen model. */
export interface AdapterContext {
  apiUrl: string;
  secret: string | null;
  model: ModelDef;
}

/** Image-generation parameters common to all formats. */
export interface ImageParams {
  prompt: string;
  aspectRatio: string;
  seed?: number;
  steps?: number;
  guidance?: number;
  enableHD?: boolean;
}

export interface EditOpts {
  width?: number;
  height?: number;
  steps?: number;
  guidance?: number;
}

export interface VideoOpts {
  prompt: string;
  duration: number;
  steps: number;
  guidance: number;
  seed?: number;
}

export interface ImageResult {
  url: string;
  seed?: number;
  steps?: number;
  guidance?: number;
}

/**
 * A provider-format client. All methods are optional — an adapter only
 * implements the capabilities its format supports (Claude = text only; Gradio
 * = image/edit/video/upscale). The dispatch checks for the method and throws
 * `capability_not_supported:<cap>` if it is missing.
 */
export interface FormatAdapter {
  generate?(c: AdapterContext, params: ImageParams): Promise<ImageResult>;
  edit?(c: AdapterContext, images: Blob[], prompt: string, opts: EditOpts): Promise<{ url: string }>;
  text?(c: AdapterContext, prompt: string, systemPrompt: string): Promise<string>;
  video?(c: AdapterContext, image: Blob, opts: VideoOpts): Promise<{ url: string }>;
  upscale?(c: AdapterContext, image: Blob): Promise<{ url: string }>;
}

export { getDimensions };

/** Strip trailing slashes. */
export function trimBase(base: string): string {
  return base.replace(/\/+$/, "");
}

/** Best-effort error message from a failed upstream response. */
export async function errText(res: Response): Promise<string> {
  try {
    const t = await res.text();
    try {
      const j = JSON.parse(t) as { error?: { message?: string } | string };
      if (typeof j.error === "string") return j.error;
      if (j.error?.message) return j.error.message;
    } catch {
      /* not JSON */
    }
    return t || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}
```

- [ ] **Step 4: 改写 `openai.ts` 到新签名**

完整替换 `server/src/providers/formats/openai.ts`：

```typescript
import { fetchWithRetry } from "../http";
import {
  type FormatAdapter,
  type AdapterContext,
  type ImageParams,
  type EditOpts,
  getDimensions,
  trimBase,
  errText,
} from "./shared";

/** Build an OpenAI-style URL, tolerating a base that already ends with /v1. */
function v1(base: string, sub: string): string {
  const b = trimBase(base);
  return b.endsWith("/v1") ? b + sub : b + "/v1" + sub;
}

function authHeaders(key: string | null): Record<string, string> {
  return key ? { Authorization: `Bearer ${key}` } : {};
}

async function parseImageResponse(res: Response): Promise<{ url: string }> {
  const data = (await res.json()) as { data?: { url?: string; b64_json?: string }[] };
  const item = data?.data?.[0];
  if (item?.url) return { url: item.url };
  if (item?.b64_json) return { url: `data:image/png;base64,${item.b64_json}` };
  throw new Error("error_invalid_response");
}

export const openaiAdapter: FormatAdapter = {
  async generate(c: AdapterContext, params: ImageParams) {
    const { width, height } = getDimensions(params.aspectRatio, params.enableHD ?? false);
    const res = await fetchWithRetry(v1(c.apiUrl, "/images/generations"), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(c.secret) },
      body: JSON.stringify({ model: c.model.modelId, prompt: params.prompt, size: `${width}x${height}`, n: 1 }),
    });
    if (!res.ok) throw new Error(await errText(res));
    return parseImageResponse(res);
  },

  async edit(c: AdapterContext, images: Blob[], prompt: string, opts: EditOpts) {
    const form = new FormData();
    form.append("model", c.model.modelId);
    form.append("prompt", prompt);
    if (opts.width && opts.height) form.append("size", `${opts.width}x${opts.height}`);
    images.forEach((b) => form.append("image", b));
    const res = await fetchWithRetry(v1(c.apiUrl, "/images/edits"), {
      method: "POST",
      headers: { ...authHeaders(c.secret) }, // let fetch set multipart boundary
      body: form,
    });
    if (!res.ok) throw new Error(await errText(res));
    return parseImageResponse(res);
  },

  async text(c: AdapterContext, prompt: string, systemPrompt: string) {
    const res = await fetchWithRetry(v1(c.apiUrl, "/chat/completions"), {
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
};
```

- [ ] **Step 5: 改写 `claude.ts` 到新签名**

完整替换 `server/src/providers/formats/claude.ts`：

```typescript
import { fetchWithRetry } from "../http";
import { type FormatAdapter, type AdapterContext, trimBase } from "./shared";

/** Anthropic Claude — text only (no image generation/editing). */
export const claudeAdapter: FormatAdapter = {
  async generate() {
    throw new Error("format_no_image");
  },
  async edit() {
    throw new Error("format_no_image");
  },
  async text(c: AdapterContext, prompt: string, systemPrompt: string) {
    const b = trimBase(c.apiUrl);
    const url = b.endsWith("/v1") ? `${b}/messages` : `${b}/v1/messages`;
    const res = await fetchWithRetry(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
        ...(c.secret ? { "x-api-key": c.secret } : {}),
      },
      body: JSON.stringify({
        model: c.model.modelId,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) throw new Error("error_prompt_optimization_failed");
    const data = (await res.json()) as { content?: { type?: string; text?: string }[] };
    const text = Array.isArray(data?.content) ? data.content.map((p) => p?.text ?? "").join("") : "";
    return text || prompt;
  },
};
```

- [ ] **Step 6: 改写 `gemini.ts` 到新签名**

完整替换 `server/src/providers/formats/gemini.ts`：

```typescript
import { fetchWithRetry } from "../http";
import { type FormatAdapter, type AdapterContext, type ImageParams, trimBase, errText } from "./shared";

function generateContentUrl(base: string, model: string): string {
  const b = trimBase(base);
  const root = b.endsWith("/v1beta") ? b : `${b}/v1beta`;
  return `${root}/models/${model}:generateContent`;
}

function keyHeader(key: string | null): Record<string, string> {
  return key ? { "x-goog-api-key": key } : {};
}

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType?: string; data?: string };
  inline_data?: { mime_type?: string; data?: string };
}

async function parseImageResponse(res: Response): Promise<{ url: string }> {
  const data = (await res.json()) as { candidates?: { content?: { parts?: GeminiPart[] } }[] };
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  for (const p of parts) {
    const inline = p.inlineData ?? p.inline_data;
    const mime = (p.inlineData?.mimeType ?? p.inline_data?.mime_type) || "image/png";
    if (inline?.data) return { url: `data:${mime};base64,${inline.data}` };
  }
  throw new Error("error_invalid_response");
}

export const geminiAdapter: FormatAdapter = {
  async generate(c: AdapterContext, params: ImageParams) {
    const res = await fetchWithRetry(generateContentUrl(c.apiUrl, c.model.modelId), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...keyHeader(c.secret) },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: params.prompt }] }] }),
    });
    if (!res.ok) throw new Error(await errText(res));
    return parseImageResponse(res);
  },

  async edit(c: AdapterContext, images: Blob[], prompt: string) {
    const parts: GeminiPart[] = [{ text: prompt }];
    for (const img of images) {
      const b64 = Buffer.from(await img.arrayBuffer()).toString("base64");
      parts.push({ inlineData: { mimeType: img.type || "image/png", data: b64 } });
    }
    const res = await fetchWithRetry(generateContentUrl(c.apiUrl, c.model.modelId), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...keyHeader(c.secret) },
      body: JSON.stringify({ contents: [{ role: "user", parts }] }),
    });
    if (!res.ok) throw new Error(await errText(res));
    return parseImageResponse(res);
  },

  async text(c: AdapterContext, prompt: string, systemPrompt: string) {
    const res = await fetchWithRetry(generateContentUrl(c.apiUrl, c.model.modelId), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...keyHeader(c.secret) },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      }),
    });
    if (!res.ok) throw new Error("error_prompt_optimization_failed");
    const data = (await res.json()) as { candidates?: { content?: { parts?: GeminiPart[] } }[] };
    const parts = data?.candidates?.[0]?.content?.parts ?? [];
    const text = parts.map((p) => p.text ?? "").join("");
    return text || prompt;
  },
};
```

- [ ] **Step 7: 让 `customProviders.ts` 复用 shared 类型**

在 `server/src/services/customProviders.ts` 顶部 import 区（现有 `import type { CustomProviderRecord, ProviderFormat, UpdateCustomProviderInput } from "../repositories/types";` 之后）新增一行：

```typescript
import type { Capability, ModelDef } from "../providers/formats/shared";
```

然后把文件中部现有的本地定义：

```typescript
export type Capability = "image" | "edit" | "text";

export interface ProviderModelDef {
  modelId: string;
  name: string;
  capabilities: Capability[];
}
```

替换为：

```typescript
export type { Capability };

/** A provider's model definition (re-exported; gradio models carry a `gradio` block). */
export type ProviderModelDef = ModelDef;
```

> `ResolvedProvider.models` / `PublicProvider.models` 仍是 `ProviderModelDef[]`，现在等价于含可选 `gradio` 的 `ModelDef[]`，无需改动其它代码。

- [ ] **Step 8: 给 `models.ts` 的能力映射补 video/upscale**

在 `server/src/providers/models.ts` 中，把：

```typescript
export type ModelCapability = "image" | "edit" | "text";

const CAP_TO_TYPE: Record<ModelCapability, ModelType> = {
  image: "text2image",
  edit: "image2image",
  text: "text2text",
};
```

替换为：

```typescript
export type ModelCapability = "image" | "edit" | "text" | "video" | "upscale";

const CAP_TO_TYPE: Record<ModelCapability, ModelType> = {
  image: "text2image",
  edit: "image2image",
  text: "text2text",
  video: "image2video",
  upscale: "upscaler",
};
```

- [ ] **Step 9: 运行测试确认通过**

Run: `cd server && npx vitest run src/providers/formats/formats.test.ts`
Expected: PASS（3 个 describe 全绿）。

- [ ] **Step 10: 全量类型检查 + 测试**

Run: `cd server && npx tsc --noEmit && npx vitest run`
Expected: 编译通过；既有测试全绿（`dispatch.test.ts` 的现有用例因 dispatch 外部签名未变而仍通过）。

- [ ] **Step 11: 提交**

```bash
git add server/src/providers/formats/shared.ts server/src/providers/formats/openai.ts server/src/providers/formats/claude.ts server/src/providers/formats/gemini.ts server/src/services/customProviders.ts server/src/providers/models.ts server/src/providers/formats/formats.test.ts
git commit -m "refactor(server): unify adapter signature on AdapterContext + ModelDef"
```

---

## Task 2: Gradio 模板渲染纯函数

`renderTemplate`/`getByPath`/`extractUrl` 是 gradio 适配器的核心，纯函数、易单测，先单独实现。

**Files:**
- Create: `server/src/providers/formats/gradio.ts`
- Test: `server/src/providers/formats/gradio.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `server/src/providers/formats/gradio.test.ts`：

```typescript
import { describe, it, expect } from "vitest";
import { renderTemplate, getByPath, extractUrl } from "./gradio";

describe("renderTemplate", () => {
  it("substitutes $vars and leaves literals untouched", () => {
    const out = renderTemplate(["$prompt", "$height", "$width", "$steps", "$seed", false], {
      prompt: "a cat",
      height: 1024,
      width: 768,
      steps: 9,
      seed: 42,
    });
    expect(out).toEqual(["a cat", 1024, 768, 9, 42, false]);
  });

  it("recurses into nested arrays/objects (edit payload)", () => {
    const out = renderTemplate(["$imagePayload", "$prompt", 3], {
      imagePayload: [{ image: { path: "/tmp/x" }, caption: null }],
      prompt: "p",
    });
    expect(out).toEqual([[{ image: { path: "/tmp/x" }, caption: null }], "p", 3]);
  });

  it("throws on a missing variable", () => {
    expect(() => renderTemplate(["$prompt"], {})).toThrow("gradio_template_var_missing:prompt");
  });
});

describe("getByPath", () => {
  it("reads bracket + dot paths", () => {
    const root = { data: [{ url: "u0" }, 42] };
    expect(getByPath(root, "data[0].url")).toBe("u0");
    expect(getByPath(root, "data[1]")).toBe(42);
  });

  it("reads deeply nested array paths", () => {
    const root = { data: [[{ image: { url: "deep" } }]] };
    expect(getByPath(root, "data[0][0].image.url")).toBe("deep");
  });

  it("returns undefined for a broken path", () => {
    expect(getByPath({ data: [] }, "data[0].url")).toBeUndefined();
  });
});

describe("extractUrl", () => {
  it("handles {url}, {image:{url}}, array, and string shapes", () => {
    expect(extractUrl({ url: "a" })).toBe("a");
    expect(extractUrl({ image: { url: "b" } })).toBe("b");
    expect(extractUrl([{ image: { url: "c" } }])).toBe("c");
    expect(extractUrl("d")).toBe("d");
    expect(extractUrl({ video: { url: "v" } })).toBe("v");
    expect(extractUrl({})).toBeUndefined();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd server && npx vitest run src/providers/formats/gradio.test.ts`
Expected: FAIL（`./gradio` 不存在 / 函数未定义）。

- [ ] **Step 3: 创建 `gradio.ts` 的纯函数部分**

创建 `server/src/providers/formats/gradio.ts`：

```typescript
/**
 * Gradio format adapter — drives any Gradio Space from a DB-stored config
 * (baseUrl / fnIndex / triggerId / argsTemplate / outputPath). The args
 * template uses a tiny DSL: "$var" strings are substituted from runtime values,
 * everything else is passed through literally.
 */

/** Render a Gradio args template: "$var" → vars[var]; everything else literal. */
export function renderTemplate(template: unknown[], vars: Record<string, unknown>): unknown[] {
  return template.map((el) => renderValue(el, vars));
}

function renderValue(el: unknown, vars: Record<string, unknown>): unknown {
  if (typeof el === "string" && el.startsWith("$")) {
    const key = el.slice(1);
    if (!(key in vars)) throw new Error(`gradio_template_var_missing:${key}`);
    return vars[key];
  }
  if (Array.isArray(el)) return el.map((x) => renderValue(x, vars));
  if (el && typeof el === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(el as Record<string, unknown>)) out[k] = renderValue(v, vars);
    return out;
  }
  return el;
}

/** Read a value from a nested object by a path like "data[0].image.url". */
export function getByPath(root: unknown, path: string): unknown {
  const keys = path.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
  let cur: unknown = root;
  for (const k of keys) {
    if (cur == null) return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

/** Extract an image/file/video url from common Gradio output shapes. */
export function extractUrl(first: unknown): string | undefined {
  if (Array.isArray(first) && (first[0] as { image?: { url?: string } })?.image?.url) {
    return (first[0] as { image: { url: string } }).image.url;
  }
  const f = first as { image?: { url?: string }; url?: string; video?: { url?: string } };
  if (f?.image?.url) return f.image.url;
  if (f?.video?.url) return f.video.url;
  if (f?.url) return f.url;
  if (typeof first === "string") return first;
  return undefined;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd server && npx vitest run src/providers/formats/gradio.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add server/src/providers/formats/gradio.ts server/src/providers/formats/gradio.test.ts
git commit -m "feat(server): gradio template-rendering helpers (renderTemplate/getByPath/extractUrl)"
```

---

## Task 3: Gradio 适配器 + 注册到 ADAPTERS

**Files:**
- Modify: `server/src/providers/formats/gradio.ts`（追加 adapter）
- Modify: `server/src/repositories/types.ts`（`ProviderFormat += 'gradio'`）
- Modify: `server/src/providers/formats/index.ts`（注册）
- Test: `server/src/providers/formats/gradio.test.ts`（追加 adapter 测试）

- [ ] **Step 1: 追加失败测试**

在 `server/src/providers/formats/gradio.test.ts` 顶部 import 改为：

```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderTemplate, getByPath, extractUrl } from "./gradio";
import { ADAPTERS } from "./index";
import type { AdapterContext, ModelDef } from "./shared";

vi.mock("../gradio", () => ({
  runGradioTask: vi.fn(),
  uploadToGradio: vi.fn(),
  makeSessionHash: () => "sess-hash",
}));
import { runGradioTask, uploadToGradio } from "../gradio";
```

在文件末尾追加：

```typescript
describe("Gradio format adapter", () => {
  afterEach(() => vi.restoreAllMocks());

  function gradioCtx(): AdapterContext {
    const model: ModelDef = {
      modelId: "z-image-turbo",
      name: "Z-Image Turbo",
      capabilities: ["image"],
      gradio: {
        baseUrl: "https://space.hf.space",
        fnIndex: 2,
        triggerId: 16,
        argsTemplate: ["$prompt", "$height", "$width", "$steps", "$seed", false],
        stepsDefault: 9,
        outputPath: "data[0]",
        seedPath: "data[1]",
      },
    };
    return { apiUrl: "", secret: null, model };
  }

  it("generate renders the template, calls the Space, and parses url + seed", async () => {
    (runGradioTask as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [{ url: "https://hf/out.png" }, 777] });

    const res = await ADAPTERS.gradio.generate!(gradioCtx(), { prompt: "a cat", aspectRatio: "1:1", seed: 42, steps: 9 });

    expect(res.url).toBe("https://hf/out.png");
    expect(res.seed).toBe(777); // read back from seedPath data[1]
    const [baseUrl, data, fnIndex, triggerId] = (runGradioTask as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(baseUrl).toBe("https://space.hf.space");
    expect(fnIndex).toBe(2);
    expect(triggerId).toBe(16);
    expect(data).toEqual(["a cat", expect.any(Number), expect.any(Number), 9, 42, false]);
  });

  it("upscale uploads the image then drives the Space", async () => {
    (uploadToGradio as ReturnType<typeof vi.fn>).mockResolvedValue("/tmp/up.png");
    (runGradioTask as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [{ url: "https://hf/big.png" }] });

    const ctx: AdapterContext = {
      apiUrl: "",
      secret: null,
      model: {
        modelId: "RealESRGAN_x4plus",
        name: "Upscaler",
        capabilities: ["upscale"],
        gradio: {
          baseUrl: "https://up.hf.space",
          fnIndex: 1,
          triggerId: 17,
          argsTemplate: ["$imageFile", "RealESRGAN_x4plus", 0.5, false, 4],
          outputPath: "data[0].url",
        },
      },
    };

    const res = await ADAPTERS.gradio.upscale!(ctx, new Blob([new Uint8Array([1, 2, 3])]));
    expect(res.url).toBe("https://hf/big.png");
    expect(uploadToGradio as ReturnType<typeof vi.fn>).toHaveBeenCalled();
    const [, data] = (runGradioTask as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(data[0]).toEqual({ path: "/tmp/up.png", meta: { _type: "gradio.FileData" } });
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd server && npx vitest run src/providers/formats/gradio.test.ts`
Expected: FAIL（`ADAPTERS.gradio` 不存在 / `gradioAdapter` 未定义）。

- [ ] **Step 3: 在 `gradio.ts` 顶部加 import**

在 `server/src/providers/formats/gradio.ts` 文件最顶部（文件块注释之后、`renderTemplate` 之前）插入：

```typescript
import { getDimensions } from "../dimensions";
import { runGradioTask, uploadToGradio, makeSessionHash } from "../gradio";
import { runWithTokenRetry } from "../tokenRetry";
import type { FormatAdapter, AdapterContext, ImageParams, EditOpts, VideoOpts, ImageResult } from "./shared";
```

- [ ] **Step 4: 在 `gradio.ts` 末尾追加适配器**

在 `server/src/providers/formats/gradio.ts` 文件末尾追加：

```typescript
const QUOTA = { optional: true as const, exhaustedError: "error_quota_exhausted" };

function randomSeed(): number {
  return Math.round(Math.random() * 2147483647);
}

/** Split a comma-separated secret into a token list for rotation (empty => []). */
function splitSecret(secret: string | null): string[] {
  return secret ? secret.split(",").map((s) => s.trim()).filter(Boolean) : [];
}

function fileData(path: string) {
  return { path, meta: { _type: "gradio.FileData" } };
}

export const gradioAdapter: FormatAdapter = {
  async generate(c: AdapterContext, params: ImageParams): Promise<ImageResult> {
    const g = c.model.gradio;
    if (!g) throw new Error("gradio_config_missing");
    const { width, height } = getDimensions(params.aspectRatio, params.enableHD ?? false);
    const seed = params.seed ?? randomSeed();
    const vars: Record<string, unknown> = {
      prompt: params.prompt,
      seed,
      width,
      height,
      steps: params.steps ?? g.stepsDefault ?? 9,
      guidance: params.guidance ?? g.guidanceDefault ?? 4,
      aspectRatio: params.aspectRatio,
      negativePrompt: g.negativePrompt ?? "",
    };
    const data = renderTemplate(g.argsTemplate, vars);
    const out = await runWithTokenRetry(splitSecret(c.secret), QUOTA, (token) =>
      runGradioTask<{ data: unknown[] }>(g.baseUrl, data, g.fnIndex, g.triggerId, token, makeSessionHash()),
    );
    const url = extractUrl(getByPath(out, g.outputPath));
    if (!url) throw new Error("error_invalid_response");
    const back = g.seedPath ? getByPath(out, g.seedPath) : seed;
    return { url, seed: typeof back === "number" ? back : seed, steps: vars.steps as number, guidance: params.guidance };
  },

  async edit(c: AdapterContext, images: Blob[], prompt: string, opts: EditOpts) {
    const g = c.model.gradio;
    if (!g) throw new Error("gradio_config_missing");
    const width = opts.width ?? 1024;
    const height = opts.height ?? 1024;
    const seed = randomSeed();
    return runWithTokenRetry(splitSecret(c.secret), QUOTA, async (token) => {
      const imagePayload = await Promise.all(
        images.map(async (b) => ({ image: fileData(await uploadToGradio(g.baseUrl, b, token)), caption: null })),
      );
      const vars: Record<string, unknown> = {
        imagePayload,
        prompt,
        seed,
        width,
        height,
        steps: opts.steps ?? g.stepsDefault ?? 4,
        guidance: opts.guidance ?? g.guidanceDefault ?? 1,
        negativePrompt: g.negativePrompt ?? "",
      };
      const out = await runGradioTask<{ data: unknown[] }>(
        g.baseUrl,
        renderTemplate(g.argsTemplate, vars),
        g.fnIndex,
        g.triggerId,
        token,
        makeSessionHash(),
      );
      const url = extractUrl(getByPath(out, g.outputPath));
      if (!url) throw new Error("error_invalid_response");
      return { url };
    });
  },

  async video(c: AdapterContext, image: Blob, opts: VideoOpts) {
    const g = c.model.gradio;
    if (!g) throw new Error("gradio_config_missing");
    const seed = opts.seed ?? 42;
    return runWithTokenRetry(splitSecret(c.secret), QUOTA, async (token) => {
      const imageFile = fileData(await uploadToGradio(g.baseUrl, image, token));
      const vars: Record<string, unknown> = {
        imageFile,
        prompt: opts.prompt,
        steps: opts.steps,
        duration: opts.duration,
        guidance: opts.guidance,
        seed,
        negativePrompt: g.negativePrompt ?? "",
      };
      const out = await runGradioTask<{ data: unknown[] }>(
        g.baseUrl,
        renderTemplate(g.argsTemplate, vars),
        g.fnIndex,
        g.triggerId,
        token,
        makeSessionHash(),
      );
      const url = extractUrl(getByPath(out, g.outputPath));
      if (!url) throw new Error("error_invalid_response");
      return { url };
    });
  },

  async upscale(c: AdapterContext, image: Blob) {
    const g = c.model.gradio;
    if (!g) throw new Error("gradio_config_missing");
    return runWithTokenRetry(splitSecret(c.secret), QUOTA, async (token) => {
      const imageFile = fileData(await uploadToGradio(g.baseUrl, image, token));
      const out = await runGradioTask<{ data: unknown[] }>(
        g.baseUrl,
        renderTemplate(g.argsTemplate, { imageFile }),
        g.fnIndex,
        g.triggerId,
        token,
        makeSessionHash(),
      );
      const url = extractUrl(getByPath(out, g.outputPath));
      if (!url) throw new Error("error_upscale_failed");
      return { url };
    });
  },
};
```

> Gradio 不实现 `text`（提示词优化由 openai 格式的 Pollinations provider 承担，阶段2 seed）。

- [ ] **Step 5: `ProviderFormat` 增加 gradio**

在 `server/src/repositories/types.ts` 中把：

```typescript
export type ProviderFormat = "openai" | "claude" | "gemini";
```

替换为：

```typescript
export type ProviderFormat = "openai" | "claude" | "gemini" | "gradio";
```

- [ ] **Step 6: 注册到 ADAPTERS**

完整替换 `server/src/providers/formats/index.ts`：

```typescript
import type { ProviderFormat } from "../../repositories/types";
import { type FormatAdapter, type ImageParams } from "./shared";
import { openaiAdapter } from "./openai";
import { claudeAdapter } from "./claude";
import { geminiAdapter } from "./gemini";
import { gradioAdapter } from "./gradio";

export type { FormatAdapter, ImageParams };

/** Format → client. Used by the generation dispatch to talk to custom/relay endpoints. */
export const ADAPTERS: Record<ProviderFormat, FormatAdapter> = {
  openai: openaiAdapter,
  claude: claudeAdapter,
  gemini: geminiAdapter,
  gradio: gradioAdapter,
};
```

- [ ] **Step 7: 运行确认通过 + 全量检查**

Run: `cd server && npx vitest run src/providers/formats/gradio.test.ts && npx tsc --noEmit`
Expected: gradio.test 全绿；编译通过。

- [ ] **Step 8: 提交**

```bash
git add server/src/providers/formats/gradio.ts server/src/providers/formats/gradio.test.ts server/src/repositories/types.ts server/src/providers/formats/index.ts
git commit -m "feat(server): gradio format adapter + register in ADAPTERS"
```

---

## Task 4: dispatch 重构（自定义 provider 走能力路由）

**Files:**
- Modify: `server/src/providers/index.ts`
- Test: `server/src/providers/dispatch.test.ts`

- [ ] **Step 1: 追加失败测试（gradio dispatch 用例）**

在 `server/src/providers/dispatch.test.ts` 顶部 import 区追加 mock 与导入（放在现有 `import` 之后）：

```typescript
vi.mock("./gradio", () => ({
  runGradioTask: vi.fn().mockResolvedValue({ data: [{ url: "https://hf/g.png" }, 555] }),
  uploadToGradio: vi.fn().mockResolvedValue("/tmp/x"),
  makeSessionHash: () => "h",
}));
```

在文件末尾、最后一个 `});`（describe 收尾）之前追加一个新用例（即放进现有 `describe("generation dispatch — custom providers", ...)` 块内）：

```typescript
  it("routes a global gradio provider's model through the gradio adapter", async () => {
    const ctx = buildTestContext();
    const alice = (await seedUser(ctx, { username: "alice", password: "pw" })).id;
    const p = await createGlobalProvider(ctx, {
      name: "HF",
      apiUrl: "",
      format: "gradio",
      models: [
        {
          modelId: "z-image-turbo",
          name: "Z-Image Turbo",
          capabilities: ["image"],
          gradio: {
            baseUrl: "https://space.hf.space",
            fnIndex: 2,
            triggerId: 16,
            argsTemplate: ["$prompt", "$height", "$width", "$steps", "$seed", false],
            stepsDefault: 9,
            outputPath: "data[0]",
            seedPath: "data[1]",
          },
        },
      ],
      secret: null,
    });

    const res = await dispatchGenerate(ctx, alice, `${p.id}:z-image-turbo`, {
      prompt: "a cat",
      aspectRatio: "1:1",
      seed: 42,
    });

    expect(res.url).toBe("https://hf/g.png");
    expect(res.seed).toBe(555);
  });

  it("rejects an unknown model id on a custom provider", async () => {
    const ctx = buildTestContext();
    const alice = (await seedUser(ctx, { username: "alice", password: "pw" })).id;
    const p = await createGlobalProvider(ctx, {
      name: "Relay", apiUrl: "https://relay", format: "openai",
      models: [{ modelId: "img-1", name: "Img", capabilities: ["image"] }], secret: "sk-1",
    });
    await expect(
      dispatchGenerate(ctx, alice, `${p.id}:nope`, { prompt: "x", aspectRatio: "1:1" }),
    ).rejects.toThrow("MODEL_NOT_FOUND");
  });
```

> `createGlobalProvider` 的 `models` 现在接受带 `gradio` 块的 `ModelDef`（Task 1 已让 `ProviderModelDef = ModelDef`）。

- [ ] **Step 2: 运行确认失败**

Run: `cd server && npx vitest run src/providers/dispatch.test.ts`
Expected: FAIL（gradio 用例：现有 dispatch 对自定义 provider 仍用旧 `(apiUrl, secret, modelId, params)` 调用，gradio 走不通；`MODEL_NOT_FOUND` 也未实现）。

- [ ] **Step 3: 重写 `providers/index.ts`**

完整替换 `server/src/providers/index.ts`：

```typescript
import type { AppContext } from "../context";
import type { ProviderId } from "../services/userConfig";
import { getProviderTokens } from "../services/userConfig";
import { resolveForUse } from "../services/customProviders";
import { parseModelId } from "./models";
import { ADAPTERS } from "./formats/index";
import type { AdapterContext, EditOpts, FormatAdapter, ImageParams, VideoOpts } from "./formats/shared";
import {
  generateHF,
  editHF,
  optimizeHF,
  upscaleHF,
  videoHF,
  type GenerateResult,
} from "./huggingface";

/**
 * Provider dispatch for the generation proxy.
 *
 *  - "huggingface"          -> the ported HF engine (kept until phase 5 cleanup)
 *  - other builtin names    -> not supported (removed once seeded) -> provider_not_supported
 *  - anything else (a UUID) -> a custom/global provider, routed by its stored
 *                              format (openai / claude / gemini / gradio) via ADAPTERS,
 *                              selecting the adapter method by the model's capability.
 */

const BUILTINS: ProviderId[] = ["huggingface", "gitee", "modelscope", "a4f", "openai", "google"];
const HF: ProviderId = "huggingface";

function isBuiltin(provider: string): boolean {
  return (BUILTINS as string[]).includes(provider);
}

async function tokensFor(ctx: AppContext, userId: number, provider: string): Promise<string[]> {
  if (!isBuiltin(provider)) return [];
  return getProviderTokens(ctx, userId, provider as ProviderId);
}

/** Resolve a custom provider + the selected model + verify the capability exists. */
async function resolveCustom(
  ctx: AppContext,
  userId: number,
  qualifiedModel: string,
  cap: keyof FormatAdapter,
): Promise<{ c: AdapterContext; adapter: FormatAdapter }> {
  const { provider, modelId } = parseModelId(qualifiedModel);
  const cp = await resolveForUse(ctx, userId, provider);
  const model = cp.models.find((m) => m.modelId === modelId);
  if (!model) throw new Error("MODEL_NOT_FOUND");
  const adapter = ADAPTERS[cp.format];
  if (!adapter[cap]) throw new Error(`capability_not_supported:${String(cap)}`);
  return { c: { apiUrl: cp.apiUrl, secret: cp.secret, model }, adapter };
}

export async function dispatchGenerate(
  ctx: AppContext,
  userId: number,
  qualifiedModel: string,
  params: ImageParams,
): Promise<GenerateResult> {
  const { provider, modelId } = parseModelId(qualifiedModel);
  if (provider === HF) return generateHF(modelId, params, await tokensFor(ctx, userId, provider));
  if (isBuiltin(provider)) throw new Error("provider_not_supported");

  const { c, adapter } = await resolveCustom(ctx, userId, qualifiedModel, "generate");
  const r = await adapter.generate!(c, params);
  return {
    id: crypto.randomUUID(),
    url: r.url,
    seed: r.seed ?? params.seed,
    steps: r.steps ?? params.steps,
    guidance: r.guidance ?? params.guidance,
  };
}

export async function dispatchEdit(
  ctx: AppContext,
  userId: number,
  qualifiedModel: string,
  images: Blob[],
  prompt: string,
  opts: EditOpts,
): Promise<{ id: string; url: string; seed?: number }> {
  const { provider } = parseModelId(qualifiedModel);
  if (provider === HF) return editHF(images, prompt, opts, await tokensFor(ctx, userId, provider));
  if (isBuiltin(provider)) throw new Error("provider_not_supported");

  const { c, adapter } = await resolveCustom(ctx, userId, qualifiedModel, "edit");
  const { url } = await adapter.edit!(c, images, prompt, opts);
  return { id: crypto.randomUUID(), url };
}

export async function dispatchText(
  ctx: AppContext,
  userId: number,
  qualifiedModel: string,
  prompt: string,
  systemPrompt: string,
): Promise<string> {
  const { provider, modelId } = parseModelId(qualifiedModel);
  if (provider === HF) return optimizeHF(prompt, systemPrompt, modelId);
  if (isBuiltin(provider)) throw new Error("provider_not_supported");

  const { c, adapter } = await resolveCustom(ctx, userId, qualifiedModel, "text");
  return adapter.text!(c, prompt, systemPrompt);
}

/** HD upscale — HuggingFace (RealESRGAN) or a custom provider whose format supports upscale. */
export async function dispatchUpscale(
  ctx: AppContext,
  userId: number,
  qualifiedModel: string,
  image: Blob,
): Promise<{ url: string }> {
  const { provider } = parseModelId(qualifiedModel);
  if (provider === HF) return upscaleHF(image, await tokensFor(ctx, userId, provider));
  if (isBuiltin(provider)) throw new Error("provider_not_supported");

  const { c, adapter } = await resolveCustom(ctx, userId, qualifiedModel, "upscale");
  return adapter.upscale!(c, image);
}

/** Image→video (Live). HuggingFace (Wan 2.2, sync via Gradio) or a custom provider. */
export async function dispatchVideo(
  ctx: AppContext,
  userId: number,
  qualifiedModel: string,
  image: Blob,
  opts: VideoOpts,
): Promise<{ url: string }> {
  const { provider } = parseModelId(qualifiedModel);
  if (provider === HF) return videoHF(image, opts, await tokensFor(ctx, userId, provider));
  if (isBuiltin(provider)) throw new Error("provider_not_supported");

  const { c, adapter } = await resolveCustom(ctx, userId, qualifiedModel, "video");
  return adapter.video!(c, image, opts);
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd server && npx vitest run src/providers/dispatch.test.ts`
Expected: PASS（含新 gradio 用例与 MODEL_NOT_FOUND 用例；原有 openai/claude/拒绝/gitee-not-supported 用例仍绿）。

- [ ] **Step 5: 全量类型检查 + 测试**

Run: `cd server && npx tsc --noEmit && npx vitest run`
Expected: 编译通过；server 全部测试绿。

- [ ] **Step 6: 提交**

```bash
git add server/src/providers/index.ts server/src/providers/dispatch.test.ts
git commit -m "refactor(server): dispatch custom providers via capability routing (gradio/openai/claude/gemini)"
```

---

## 阶段 1 完成标准

- `cd server && npx tsc --noEmit` 通过，`npx vitest run` 全绿。
- `ADAPTERS` 含 `gradio`；自定义 provider 的 generate/edit/text/video/upscale 均按模型能力路由，缺失能力抛 `capability_not_supported:<cap>`，未知模型抛 `MODEL_NOT_FOUND`。
- HuggingFace（`huggingface:*`）与既有 openai/claude/gemini 自定义 provider 行为不变（向后兼容）。
- 尚未改动：DB 数据（无 seed）、前端、admin UI、per-user 配置、浏览器直连 —— 留待阶段 2–5。

## 后续阶段（在本阶段验证通过后各自规划）

- **阶段 2**：migration `003`（DB `format` 枚举加 `gradio`）、`seed.ts`（7 条全局 provider，附录 A）、bootstrap 幂等插入、§13 现有运行时数据迁移、openai 适配器的 `chatPath/imagePath` 覆盖（Pollinations `/openai`）。
- **阶段 3**：`ProvidersManager` 支持 gradio 全表单；`AdminView` 移除 per-user 配置与路由。
- **阶段 4**：锁定 `serviceMode=server`、删 6 个直连 service、精简 `constants.ts`、模型选择走 `/api/v1/models`、清理 `local/hydration` 分支。
- **阶段 5**：移除 HF 旧路径（`huggingface.ts` 写死逻辑、`models.ts` 的 `REGISTRY`、dispatch HF 特判）、死代码清理、全量回归与手动验证（§12）。
