# 统一数据库驱动的 API 接口配置（移除浏览器直连与 per-user 配置）· 设计文档

> 日期：2026-06-04 ｜ 建议分支：feature/unified-db-providers ｜ 状态：已与用户确认方向，待 review
> 关联记忆：[[multi-user-mysql-phases]]、[[docker-deployment-external-mysql]]
> 前序：[2026-06-04-admin-only-api-providers-design.md](2026-06-04-admin-only-api-providers-design.md)（上一期移除用户自助配置；本期把"内置写死 + 浏览器直连"也统一进数据库）

## 1. 背景与目标

项目原本是「纯前端、浏览器直连各家 API」的应用，后来加上多用户 + server 代理，导致 provider/模型配置散落在**五个互相打架的地方**：前端写死映射（`constants.ts`）、浏览器直连代码（`services/*Service.ts`）、per-user token（`user_settings`）、server 半成品（`dispatch` 对非 HF 内置直接报错）、数据库自定义接口（`custom_providers`）。

**目标**：把这一切收敛到**唯一的真相源——`custom_providers` 数据库表**。admin 在一处配置所有 AI 接口与模型，配一次全员可用、随时增删改，代码里不再写死任何 provider/模型；普通用户只选择、不配置；现有写死配置作为初始数据 seed 进数据库。

## 2. 需求确认（来自用户的四个决策）

1. **统一配置**：所有 provider/模型进数据库，admin 一处管理。
2. **连 HF 也全表单可编辑**：HuggingFace 的 Gradio 底层参数（地址、fn_index、参数数组模板、输出路径）全部可在 admin 界面编辑，并可可视化新增任意 Gradio Space。
3. **彻底移除浏览器直连**：删除 `local/hydration` 模式、`services/` 6 个直连服务、`constants.ts` 写死映射，只走 server。
4. **seed 现有配置**：HF 9 模型、OpenAI/Google 默认端点、gitee/modelscope/a4f 的地址与模型，作为初始数据写进数据库（admin 可改可删）。

## 3. 现状（已核实代码）

### 3.1 两条并存的生成路径（由 `serviceMode` 决定，admin 锁定）

- `local`：浏览器用 `services/{hf,gitee,ms,a4f,openai,google}Service.ts` **直连**各家 API，用 `constants.ts` 的 `API_MODEL_MAP` 映射模型名，token 暴露在浏览器 → 6 家全可用。
- `server`：经 `/api/v1/*` → `server/src/providers/index.ts` 的 `dispatch*`。**只移植了 HuggingFace（Gradio）+ `custom_providers`（ADAPTERS）**；`gitee/modelscope/a4f/openai/google` 一律 `throw "provider_not_supported"`（`index.ts:46`）。
- `hydration`：两条都走。

### 3.2 已经可用、且正是目标形态的机制

- 表 `custom_providers`（`002_custom_providers.sql`）：`id, scope(global|user), owner_user_id, managed_by(admin|self), name, api_url, format(openai|claude|gemini), models_json, secret_encrypted, enabled`。
- `services/customProviders.ts`：`resolveForUse`（按 id 解密 secret、放行 global/own）、`effectiveForUse`（聚合 global + own enabled）。
- `providers/formats/`：`openai/claude/gemini` 三个 `FormatAdapter`（`index.ts` 的 `ADAPTERS`）。
- admin 侧 `ProvidersManager` + `/api/admin/providers`（`requireAdmin`）。

### 3.3 待消化的写死点

- `constants.ts`：`API_MODEL_MAP`、`{HF,GITEE,MS,A4F}_MODEL_OPTIONS`、`PROVIDER_OPTIONS`、`{EDIT,LIVE,TEXT,UPSCALER}_MODELS`、`getModelConfig/getGuidanceScaleConfig`。
- `server/src/providers/huggingface.ts`：9 个 HF Space 的 URL、每模型的 `fn_index/trigger_id/参数数组/输出解析`。
- `server/src/providers/models.ts`：`REGISTRY`（HF 模型硬编码）、`TOKEN_OPTIONAL_PROVIDERS`、`availableModels`。
- `server/src/services/userConfig.ts`：per-user `tokens`、`openaiConfig`、`googleConfig`、`customProviderTokens` 及 `getProviderTokens/getCustomProviderWithToken`。
- `components/admin/UserConfigEditor.tsx`：admin 给单用户配 token + openai/google 端点。

