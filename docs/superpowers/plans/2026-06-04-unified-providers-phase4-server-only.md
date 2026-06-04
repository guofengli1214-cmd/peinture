# 统一 Provider（阶段 4：锁定 server-only + 删浏览器直连 + 精简 constants）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development，逐 task 执行。Steps 用 `- [ ]`。
> **Git safety（强制）：** 不得 `git checkout/switch/reset/stash/restore/rebase`；只用只读 `git diff/show/log`。分支 `feature/unified-db-providers`（基于 Phase 3 tip `0cac922`）。
> **部署/验证提醒：** 这是**前端**重构；真实验证需 `docker compose -f docker-compose.external-mysql.yml up -d --build web`。前端行为需 visual 验证。

**Goal:** 让前端只走 server（统一引擎），移除浏览器直连：锁定 `serviceMode=server`、删 6 个直连 service、删各生成 hook 中按内置 provider id 直连的死分支、精简 `constants.ts` 的直连专用导出。功能不变（server 路径已覆盖全部 5 类生成能力，见下）。

**Architecture / 勘察结论（已确认，Phase 4 安全）:** server 模式靠 `useAppInit.ts:141-148` 构建一个合成的 `server` custom provider（`apiUrl:"/api"`）并设为 active provider，于是各生成 hook 都走 **custom(else) 分支** → `services/customService.ts` → `/api/v1/*`。已确认 5 能力全覆盖：text2image(`useCreationGeneration:186`)、prompt 优化(`:279`/`useEditorGeneration:134`)、edit(`useEditorGeneration:294`)、upscale(`useImageActions:80`)、video(`useCreationGeneration:437` + 轮询 `useAppInit:228`)。因此「删 local」= **删掉 hook 里按内置 provider id 调直连的那半分支（锁定 server 后 unreachable）**，不影响功能。

**保留（不在删除范围）:** `services/customService.ts`（server 桥）；`services/utils.ts` 的 `translatePrompt`/`optimizeEditPrompt`（走 Pollinations，独立于 serviceMode）；`services/{admin,auth,config,configSync,provider,storage,indexedDBStorage,modelUtils,dimensions,errorUtils,tokenRetry}Service/utils`。

**Tech Stack:** React(Vite) + TS + vitest。

参考：spec §9、记忆 `unified-db-providers-refactor`。

---

## File Structure（本阶段涉及，全部前端）

- Modify `store/configStore.ts` — serviceMode 恒 `server`
- Modify `hooks/useSettingsForm.ts` — 移除 serviceMode 切换状态/逻辑
- Modify `components/settings/ModelsTab.tsx` — 移除 isLocal/isHydration 分支
- Modify `components/ControlPanel.tsx` — 移除 local/hydration 分支
- Modify `components/SettingsModal.tsx` — 移除 serviceMode 传参（如已无用）
- Modify `hooks/useCreationGeneration.ts` — 删内置 provider 直连分支 + 直连 import
- Modify `hooks/useEditorGeneration.ts` — 删内置 provider 直连分支 + 直连 import
- Modify `hooks/useImageActions.ts` — 删 HF upscaler 直连 fallback
- Modify `hooks/useAppInit.ts` — 删 gitee 视频轮询分支 + 直连 import
- Delete `services/{hfService,giteeService,msService,a4fService,openaiService,googleService}.ts`
- Modify `constants.ts` — 删直连专用导出
- Modify `types.ts` — `ServiceMode` 收敛（可选，见 Task 1）
- Tests: 受影响的 `tests/*.test.ts`、`hooks/*.test`（若有）

> 验证命令（repo 根）：`npx tsc --noEmit && npx vitest run`。每个删除 step 后必须 `tsc` 确认无悬空引用。

---

## Task 1: 锁定 serviceMode = server（收敛三态分支）

**Files:** `store/configStore.ts`、`hooks/useSettingsForm.ts`、`components/settings/ModelsTab.tsx`、`components/ControlPanel.tsx`、`components/SettingsModal.tsx`、（可选 `types.ts`）

**目标**：`serviceMode` 恒为 `"server"`，UI 不再暴露 local/hydration 切换；所有 `serviceMode === "local"/"hydration"` 分支收敛为 server-only。先读每个文件确认实际逻辑再改。

- [ ] **Step 1: configStore 恒 server**
  `store/configStore.ts:100-101`：`serviceMode` 默认已是 `"server"`。移除 `VITE_SERVICE_MODE` 覆盖，硬编码 `serviceMode: "server"`。`setServiceMode`（:156）可保留为 no-op 或删除（若 useSettingsForm 不再调用则删）。

