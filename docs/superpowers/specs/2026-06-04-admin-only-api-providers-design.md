# 仅管理员可配置 API 接口（移除普通用户自助配置）· 设计文档

> 日期：2026-06-04 ｜ 分支：feature/multi-user-mysql ｜ 状态：已与用户确认，待实现
> 关联记忆：[[multi-user-mysql-phases]]、[[docker-deployment-external-mysql]]
> 前序：[2026-06-02-custom-api-providers-design.md](2026-06-02-custom-api-providers-design.md)（Phase 8 引入了自助配置，本期将其收回）

## 1. 背景与目标

Phase 8 给普通用户开放了"自助配置 API 接口"（`managed_by='self'`）。现在改为：**普通用户不能自己配置 API，只能由管理员配置；管理员配置好后，所有用户都能选择并使用。**

- **移除**普通用户自助创建/修改/删除 API 接口的能力（前端入口 + 后端接口都移除）。
- **保留**普通用户从管理员配好的接口中**选择并使用**（设置 → "模型"标签页的下拉选择器）。
- "所有用户都能用" = 管理员创建的**全局接口（`scope='global'`）**，经 `/api/v1/models` 的 `effectiveForUser` 自动出现在每个用户的模型列表，`resolveForUse` 放行 `scope==='global'`——**该机制已存在，无需新建**。

## 2. 需求确认（来自用户）

- 禁止程度：**前端 + 后端**都做（API 层彻底禁止，防止用户绕过前端直接调接口）。
- "配置 api" 指生成用的 custom/relay provider 与其密钥。S3/WebDAV 属个人存储，**不在本期锁定范围**，保持用户可配。
- token（gitee/modelscope/openai/google 等）与 serviceMode 早已被 `/api/config` 自更新拒绝，普通用户本就改不了，无需改动。

## 3. 现状（已核实代码）

普通用户**唯一**的自助配置入口链路：

- 前端：`SettingsModal` 的 `providers` 标签页 → `ProvidersManager`（`title={t.prov_mine}`）→ `services/providerService.ts` 的 `listProviders/createProvider/updateProvider/deleteProvider`。
- 后端：`/api/providers`（`server/src/routes/providers.ts`，挂载于 `app.ts:27`）→ `services/customProviders.ts` 的 `listSelf/createSelfProvider/updateSelf/deleteSelf`（`managed_by='self'`）。

管理员配置链路（保留不动）：`AdminView` → 全局接口 / 该用户接口 → `/api/admin/providers`、`/api/admin/users/:uid/providers`（`adminProviders.ts`，`requireAdmin`）。

模型选择链路（保留不动）：`useAppInit` → `/api/v1/models`（`effectiveForUser` 聚合 HF 内置 + global + 本人 enabled 的 custom）→ 合成 "Server" provider → `ModelsTab` 纯选择器。

## 4. 权限模型（改动后）

`managed_by='self'` 不再可创建，模型简化为两类：

| 类型 | 谁可用 | 谁可改/删 |
|---|---|---|
| `scope='global'` | 所有用户 | 仅管理员 |
| `scope='user', managed_by='admin'` | 该用户 | 仅管理员 |

## 5. 后端改动（API 层彻底禁止）

- `server/src/app.ts`：移除 `createProviderRouter` 的 import 与 `app.use("/api/providers", ...)` 挂载（第 8、27 行）。
- 删除 `server/src/routes/providers.ts`（整个自助路由）。之后 `GET/POST/PATCH/DELETE /api/providers` 一律 404。
- `server/src/services/customProviders.ts`：删除已无引用的 `createSelfProvider` / `updateSelf` / `deleteSelf` / `listSelf` / `selfEditable`。保留：`effectiveForUser`、`resolveForUse`、`listGlobal`、`listForUser`、`createGlobalProvider`、`createForUser`、`adminUpdate`、`adminDelete`、`toPublic` 等。

> 备选（未采纳）：仅卸载路由、保留 service 函数（最小改动）。本期按"彻底删除死代码"执行。

## 6. 前端改动（移除自助入口）

- `components/SettingsModal.tsx`：移除 `providers` 标签项（`tabs` 内第 67 行）、其渲染分支（第 137–145 行）、以及 `providerService` 自助函数的 import（第 23–28 行）。"模型"标签页保留。
- `services/providerService.ts`：删除 `listProviders/createProvider/updateProvider/deleteProvider`；保留所有 admin 函数（`listGlobalProviders/createGlobalProvider/listUserProviders/createUserProvider/adminUpdateProvider/adminDeleteProvider`）。
- `hooks/useSettingsForm.ts`：若 `activeTab` 默认值或类型联合包含 `'providers'`，改为默认 `'general'` 并从类型中去掉 `'providers'`。
- `translations/{zh,en}.ts`：移除已无引用的 `tab_providers`、`prov_mine`。（`prov_add/prov_none/prov_global/prov_user/prov_managed_admin/prov_global_badge` 仍被管理员侧 `ProvidersManager` 使用，保留。）

## 7. 测试改动

- 删除 `server/src/routes/providers.test.ts`（自助路由测试）。可选：在 `app.test.ts` 加一条断言 `POST /api/providers` 返回 404。
- `server/src/providers/dispatch.test.ts`：`createSelfProvider(...)` → `createForUser(...)`（同为 user-scope，dispatch 解析行为一致）。
- `server/src/services/customProviders.test.ts`：移除 self CRUD 用例（`createSelfProvider`/`updateSelf`/`deleteSelf`/`listSelf` 相关），保留并按需调整 admin、`resolveForUse`、`listForUser` 用例。
- `tests/providerService.test.ts`（前端）：移除自助函数用例，保留 admin 用例。

## 8. 向后兼容（已有的用户自建 provider）

无需数据迁移：

- 旧的 `managed_by='self'` 行仍能被其拥有者用于生成（`resolveForUse`/`effectiveForUser` 只看 `owner_user_id`，不看 `managed_by`），且仍出现在该用户的模型列表。
- 管理员在 `AdminView` → "该用户的接口"（`listForUser` 返回该用户全部 user-scope 行）里能看到并可编辑/删除（`adminUpdate/adminDelete` 按 id 操作）。用户自己不再能改——符合"由管理员管理"。
- 如需更干净，由管理员在面板手动删除遗留项即可，无需代码层迁移。

## 9. 验证

- 后端 `npm test`、前端 `npm test` 全绿。
- 手动（普通用户）：设置里**无**"API 接口"标签；在"模型"里能选到管理员建的全局接口并成功生成；`POST /api/providers` 返回 404。
- 手动（管理员）：仍能在面板配置全局接口与按用户接口；全局接口对其他用户立即可选用。