## 4. 目标架构（采用方案 A）

**扩展现有 `custom_providers`，HuggingFace 作为 `format='gradio'` 的记录。** 所有 provider 共用一张表、一套 dispatch、一套 admin 界面，复用 `resolveForUse / ADAPTERS / ProvidersManager`。

> 备选（已否决）：B 新建独立 `gradio_providers` 表（admin 要两处配、dispatch 分叉，违背"统一"）；C 推倒重来设计全新通用表（要迁移现有数据、风险与工作量最大）。

## 5. 统一数据模型

### 5.1 Provider 记录

- `format` 扩展为 `'openai' | 'claude' | 'gemini' | 'gradio'`。
- **HTTP 类（openai/claude/gemini）**：`apiUrl` 是 provider 级、共享一个 `secret`，`models_json = [{ modelId, name, capabilities }]`。
- **Gradio 类**：每个模型是独立 Space，端点落在**模型级**，`models_json` 每项扩展（见 5.2）。
- `scope` 本期只产出 `global`（不再创建 user-scope）；`owner_user_id/managed_by` 字段保留、走 admin-only。

### 5.2 Gradio per-model 参数 + 参数模板 DSL

`models_json` 中每个 gradio 模型：

```json
{
  "modelId": "z-image-turbo",
  "name": "Z-Image Turbo",
  "capabilities": ["image"],
  "gradio": {
    "baseUrl": "https://mrfakename-z-image-turbo.hf.space",
    "fnIndex": 2,
    "triggerId": 16,
    "argsTemplate": ["$prompt", "$height", "$width", "$steps", "$seed", false],
    "stepsDefault": 9,
    "outputPath": "data[0]",
    "seedPath": "data[1]"
  }
}
```

**参数模板 DSL**：`argsTemplate` 是数组，`$` 开头的字符串是变量占位符，其余字面量（`false/3/字符串/嵌套对象`）原样传入。

- 标量变量：`$prompt $seed $width $height $steps $guidance $aspectRatio $negativePrompt $duration`。
- 文件变量：`$imageFile`（替换为 `{path, meta:{_type:"gradio.FileData"}}`）、`$imagePayload`（替换为 `[{image:{path,meta},caption:null}, ...]`，用于 qwen-image-edit）。
- 缺省：`stepsDefault/guidanceDefault` 提供模型默认值（对应现有 `steps ?? 9` 等）。
- 取值路径：`outputPath` 描述从返回 `data` 取 url（支持 `data[0]`、`data[0].url`、`data[0][0].image.url`），`seedPath` 可选（z-image-turbo 从 `data[1]` 回读 seed）；`$negativePrompt` 的常量值（z-image 系列、视频）随模型存为模板里的字面量字符串。

> 该 DSL 能精确表达现有全部 5 个文生图 + edit + video + upscale 调用（确切值见附录 A）。

### 5.3 适配器接口与能力路由

- `FormatAdapter` 方法改为**可选**并补 `video?`、`upscale?`：`generate? / edit? / text? / video? / upscale?`。
- 调用签名统一为接收 `{ provider, model, secret, params }`（HTTP 类用 `provider.apiUrl + model.modelId`；gradio 类用 `model.gradio.*`），以便同一 dispatch 同时驱动两类。
- 各适配器能力：`gradio` 实现全部；`openai/gemini` 实现 `generate/edit/text`；`claude` 仅 `text`。
- `openai` 适配器支持 provider 级可选端点路径覆盖（`chatPath`/`imagePath`，默认 `/v1/chat/completions`、`/v1/images/generations`），适配路径不同的 OpenAI 兼容服务（如 Pollinations 的 `/openai`）。
- dispatch 按目标模型的 `capabilities` 选择方法，缺失能力时返回明确错误（替代旧的 `provider_not_supported`）。

