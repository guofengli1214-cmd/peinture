# 统一 Provider（阶段 5：清理收尾 —— 删 HF 旧路径 + 孤儿 + 前端 builtin 残留）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development，逐 task 执行。Steps 用 `- [ ]`。
> **Git safety（强制）：** 不得 `git checkout/switch/reset/stash/restore/rebase`；只用只读 `git diff/show/log`。分支 `feature/unified-db-providers`（基于 Phase 4 tip `4c55c22`）。
> **⚠️ Task 3 风险：** 删 server HF 旧路径后 HF 出图改走 `gradioAdapter`（理论等价 `generateHF`：参数 Phase 2 已核对、复用同 `runGradioTask` 引擎、`renderTemplate` 输出=generateHF data；风险较低）。**删后必须 docker 验证 HF 出图**。Task 顺序：①孤儿(零风险) → ②默认 provider/残留 → ③删 HF 旧路径(最后)。

**Goal:** 删除所有遗留：孤儿的 per-user config 代码、Phase 4 carry-forward 的前端 builtin 残留、server 端 HF 旧路径（dispatch HF 特判 + REGISTRY + huggingface.ts）。完成后 provider/模型完全由数据库驱动，无任何写死的内置 provider 路径。

**Tech Stack:** TS, Express, vitest (server) + React, vitest (web).

参考：记忆 `unified-db-providers-refactor`（Phase 5 勘察含确切 file:line）。

---

## File Structure

- **Task 1（孤儿）**：`server/src/services/customProviders.ts`（删 createForUser/listForUser）、`server/src/routes/adminUsers.ts`（删 /users/:id/config 路由）、`server/src/services/userConfig.ts`（删 applyAdminUpdate + AdminConfigPatch）、`services/adminService.ts`（删 getUserConfig/updateUserConfig/AdminConfigPatch）、相关测试。
- **Task 2（默认 provider + 前端残留）**：`server/src/services/userConfig.ts`（defaultConfig provider）、`store/settingsStore.ts`、`hooks/useAppInit.ts`、`components/ImageToolbar.tsx`、`constants.ts`（删 `*_MODEL_OPTIONS`）。
- **Task 3（HF 旧路径）**：`server/src/providers/index.ts`、`server/src/providers/models.ts`、`server/src/routes/v1.ts`、删 `server/src/providers/huggingface.ts`、相关测试。

> 验证：server `cd server && npx tsc --noEmit && npx vitest run`；web (repo 根) `npx tsc --noEmit && npx vitest run`。

---

## Task 1: 清理孤儿 per-user config 代码（零风险）

这些在 Phase 3 移除 per-user provider 路由 + UserConfigEditor 后已无生产消费者（仅自身测试引用）。

**Files:** `server/src/services/customProviders.ts`、`server/src/routes/adminUsers.ts`、`server/src/services/userConfig.ts`、`services/adminService.ts` + 测试

- [ ] **Step 1: grep 确认无生产引用**
  对 `createForUser`、`listForUser`、`getUserConfig`、`updateUserConfig`、`applyAdminUpdate` 分别 `grep -rn`（排除 node_modules/dist/自身/`.test`）。预期：仅测试引用。若有非测试生产引用，停止报告。

- [ ] **Step 2: 删后端孤儿**
  - `customProviders.ts`: 删 `createForUser`（~:137）、`listForUser`（~:150）。保留 `createGlobalProvider/listGlobal/adminUpdate/adminDelete/resolveForUse/effectiveForUser`。
  - `adminUsers.ts`: 删 `GET /users/:id/config`（~:125）、`PUT /users/:id/config`（~:134）两个路由及其 `applyAdminUpdate` import。
  - `userConfig.ts`: 删 `applyAdminUpdate`（~:290）+ `AdminConfigPatch` interface（若仅被它用）。保留 `loadRaw/saveRaw/getPublicConfig/applySelfUpdate/getProviderTokens/defaultConfig/defaultSecrets/seedDefaultSettings`（仍被使用）。

- [ ] **Step 3: 删前端孤儿**
  - `services/adminService.ts`: 删 `getUserConfig`（~:87）、`updateUserConfig`（~:96）、`AdminConfigPatch` type。保留 listUsers/createUser/updateUser/deleteUser 等。

- [ ] **Step 4: 更新测试**
  删除/调整针对上述已删函数的测试用例（`server/src/services/customProviders.test.ts` 的 createForUser/listForUser 用例；`server/src/routes/adminUsers.test.ts` 的 /config 用例；`tests/adminService.test.ts` 的 user-config 用例）。

