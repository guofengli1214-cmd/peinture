# 自定义 / 中转 API 接入（多格式：OpenAI / Claude / Gemini）· 设计文档

> 日期：2026-06-02 ｜ 分支：feature/multi-user-mysql ｜ 状态：已与用户确认，待实现
> 关联记忆：[[multi-user-mysql-phases]]、[[docker-deployment-external-mysql]]

## 1. 背景与目标

当前生成代理（Phase 6a）只内置 HuggingFace。用户希望能**自由接入任意平台 / 中转（relay）API**，并按**请求格式**区分 **OpenAI / Claude / Gemini**，用于：文生图、图像编辑、提示词优化（文本）。**视频不纳入本期**。

约束（沿用既有架构）：密钥经 AES-256-GCM 加密存库、**永不下发浏览器**、生成经后端代理。

## 2. 需求确认（来自用户）

- 能力：text2image、image edit、text（optimize）。video 暂不做。
- 格式：openai、claude（仅文本）、gemini。
- 归属与权限：
  - **全局**接口：管理员创建，所有用户可用。
  - **按用户**接口：管理员为某用户创建；该用户只读（不能改/删）。
  - **自建**接口：用户给自己创建；仅本人（及管理员）可改/删。
- 模型：手动填写 `模型ID + 名称 + 能力`（能力可多选：image / edit / text）。

## 3. 数据模型

新表 `custom_providers`（迁移 `002_custom_providers.sql`）：

| 列 | 说明 |
|---|---|
| `id` CHAR(36) PK | uuid |
| `scope` ENUM('global','user') | 归属类型 |
| `owner_user_id` INT NULL FK→users | scope=user 时为所属用户；global 时 NULL |
| `managed_by` ENUM('admin','self') | 谁能改/删：admin（全局或管理员代配）或 self（用户自建） |
| `name` VARCHAR(128) | 显示名 |
| `api_url` VARCHAR(1024) | base URL（容忍带/不带 `/v1`） |
| `format` ENUM('openai','claude','gemini') | 请求格式 |
| `models_json` LONGTEXT | `[{modelId, name, capabilities:['image'|'edit'|'text'][]}]` |
| `secret_encrypted` LONGTEXT | AES-GCM 加密的密钥（可空） |
| `enabled` TINYINT | 是否启用 |
| `created_at`,`updated_at` | 时间戳 |

索引：`(scope)`, `(owner_user_id)`。

> 不再把自定义接口塞进 `user_settings.config_json`；改用此独立表（三种归属 + 权限更清晰）。

## 4. 权限规则（服务层强制）

- **某用户可用接口** = `scope=global 且 enabled` ∪ `scope=user 且 owner=该用户 且 enabled`。
- **用户自助**（`/api/providers`）：
  - 列表：返回自己可用的全部（含 global / admin 配的 / 自建的），并带 `editable` 标志（仅 `managed_by=self 且 owner=自己` 为 true）。
  - 创建：强制 `scope=user, owner=自己, managed_by=self`。
  - 改/删：仅允许目标为 `managed_by=self 且 owner=自己`，否则 403。
- **管理员**：
  - `/api/admin/providers`：global 的增删改查。
  - `/api/admin/users/:id/providers`：为某用户增删改查（创建时 `scope=user, owner=:id, managed_by=admin`）。
  - 管理员可管理任意记录。

## 5. 后端格式适配器