## 6. 调用引擎与 dispatch 重构

- 新增 `server/src/providers/formats/gradio.ts`：把 `huggingface.ts` 的逻辑通用化——
  1. `renderTemplate(argsTemplate, vars)`：按 5.2 规则把占位符替换为实参；
  2. 文件能力先 `uploadToGradio(baseUrl, blob, token)` 得到 path，再注入 `$imageFile/$imagePayload`；
  3. `runGradioTask(baseUrl, data, fnIndex, triggerId, token, makeSessionHash())`；
  4. 按 `outputPath/seedPath` 提取结果。
  - 复用现有 `gradio.ts`（`runGradioTask/uploadToGradio`）、`tokenRetry.ts`、`dimensions.ts`。
- `ADAPTERS` 增加 `gradio`。
- `providers/index.ts`（dispatch）：删除 `BUILTINS/isBuiltin/HF` 特判与对 `generateHF/editHF/...` 的直接调用；`dispatchGenerate/Edit/Text/Video/Upscale` 统一 `resolveForUse(ctx, userId, providerId)` → 取模型定义 → `ADAPTERS[format][capability](...)`。
- token：`resolveForUse` 把 `secret` 按逗号拆成多 key，gradio/openai 调用用 `runWithTokenRetry` 轮换；`secret` 为空时以 `null` 调用（保留 HF 免 key 公共配额）。

## 7. 数据迁移与 seed

- **migration `003_gradio_format.sql`**：`ALTER TABLE custom_providers MODIFY COLUMN format ENUM('openai','claude','gemini','gradio') NOT NULL;`（`models_json` 已是 `LONGTEXT`，无需改列）。
- **seed（幂等）**：在 bootstrap（迁移后）插入下列 **global** provider，仅当不存在同名 global 记录时插入（不覆盖 admin 后续改动）；`secret` 一律留空待 admin 填。确切数据见**附录 A**：
  1. `HuggingFace`（gradio）：8 个图像/编辑/视频/放大模型。
  2. `Pollinations`（openai）：`openai-fast` 文本模型（提示词优化，免 key）。
  3. `OpenAI`（openai）、4. `Google`（gemini）、5. `Gitee AI`（openai）、6. `ModelScope`（openai）、7. `A4F`（openai）。
- seed 数据集中在 `server/src/providers/seed.ts`（TS 常量），repository 提供 `findGlobalByName` 以判断幂等。

## 8. 前端 + admin 界面改动

- **`ProvidersManager` 增强**：`format` 选择含 `gradio`；
  - HTTP 类：provider 级 `apiUrl + secret`，模型行编辑 `modelId/name/capabilities`。
  - gradio 类（**全表单可编辑**）：模型行额外展开 `baseUrl / fnIndex / triggerId / argsTemplate(JSON 文本域，含格式校验) / stepsDefault / guidanceDefault / outputPath / seedPath / capabilities`；支持新增任意 Gradio 模型。
- **`AdminView` 简化**：移除 `UserConfigEditor` 区块与 per-user `ProvidersManager`（`listUserProviders/createUserProvider`），只保留**全局** `ProvidersManager`。用户详情仅保留账号管理（密码/角色/启停/删除）。
- **模型选择**：前端完全依赖 `/api/v1/models`（`customService.fetchServerModels`）动态获取；移除基于 `constants` + token 判断的拼装。
- **`serviceMode`**：锁定为 `server`；移除 `local/hydration` 分支（`useCreationGeneration`、`ControlPanel`、`ModelsTab`、`useSettingsForm`、`configStore`）。字段先固定为 `"server"`，残留字段后续清理。

## 9. 移除清单（直连 + per-user + 写死）