- [ ] **Step 5: 验证 + 提交**
  Run: `cd server && npx tsc --noEmit && npx vitest run` 且 (repo 根) `npx tsc --noEmit && npx vitest run` → 全绿。
  ```bash
  git add server/src/services/customProviders.ts server/src/routes/adminUsers.ts server/src/services/userConfig.ts services/adminService.ts <受影响测试>
  git commit -m "refactor: remove orphaned per-user config code (createForUser/listForUser, admin user-config route, getUserConfig/updateUserConfig)"
  ```

---

## Task 2: 默认 provider→server + 删前端 builtin 残留

让 `provider` 在运行时永不为 builtin id，从而移除 `useAppInit`/`ImageToolbar` 的 builtin 分支与 `*_MODEL_OPTIONS`。

**Files:** `server/src/services/userConfig.ts`、`store/settingsStore.ts`、`hooks/useAppInit.ts`、`components/ImageToolbar.tsx`、`constants.ts` + 测试

- [ ] **Step 1: 读相关代码确认 provider 初始化**
  读 `hooks/useAppInit.ts`（尤其 :127-169 server-init 与 :340-350 builtin 分支）、`store/settingsStore.ts`（:36 默认）、`services/configSync.ts`（hydrate）、`server/src/services/userConfig.ts`（:118-145 defaultConfig）。确认：server-init 是否把 active provider 设为 `"server"`；`provider` 字段在哪被消费。

- [ ] **Step 2: 默认 provider 改为 server 合成 provider id**
  - `server/src/services/userConfig.ts` `defaultConfig()`: `provider: "huggingface"` → 改为 server 合成 provider 的 id（确认 useAppInit 用的 id，预期 `"server"`）；`model` 改为留空或由 server-init 选第一个可用模型（以不破坏 server-init 为准——读代码决定）。
  - `store/settingsStore.ts:36`: 同步默认 `provider`。
  - 目标：登录 hydrate 后 `provider` 不再是 builtin id，`useAppInit` 的 builtin 分支不再触发。

- [ ] **Step 3: 删 builtin 分支 + 残留**
  - `hooks/useAppInit.ts:343-346`: 删按 builtin id（gitee/modelscope/huggingface/a4f）构建 `*_MODEL_OPTIONS` 的分支（确认 server provider 的模型已由 fetchServerModels 提供）。
  - `components/ImageToolbar.tsx:135-138`: 删合并 `*_MODEL_OPTIONS` 的 label lookup，改用 custom-provider 模型解析（读代码确定替代方式；可能从 getCustomProviders 的模型 name 查找）。
  - `constants.ts`: 删 `HF_MODEL_OPTIONS`/`GITEE_MODEL_OPTIONS`/`MS_MODEL_OPTIONS`/`A4F_MODEL_OPTIONS`（grep 确认 Step 3 后 0 引用）。**保留** `getModelConfig`/`getGuidanceScaleConfig`（合法 server 工具）。

- [ ] **Step 4: 验证 + 提交**
  Run: server + web `tsc --noEmit && vitest run` → 全绿，无悬空。
  ```bash
  git add server/src/services/userConfig.ts store/settingsStore.ts hooks/useAppInit.ts components/ImageToolbar.tsx constants.ts <受影响测试>
  git commit -m "refactor: default provider=server + remove frontend builtin-provider residue (*_MODEL_OPTIONS)"
  ```

> 若 Step 2 的默认 provider 改动牵涉过广/有破坏风险，可 DONE_WITH_CONCERNS 报告，由控制者决定是否拆分。

---

## Task 3: 删 server 端 HF 旧路径（最后做，删后需 docker 验证）

**Files:** `server/src/providers/index.ts`、`server/src/providers/models.ts`、`server/src/routes/v1.ts`、删 `server/src/providers/huggingface.ts` + 测试