- [ ] **Step 2: useSettingsForm 移除切换**
  读 `hooks/useSettingsForm.ts`。移除：`serviceMode` 本地 state（:62）、`setServiceMode(getServiceMode())`（:146）、`local/hydration` 判断（:209-210）、`if (newMode === "local")` 分支（:345）、表单导出里的 serviceMode 切换项（:331/:461 视实际）。保留 server 行为。若 `getServiceMode` import 不再需要则移除。

- [ ] **Step 3: ModelsTab 恒 server**
  `components/settings/ModelsTab.tsx:59-61`：删 `isLocal`/`isHydration`，`isServer` 恒 true；移除仅 local 渲染的分支，保留 server 渲染。移除 `serviceMode` prop（:16）若不再需要。

- [ ] **Step 4: ControlPanel 恒 server**
  `components/ControlPanel.tsx:76-81`：移除 `getServiceMode()` 调用与 `showBase`(local/hydration) 分支，按 server 恒定渲染（`showBase=false`、server 模型来源）。

- [ ] **Step 5: SettingsModal**
  `components/SettingsModal.tsx:130`：若 `serviceMode` prop 已无消费者则移除。

- [ ] **Step 6: （可选）类型收敛**
  若所有 `local`/`hydration` 引用已清除，`types.ts` 的 `ServiceMode` 可改为 `'server'`（或保留以减小波及；以 `tsc` 为准）。

- [ ] **Step 7: 验证 + 提交**
  Run: `npx tsc --noEmit && npx vitest run` → 全绿、无悬空。
  ```bash
  git add store/configStore.ts hooks/useSettingsForm.ts components/settings/ModelsTab.tsx components/ControlPanel.tsx components/SettingsModal.tsx types.ts
  git commit -m "refactor(web): lock serviceMode=server, collapse local/hydration branches"
  ```

> 完成后：`serviceMode` 恒 server → active provider 恒合成 `server` provider → 各 hook 的内置 provider 直连分支变 unreachable（Task 2-3 删之）。

---

## Task 2: 删 useCreationGeneration + useEditorGeneration 的直连分支

**Files:** `hooks/useCreationGeneration.ts`、`hooks/useEditorGeneration.ts`；Test: 相关

**目标**：删掉「按内置 provider id（gitee/modelscope/huggingface/a4f/openai/google）调直连 service」的分支，只保留 custom(server) 分支。删对应直连 import。读实际代码确认分支边界（行号可能因 Task 1 微移）。

- [ ] **Step 1: useCreationGeneration**
  读 `hooks/useCreationGeneration.ts`。
  - 生成 `handleGenerate`：删内置 provider 直连分支（勘察标 ~122-181：`generateGiteeImage/generateMSImage/generateImage(HF)/generateA4FImage/generateOpenAIImage/generateGoogleImage`），保留 custom 分支（~182-198 `generateCustomImage`）。删 `serviceMode === "local"/"hydration"` 残留（:307,317）的 local 半，`availableLiveModels`（~307-316 引用 `LIVE_MODELS`）改为只用 server 来源。
  - 提示词优化 `handleOptimizePrompt`：删内置直连优化分支，保留 `optimizePromptCustom`（~279）。`translatePrompt`（utils）保留。
  - 视频 `handleLiveClick`：保留 custom 分支 `generateCustomVideo`（~437）。
  - 删 import：`giteeService`、`msService`、`hfService`(generate 相关)、`a4fService`、`openaiService`、`googleService`（:15-24）。保留 `customService`、`utils`(translatePrompt 等)。
  - `tsc --noEmit` 确认无悬空。

- [ ] **Step 2: useEditorGeneration**
  读 `hooks/useEditorGeneration.ts`。
  - 编辑 `handleGenerate`：删内置直连编辑分支（~212-287：`editImageGitee/editImageMS/editImageQwen(HF)/generateOpenAIImage/generateGoogleImage`），保留 custom 分支 `editImageCustom`（~294）。
  - 编辑提示词优化 `handleOptimize`：保留 `optimizePromptCustom`（~133-138）；`optimizeEditPrompt`(Pollinations) 保留。
  - 删 import（:14-22 的 6 直连相关）。
  - `tsc --noEmit` 确认。

- [ ] **Step 3: 验证 + 提交**
  Run: `npx tsc --noEmit && npx vitest run`（注意：可能有引用这些 hook 的测试需更新）。
  ```bash
  git add hooks/useCreationGeneration.ts hooks/useEditorGeneration.ts
  git commit -m "refactor(web): drop builtin direct-connect branches in creation/editor hooks (server-only)"
  ```

---

## Task 3: 清理 useImageActions + useAppInit，删 6 个直连 service

**Files:** `hooks/useImageActions.ts`、`hooks/useAppInit.ts`、删 `services/{hf,gitee,ms,a4f,openai,google}Service.ts`；Test: 相关