- 删 `services/`：`hfService.ts, giteeService.ts, msService.ts, a4fService.ts, openaiService.ts, googleService.ts`。保留 `customService/adminService/authService/configService/storageService/indexedDBStorage` 等。
- 精简 `constants.ts`：删 `API_MODEL_MAP`、`*_MODEL_OPTIONS`、`PROVIDER_OPTIONS`、`{EDIT,LIVE,TEXT,UPSCALER}_MODELS`、`getModelConfig/getGuidanceScaleConfig` 中仅服务直连的部分（保留仍被 server 模式 UI 使用的常量，如宽高比等——实现时逐一核对引用）。
- 后端 `userConfig.ts`：删 `tokens/customProviderTokens/openaiConfig/googleConfig`、`getProviderTokens/getCustomProviderWithToken`、`AdminConfigPatch.tokens/customProviders`、`PROVIDER_IDS`。保留 `language/model 选择/systemPrompt/translationPrompt/storage 偏好`。
- 后端 `providers/models.ts`：删 `REGISTRY/TOKEN_OPTIONAL_PROVIDERS/availableModels`；`/api/v1/models` 完全从 `effectiveForUser`（数据库）聚合。
- 后端 `providers/huggingface.ts`：逻辑迁入 `gradio.ts` 后删除（保留底层 `gradio.ts` 引擎）。
- 后端路由：移除 `/api/admin/users/:uid/providers`（per-user）；保留全局 `/api/admin/providers`。
- 前端 `services/providerService.ts`：删 per-user 函数，保留 admin 全局函数。
- 删除/更新相关测试（见 §11 各阶段）。

## 10. 安全与后果

- **全局共享 key**：移除 per-user token 后，gitee/openai 等是**全局一个 key、所有用户共享配额/计费**——这是"不单独给用户配"的直接含义，已与用户确认。
- **密钥不入浏览器**：彻底移除直连后，所有 API key 仅存于 server（AES-256-GCM）、永不下发前端，安全性提升。
- HF 免 key 公共配额仍可用（`secret` 留空）。

## 11. 分阶段实现计划

每阶段结束应可测、可回滚。

- **阶段 1 — 后端引擎**：扩展 `FormatAdapter`（可选方法 + video/upscale）、新增 `gradio` 适配器与模板渲染、重构 `dispatch` 统一走 ADAPTERS、按 capability 路由。单测：`gradio` 模板渲染 + 各能力 dispatch。
- **阶段 2 — seed + migration**：`003` migration、`seed.ts`、bootstrap 幂等插入、`findGlobalByName`。验证 server 模式下 HF/openai 等可生成。
- **阶段 3 — admin 界面**：`ProvidersManager` 支持 gradio 全表单；`AdminView` 移除 per-user 配置与路由。
- **阶段 4 — 前端统一 server + 移除直连**：锁定 `serviceMode`、删 6 个直连 service、精简 `constants`、模型选择走动态、清 `local/hydration` 分支。
- **阶段 5 — 清理 + 测试**：移除死代码、前后端 `npm test` 全绿、手动验证（见 §12）。

## 12. 验证

- 后端 `npm test`、前端 `npm test` 全绿。
- 手动（管理员）：在唯一的「全局接口」面板增删改 4 种格式的 provider；新增一个 gradio 模型并成功生成；改 HF 某 Space 地址即时生效。
- 手动（普通用户）：设置里只有「模型」选择、无任何 API 配置入口；能选到 admin 配的全部模型并成功生成/编辑/放大/视频/提示词优化；浏览器网络面板确认**不存在**对 hf.space / api.openai.com 等的直连请求（全部经 `/api/v1/*`）。
- 安全：普通用户调 `/api/admin/*` 与已删除的直连路径均被拒。

## 附录 A：seed 数据（从现有代码提取的确切值）

### A.1 HuggingFace（format=`gradio`，secret 空）