`server/src/providers/formats/{openai,claude,gemini}.ts`，统一接口：
```
generate(base, key, modelId, params) -> {url}        // text2image
edit(base, key, modelId, images, prompt, opts) -> {url}
text(base, key, modelId, prompt, systemPrompt) -> string
```
- **openai**：`POST {base}/v1/images/generations`（body: model/prompt/size/n/response_format；取 data[0].url 或 b64→data:URL）；编辑 `POST {base}/v1/images/edits`（multipart）；文本 `POST {base}/v1/chat/completions`。鉴权 `Authorization: Bearer <key>`。
- **gemini**：`POST {base}/v1beta/models/{modelId}:generateContent`，header `x-goog-api-key: <key>`。文生图/编辑从 candidates parts 的 `inline_data`(base64) 取图→data:URL；文本取 parts.text。编辑把输入图作为 inline_data part。
- **claude**：仅 text：`POST {base}/v1/messages`，headers `x-api-key:<key>` + `anthropic-version:2023-06-01`，body {model,max_tokens,system,messages}；取 content[0].text。image/edit 不支持（调用即报 `format_no_image`）。
- 复用 `fetchWithRetry`（处理 stale-socket + 502/503/504）。base URL 规整：去尾部 `/`，若已以 `/v1` 结尾则 openai 路径不再重复加 `/v1`。

## 6. 调度与模型聚合

- **模型 id 方案**：自定义接口模型 id = `<providerId>:<modelId>`（providerId 是表里的 uuid）。`parseModelId` 已按首个 `:` 切分；内置 6 家名字不会与 uuid 冲突。
- `providers/index.ts` 调度：`provider` 是内置 6 家 → 原路径；否则按 uuid 从表加载该接口（base/format/key/owner 校验「该用户是否可用此接口」）→ 调对应格式适配器。
- `/api/v1/models`：内置 HF 注册表 + 该用户「可用接口」展开的模型（每个 `{modelId, name, capabilities}` → 一个或多个 client 模型，type 由 capability 映射：image→text2image、edit→image2image、text→text2text），id 用 `<providerId>:<modelId>`。

## 7. API 一览

- 用户自助：`GET /api/providers`、`POST /api/providers`、`PATCH /api/providers/:id`、`DELETE /api/providers/:id`（self 权限）。
- 管理员全局：`GET/POST /api/admin/providers`、`PATCH/DELETE /api/admin/providers/:id`。
- 管理员代配：`GET/POST /api/admin/users/:id/providers`、`PATCH/DELETE /api/admin/users/:id/providers/:pid`。
- 列表响应**不回显密钥**，仅返回 `hasSecret` 布尔。

## 8. 前端 UI

- `services/providerService.ts`：上述 CRUD（`credentials:'include'`）。
- 管理面板（AdminView）：
  - 顶部新增「全局接口」管理区（或独立标签）。
  - 用户详情里，在「配置」区下方新增「该用户的接口」管理。
- 设置弹窗：新增「接口 / Providers」标签，用户自助增删改自己的接口；global 与 admin 配的以只读列出。
- 复用一个 `ProviderForm` 组件（名称/URL/格式下拉/密钥/模型行编辑[modelId+名称+能力多选]/启用），管理面板与设置共用。
- 模型下拉：无需改动，已由 `/api/v1/models` 驱动。

## 9. 测试（TDD）

- 迁移与仓库：建表、按 scope/owner 查询、CRUD。
- 服务权限：可用接口合并、self 越权改/删被拒、admin 全权。
- 格式适配器：mock fetch 校验 URL/方法/头/体构造与响应解析（含 b64→data:URL）。
- 调度：`<uuid>:<model>` 路由到正确适配器；不可用接口拒绝；模型聚合输出正确 type。
- 路由集成（supertest + 内存仓库）：鉴权、权限、CRUD、/v1/models 含自定义模型。

## 10. 不在本期范围

- 视频（图生视频）通过自定义接口。
- 自定义鉴权头/额外 header（如需可后续加 `extra_headers` 字段）。
- 自动从 `/v1/models` 拉取模型（本期手动填写）。

## 11. 实施顺序（高层）

1. 迁移 `002` + 仓库 + 类型。
2. 服务层（加解密、权限、可用接口合并）+ 单测。
3. 格式适配器 ×3 + 单测。
4. 调度与 `/api/v1/models` 聚合改造 + 单测。
5. 路由：用户自助 + 管理员（全局/代配）+ 集成测试。
6. 前端 `providerService` + 共用 `ProviderForm` + 管理面板与设置接入。
7. 构建/测试/部署联调（用一个真实中转或 OpenAI/Gemini key 实测一次）。