- [ ] **Step 1: useImageActions**
  读 `hooks/useImageActions.ts`。放大 `upscale`：保留 server/custom 分支 `upscaleImageCustom`（~80,89），删 `hfService.upscaler` 的 local fallback（:9 import + 调用处）。`tsc`。

- [ ] **Step 2: useAppInit**
  读 `hooks/useAppInit.ts`。视频轮询：删 `getGiteeTaskStatus` 的 gitee-only 分支（~220-221），保留 `getCustomTaskStatus`（~222-229）。删 `getGiteeTaskStatus` import（:26）。确认 server-init（:127-169）与 `fetchServerModels` 保留。`tsc`。

- [ ] **Step 3: 删 6 个直连 service**
  确认 Task 2 + Step 1-2 后这 6 个文件已无任何 import（`grep -rn` 确认 0 引用，排除 node_modules/dist/server/自身），然后：
  ```bash
  git rm services/hfService.ts services/giteeService.ts services/msService.ts services/a4fService.ts services/openaiService.ts services/googleService.ts
  ```
  注意：`services/msService.ts` 内部 `import { uploadToGradio } from "./hfService"` —— 一起删无碍。若有别的非直连文件 import 它们，先处理。

- [ ] **Step 4: 验证 + 提交**
  Run: `npx tsc --noEmit && npx vitest run` → 全绿、无悬空引用。
  ```bash
  git add hooks/useImageActions.ts hooks/useAppInit.ts
  git rm services/hfService.ts services/giteeService.ts services/msService.ts services/a4fService.ts services/openaiService.ts services/googleService.ts
  git commit -m "refactor(web): remove HF upscaler/gitee-video fallbacks and delete 6 direct-connect services"
  ```

---

## Task 4: 精简 constants.ts + 全量验证

**Files:** `constants.ts`、受影响测试；

- [ ] **Step 1: grep 每个导出的引用**
  对 `API_MODEL_MAP`、`HF_MODEL_OPTIONS`/`GITEE_MODEL_OPTIONS`/`MS_MODEL_OPTIONS`/`A4F_MODEL_OPTIONS`、`PROVIDER_OPTIONS`、`EDIT_MODELS`/`LIVE_MODELS`/`TEXT_MODELS`/`UPSCALER_MODELS`、`getModelConfig`、`getGuidanceScaleConfig`、`FLUX_MODELS`、`Z_IMAGE_MODELS`，逐个 `grep -rn` 全仓（排除 node_modules/dist/server/constants.ts 自身、测试）。

- [ ] **Step 2: 删除 0 引用的导出**
  删掉确认 0 引用的导出。**仍被 server 模式 UI 引用的保留**（例如某些仍用于宽高比/步数 UI 的常量；以 grep 为准）。逐项删后 `tsc --noEmit` 确认无悬空。

- [ ] **Step 3: 全量验证**
  Run: `npx tsc --noEmit && npx vitest run` → 全绿。修正任何因删除而失败的测试（移除针对已删直连/常量的用例）。

- [ ] **Step 4: 提交**
  ```bash
  git add constants.ts <受影响的测试>
  git commit -m "refactor(web): prune direct-connect-only constants (API_MODEL_MAP/options/model lists)"
  ```

---

## 阶段 4 完成标准

- `npx tsc --noEmit` + `npx vitest run`（前端）全绿，无悬空引用。
- `serviceMode` 恒 server、UI 无 local/hydration 切换；6 个直连 service 删除；4 个生成 hook 只保留 custom(server) 分支；`constants.ts` 仅留仍被引用的导出。
- 功能不变：创作/编辑/放大/视频/提示词优化全部经 `/api/v1/*`（勘察已确认覆盖）。

## 真实验证（用户在 docker）
1. `docker compose -f docker-compose.external-mysql.yml up -d --build web`（仅前端改动，rebuild web 即可）。
2. 普通用户：创作出图、编辑、放大、（如配了视频模型）视频、提示词优化 —— 全部正常（走 server）。
3. 设置里无「服务模式 local/server」切换；浏览器网络面板确认无对 hf.space/ai.gitee.com/api.openai.com 等的直连请求（除 Pollinations 的 translate/optimize 外，全部 `/api/v1/*`）。

## 后续 Phase 5
- 移除 HF 旧路径（server `huggingface.ts`/`REGISTRY`/dispatch HF 特判）、清理孤儿（`adminService` per-user config、`customProviders` 的 `listForUser/createForUser`）、stale 注释；决定 `translatePrompt`/`optimizeEditPrompt` 是否也改走后端；可选 seed/migrate 一次性标记化。