| modelId | capabilities | baseUrl | fnIndex | triggerId | argsTemplate | output / seed |
|---|---|---|---|---|---|---|
| z-image-turbo | image | https://mrfakename-z-image-turbo.hf.space | 2 | 16 | `[$prompt,$height,$width,$steps,$seed,false]` (stepsDefault 9) | data[0] / data[1] |
| z-image | image | https://mrfakename-z-image.hf.space | 2 | 18 | `[$prompt,$negativePrompt,$height,$width,$steps,$guidance,$seed,false]` (steps 30, guid 4) | data[0] |
| qwen-image | image | https://mcp-tools-qwen-image-fast.hf.space | 1 | 6 | `[$prompt,$seed,false,$aspectRatio,3,$steps]` (steps 8) | data[0] |
| ovis-image | image | https://aidc-ai-ovis-image-7b.hf.space | 2 | 5 | `[$prompt,$height,$width,$seed,$steps,4]` (steps 20) | data[0] |
| flux-1-schnell | image | https://black-forest-labs-flux-1-schnell.hf.space | 2 | 5 | `[$prompt,$seed,false,$width,$height,$steps]` (steps 4) | data[0].url |
| qwen-image-edit | edit | https://linoyts-qwen-image-edit-2511-fast.hf.space | 0 | 12 | `[$imagePayload,$prompt,$seed,false,$guidance,$steps,$height,$width,true]` (guid 1, steps 4) | data[0][0].image.url |
| wan2_2-i2v | video | https://fradeck619-wan2-2-fp8da-aoti-faster.hf.space | 0 | 16 | `[$imageFile,$prompt,$steps,$negativePrompt,$duration,$guidance,$guidance,$seed,false]` | data[0] (video.url/url/string) |
| RealESRGAN_x4plus | upscale | https://tuan2308-upscaler.hf.space | 1 | 17 | `[$imageFile,"RealESRGAN_x4plus",0.5,false,4]` | data[0].url |

> `$negativePrompt` 常量：z-image 系列 = `Z_IMAGE_NEGATIVE_PROMPT`；wan2_2 = `VIDEO_NEGATIVE_PROMPT`（值见 `huggingface.ts:22-25`，seed 时内联为模板字面量）。

### A.2 Pollinations（format=`openai`，secret 空）

- apiUrl：`https://text.pollinations.ai`；提示词优化模型 `openai-fast`（capabilities `["text"]`，name "OpenAI 4o mini"）经 openai 适配器的 `chatPath=/openai` 覆盖命中端点（见 §5.3），免 key。现状对应 `optimizeHF` POST `https://text.pollinations.ai/openai`（OpenAI chat 格式）。

### A.3 标准 HTTP provider（secret 空，admin 填）

| name | format | apiUrl（seed） | 模型（modelId → 上游名，见 `constants.ts:API_MODEL_MAP`） |
|---|---|---|---|
| OpenAI | openai | https://api.openai.com（沿用 `gpt-5.4` 默认 modelId，admin 应改为实际图像模型） | default→`gpt-5.4` |
| Google | gemini | https://generativelanguage.googleapis.com/v1beta | default→`gemini-3.1-flash-image-preview` |
| Gitee AI | openai | https://ai.gitee.com | z-image-turbo, qwen-image→Qwen-Image, flux-2→FLUX.2-dev, flux-1-schnell, flux-1-krea→FLUX_1-Krea-dev, flux-1→FLUX.1-dev；文本 deepseek-3_2→DeepSeek-V3.2, qwen-3→Qwen3-Next-80B-A3B-Instruct；编辑 qwen-image-edit→Qwen-Image-Edit |
| ModelScope | openai | https://api-inference.modelscope.cn | z-image-turbo→Tongyi-MAI/Z-Image-Turbo, z-image→Tongyi-MAI/Z-Image, flux-2→black-forest-labs/FLUX.2-dev, flux-1-krea, flux-1；文本 deepseek-3_2, qwen-3；编辑 qwen-image-edit→Qwen/Qwen-Image-Edit-2509 |
| A4F | openai | https://api.a4f.co | z-image-turbo→provider-8/z-image, imagen-4→provider-8/imagen-4, imagen-3.5→provider-4/imagen-3.5；文本 gemini-2.5-flash-lite, deepseek-v3.1, deepseek-r1, qwen-3, glm-4.5, kimi-k2 |

> 各模型的 `capabilities` 依 `constants.ts` 注释归类（image / edit / text）。gitee/modelscope/a4f 的视频任务（异步 task-status）原仅在浏览器直连实现，server 端 openai adapter 不含 video——本期这些 provider **不 seed video 能力**（如需，后续按 §5.3 扩展 openai adapter 的异步 video，列为范围外）。