- [ ] **Step 1: 重写 dispatch（index.ts）—— 全走 resolveCustom**
  读 `server/src/providers/index.ts`。删除：`generateHF/editHF/optimizeHF/upscaleHF/videoHF` import（:9-13）、`BUILTINS`/`HF`/`isBuiltin`/`tokensFor`（:27-36）、每个 dispatch 函数里的 `if (provider === HF) ...` 与 `if (isBuiltin(provider)) throw "provider_not_supported"`（:63-64,86-87,102-103,117-118,133-134）。结果：每个 `dispatchX` 直接 `resolveCustom(...)` → adapter（未知/builtin provider id 自然在 `resolveForUse` 抛 `PROVIDER_NOT_AVAILABLE`）。保留 `getProviderTokens` import 仅当仍需要——dispatch 不再用 token（custom secret 在 provider 记录），所以移除 dispatch 对 `getProviderTokens` 的使用（`getProviderTokens` 本身保留，`migrateData.ts` 仍用）。

- [ ] **Step 2: 精简 models.ts**
  删 `REGISTRY`（:36）、`RegistryModel`、`TOKEN_OPTIONAL_PROVIDERS`（:51）、`availableModels`（:75）、`toClientModels`（:82）、`qualifiedId`、`findModel`（若仅 REGISTRY 用）。**保留**：`parseModelId`、`customModelsToClient`、`ClientModel`、`ModelType`、`ModelCapability`、`CAP_TO_TYPE`（v1.ts customModels + dispatch 仍用）。

- [ ] **Step 3: 精简 v1.ts /models**
  `server/src/routes/v1.ts:56-78`：`GET /models` 改为只聚合 `effectiveForUser` → `customModelsToClient`（删 REGISTRY/availableModels/toClientModels/presence/getProviderTokens 那段）。删对应 import（:8-11）。其它路由（generate/edit/text/video/upscaler）不变（已走 dispatch→resolveCustom）。

- [ ] **Step 4: 删 huggingface.ts**
  `grep -rn "from .*huggingface\"" server/src` 确认仅 index.ts import（Step 1 已删）。然后 `git rm server/src/providers/huggingface.ts`。**保留** `server/src/providers/gradio.ts`（runGradioTask/uploadToGradio/makeSessionHash —— 被 `formats/gradio.ts` adapter 用）。删 huggingface 相关测试（若有）。

- [ ] **Step 5: 更新 dispatch.test.ts**
  现有 `dispatch.test.ts` 可能有 "builtin non-HF → provider_not_supported" 用例（gitee）。删 HF 旧路径后，gitee 等未知 provider 走 `resolveForUse` → `PROVIDER_NOT_AVAILABLE`。更新该用例的期望（或删，因 builtin 概念已不存在）。保留 gradio/openai/claude 路由用例。

- [ ] **Step 6: 验证 + 提交**
  Run: `cd server && npx tsc --noEmit && npx vitest run` → 全绿。
  ```bash
  git add server/src/providers/index.ts server/src/providers/models.ts server/src/routes/v1.ts server/src/providers/dispatch.test.ts
  git rm server/src/providers/huggingface.ts
  git commit -m "refactor(server): remove HF legacy path (dispatch special-case, REGISTRY, huggingface.ts); all providers via DB adapters"
  ```

---

## 阶段 5 完成标准

- server + web `tsc --noEmit` + `vitest run` 全绿。
- 无孤儿 per-user config 代码；无前端 builtin 残留（`*_MODEL_OPTIONS` 删除，provider 运行时恒非 builtin）；无 server HF 旧路径（dispatch 全走 `resolveForUse`/`ADAPTERS`，`REGISTRY`/`huggingface.ts` 删除）。
- `/api/v1/models` 完全来自数据库（`effectiveForUser`）。

## 真实验证（用户在 docker，⚠️ 关键）
1. `docker compose -f docker-compose.external-mysql.yml up -d --build api web`。
2. **HF 出图验证（删旧路径后最关键）**：普通用户用 HuggingFace 的 z-image-turbo（现在唯一路径=seed 的 gradio provider→gradioAdapter）生成 → 必须成功出图。同样测 edit（qwen-image-edit）/upscale（RealESRGAN）/video（wan2.2）若需要。
3. 若某 HF 能力出图失败 → gradioAdapter 与 generateHF 在该模型上的差异，对照 `huggingface.ts`(git 历史) 的 data 数组修 seed 的 argsTemplate/fnIndex/outputPath（在 admin 面板或 seed.ts）。
4. 模型列表只剩数据库来源（无重复的两套 HF）。

## 收尾
- Phase 5 完成后，整个 5-phase 重构结束 → 可 `superpowers:finishing-a-development-branch`（合并/PR Phase 1-5 到 main）。
- 可选 follow-up（非本期）：`translatePrompt`/`optimizeEditPrompt` 改走后端；seed/migrate 一次性标记化。
