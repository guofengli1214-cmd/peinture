# Fluent 2 浅色主题重设计 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Peinture 全应用从深色紫调换肤为 Fluent 2 浅色（浅蓝 mesh 背景 + 亚克力卡片 + Fluent 蓝），只改样式、不动结构与逻辑。

**Architecture:** 先建立一层语义设计令牌（`tailwind.config.mjs` + `index.css`），再按统一的"深→浅映射表"系统性替换各组件的 className。布局、交互、数据流保持不变。

**Tech Stack:** React 19 + Vite + Tailwind CSS 3.4 + lucide-react + sonner + zustand。

参考 spec：`docs/superpowers/specs/2026-06-03-fluent2-redesign-design.md`

---

## ⚠️ 验证模型（本计划对 TDD 的适配）

纯样式换肤无可断言逻辑，故每个任务的"测试"为：

1. **grep 断言**：改完的文件不再含禁用深色令牌。统一禁用集合（记为 `$DARK`）：
   ```
   text-white|bg-white/|border-white/|bg-black/|ring-white/|divide-white/|purple-|fuchsia-|pink-|#0D0B14|#1A1625|#0d0b14
   ```
   命令：`grep -nE 'text-white|bg-white/|border-white/|bg-black/|ring-white/|divide-white/|purple-|fuchsia-|pink-|#0D0B14|#1A1625|#0d0b14' <file>`
   期望：**无输出**（特例须在任务内显式说明）。
2. **构建绿**：`npm run build` 成功，无类型/构建错误。
3. **现有测试绿**：`npm run test` 全通过（本次不改逻辑，应保持原状）。
4. **目视**：在 `npm run dev` 下肉眼核对该界面。

## ⚠️ 提交注意（已有未提交 WIP）

当前分支 `feature/multi-user-mysql` 有大量 multi-user 相关未提交改动，且部分与本次重叠（`Header.tsx`、`SettingsModal.tsx`、`settings/GeneralTab.tsx`、`LoginView.tsx` 等）。因此：

- **每次提交只 `git add` 本任务明确列出的文件路径**，绝不用 `git add -A` / `git add .`。
- 对"既有 WIP 又被本次修改"的文件，提交会一并带上其 WIP 改动——执行前需与用户确认处理方式（见计划末尾"执行交接"）。
- git 身份本地缺失，**预备步骤**已设置 repo-local 身份（匹配历史）。

---

## 共享映射参考（Mapping Reference）

所有组件任务统一套用下表（这是各任务的实际替换内容，非占位）：

| 现有 | 换成 |
|---|---|
| `text-white`、`text-white/90` | `text-ink` |
| `text-white/80` | `text-ink`（标题/正文）或 `text-ink-secondary`（弱化） |
| `text-white/70`、`text-white/60` | `text-ink-secondary` |
| `text-white/50`、`text-white/40` | `text-ink-tertiary` |
| `text-white/30`、placeholder 文字 | `text-ink-placeholder`，textarea/input 用 `placeholder:text-ink-placeholder` |
| `bg-black/20`、`bg-[#0D0B14]`、`bg-[#0D0B14]/95`（卡片/弹窗主面） | `acrylic-card`（卡片）或 `bg-surface`（实心弹窗） |
| `bg-[#1A1625]`、`bg-[#1A1625]/95`（下拉/弹出） | `bg-surface` + `shadow-flyout` |
| `bg-white/5` | `bg-fill-subtle` |
| `bg-white/10`、`hover:bg-white/10` | `bg-fill`、`hover:bg-fill` |
| `hover:bg-white/5` | `hover:bg-fill-subtle` |
| `hover:bg-white/20` | `hover:bg-fill-strong` |
| `border-white/10`、`border-white/[0.08]` | `border-stroke` |
| `border-white/5`、`border-white/[0.06]`、`border-white/[0.05]` | `border-stroke-subtle` |
| `bg-purple-600`、`bg-purple-600/20`(实心选中) | `bg-accent`；选中底用 `bg-accent-light` |
| `hover:bg-purple-500` | `hover:bg-accent-hover` |
| `active:bg-purple-700` | `active:bg-accent-pressed` |
| `text-purple-400`、`text-purple-300` | `text-accent` |
| `focus:border-purple-500`、`focus:ring-purple-500/50`、`ring-purple-500/50` | `focus:border-accent`、`focus:ring-accent/40`、`ring-accent/40` |
| `shadow-2xl shadow-black/20`、`shadow-purple-900/40` 等彩色阴影 | `shadow-card`（静态）/ `shadow-card-hover`（悬停）/ `shadow-flyout`（弹出）/ `shadow-dialog`（对话框） |
| Header 图标多色 hover（`hover:text-red-400`/`green-400`/`purple-400`） | 统一 `hover:text-accent` |
| 输入类控件的 `bg-white/5 border border-white/10 focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500` 组合 | 移除这些色彩类，加 `fluent-field`（保留尺寸/padding/radius/width 类） |

---

## Phase 1 — 令牌地基

### Task 1: 扩展 Tailwind 令牌

**Files:**
- Modify: `tailwind.config.mjs`

- [ ] **Step 1: 预备 — 设置 repo-local git 身份（仅本仓库，匹配历史）**

```bash
git config user.name "guofengli1214-cmd"
git config user.email "guofengli1214@gmail.com"
```

- [ ] **Step 2: 用以下完整内容替换 `theme.extend`**

```js
  theme: {
    extend: {
      colors: {
        // Fluent 蓝（强调色）
        "accent": "#0F6CBD",
        "accent-hover": "#115EA3",
        "accent-pressed": "#0F548C",
        "accent-light": "#EBF3FC",
        // 画布与表面
        "canvas": "#F3F6FB",
        "card": "rgba(255,255,255,0.72)",
        "surface": "#FFFFFF",
        "fill-subtle": "rgba(0,0,0,0.03)",
        "fill": "rgba(0,0,0,0.06)",
        "fill-strong": "rgba(0,0,0,0.09)",
        // 墨色（文字/图标）
        "ink": "#242424",
        "ink-secondary": "#5C5C5C",
        "ink-tertiary": "#8A8A8A",
        "ink-placeholder": "#BDBDBD",
        "on-accent": "#FFFFFF",
        // 描边
        "stroke": "rgba(0,0,0,0.08)",
        "stroke-subtle": "rgba(0,0,0,0.05)",
        "stroke-strong": "rgba(0,0,0,0.18)",
        // 旧令牌（暂留，Task 18 清理）
        "primary": "#0F6CBD",
        "background-light": "#f6f6f8",
        "background-dark": "#0D0B14",
      },
      fontFamily: {
        "display": ["ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"]
      },
      borderRadius: {
        "DEFAULT": "0.375rem", // 6px 控件
        "md": "0.375rem",      // 6px
        "lg": "0.5rem",        // 8px 卡片
        "xl": "0.75rem",       // 12px 对话框
        "2xl": "0.75rem",      // 12px（收敛，原 16px）
        "full": "9999px"
      },
      boxShadow: {
        "card": "0 2px 4px rgba(0,0,0,0.10), 0 0 2px rgba(0,0,0,0.08)",
        "card-hover": "0 8px 16px rgba(0,0,0,0.12), 0 0 2px rgba(0,0,0,0.10)",
        "flyout": "0 8px 16px rgba(0,0,0,0.14), 0 0 2px rgba(0,0,0,0.12)",
        "dialog": "0 14px 28px rgba(0,0,0,0.20), 0 0 8px rgba(0,0,0,0.14)",
      },
      transitionTimingFunction: {
        "fluent": "cubic-bezier(0.1, 0.9, 0.2, 1)",
      },
    },
  },
```

- [ ] **Step 3: 验证构建**

Run: `npm run build`
Expected: 成功（仅新增令牌，不应报错）。

- [ ] **Step 4: 提交**

```bash
git add tailwind.config.mjs
git commit -m "feat(ui): add Fluent 2 light design tokens to tailwind config"
```

### Task 2: 重写全局样式 `index.css`

**Files:**
- Modify: `index.css`

- [ ] **Step 1: 用以下完整内容替换整个文件**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  body {
    background-color: #f3f6fb;
    color: #242424;
  }
}

/* Hide scrollbar (gallery) */
.scrollbar-hide::-webkit-scrollbar { display: none; }
.scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }

/* Global & custom scrollbar — light */
.custom-scrollbar::-webkit-scrollbar,
::-webkit-scrollbar { width: 6px; height: 6px; }
.custom-scrollbar::-webkit-scrollbar-track,
::-webkit-scrollbar-track { background: transparent; border-radius: 8px; }
.custom-scrollbar::-webkit-scrollbar-thumb,
::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.18); border-radius: 8px; transition: background 0.2s ease; }
.custom-scrollbar::-webkit-scrollbar-thumb:hover,
::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.28); }
.custom-scrollbar::-webkit-scrollbar-thumb:active,
::-webkit-scrollbar-thumb:active { background: rgba(0,0,0,0.38); }
* { scrollbar-width: thin; scrollbar-color: rgba(0,0,0,0.18) transparent; }

/* Light blue Fluent mesh background */
.bg-gradient-brilliant {
  background-color: #f3f6fb;
  background-image:
    radial-gradient(at 20% 20%, hsla(210, 100%, 90%, 0.55) 0px, transparent 50%),
    radial-gradient(at 80% 10%, hsla(205, 100%, 92%, 0.45) 0px, transparent 50%),
    radial-gradient(at 70% 85%, hsla(220, 85%, 92%, 0.40) 0px, transparent 50%);
  background-attachment: fixed;
}

/* Fluent blue hero gradient (generate button) */
.generate-button-gradient {
  background-image: linear-gradient(to right, #2886de, #0f6cbd, #115ea3);
  background-size: 200% auto;
  transition: background-position 0.5s ease;
}
.generate-button-gradient:hover { background-position: right center; }

/* Acrylic card material */
.acrylic-card {
  background-color: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(20px) saturate(160%);
  -webkit-backdrop-filter: blur(20px) saturate(160%);
  border: 1px solid rgba(255, 255, 255, 0.7);
  box-shadow: 0 2px 4px rgba(0,0,0,0.10), 0 0 2px rgba(0,0,0,0.08);
}

/* Fluent field: filled input with animated bottom accent line (no layout shift) */
.fluent-field {
  background-color: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.08);
  box-shadow: inset 0 -1px 0 0 rgba(0, 0, 0, 0.18);
  transition: box-shadow 0.15s ease, border-color 0.15s ease;
}
.fluent-field:focus,
.fluent-field:focus-within {
  outline: none;
  border-color: rgba(0, 0, 0, 0.08);
  box-shadow: inset 0 -2px 0 0 #0f6cbd, 0 0 0 1px rgba(15, 108, 189, 0.12);
}

/* Custom range slider — light */
input[type="range"].custom-range {
  -webkit-appearance: none;
  appearance: none;
  background: transparent;
  cursor: pointer;
  width: 100%;
  height: 20px;
  margin: 0;
}
input[type="range"].custom-range::-webkit-slider-runnable-track {
  height: 4px;
  border-radius: 999px;
  background-color: rgba(0, 0, 0, 0.12);
}
input[type="range"].custom-range::-moz-range-track {
  height: 4px;
  border-radius: 999px;
  background-color: rgba(0, 0, 0, 0.12);
}
input[type="range"].custom-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  height: 12px;
  width: 12px;
  border-radius: 50%;
  background-color: currentColor;
  margin-top: -4px;
  transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.1);
}
input[type="range"].custom-range::-moz-range-thumb {
  border: none;
  height: 12px;
  width: 12px;
  border-radius: 50%;
  background-color: currentColor;
  transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.1);
}
input[type="range"].custom-range:hover::-webkit-slider-thumb { transform: scale(1.5); }
input[type="range"].custom-range:hover::-moz-range-thumb { transform: scale(1.5); }
input[type="range"].custom-range:active::-webkit-slider-thumb { transform: scale(1.5); cursor: grabbing; }
input[type="range"].custom-range:active::-moz-range-thumb { transform: scale(1.5); cursor: grabbing; }
input[type="range"].custom-range:focus { outline: none; }
```

- [ ] **Step 2: 验证构建**

Run: `npm run build`
Expected: 成功。

- [ ] **Step 3: 提交**

```bash
git add index.css
git commit -m "feat(ui): rewrite global styles for Fluent 2 light theme"
```

### Task 3: `index.html` 去深色

**Files:**
- Modify: `index.html:2`、`index.html:49`

- [ ] **Step 1: 改 `<html>` 标签**

把 `<html lang="en" class="dark">` 改为 `<html lang="en">`

- [ ] **Step 2: 改 `<body>` 标签**

把 `<body class="bg-background-dark font-display text-white">` 改为 `<body class="bg-canvas font-display text-ink">`

- [ ] **Step 3: 验证**

Run: `grep -nE 'class="dark"|bg-background-dark|text-white' index.html`
Expected: 无输出。

- [ ] **Step 4: 提交**

```bash
git add index.html
git commit -m "feat(ui): switch html shell to light theme"
```

### Task 4: `App.tsx` — 浅色 Toast 与 spinner

**Files:**
- Modify: `App.tsx:26-44`

- [ ] **Step 1: 替换 `ToasterPortal`**

```tsx
const ToasterPortal = () => (
  <Toaster
    theme="light"
    position="top-center"
    toastOptions={{
      style: {
        background: '#FFFFFF',
        border: '1px solid rgba(0, 0, 0, 0.08)',
        color: '#242424',
        boxShadow: '0 8px 16px rgba(0,0,0,0.14), 0 0 2px rgba(0,0,0,0.12)',
      },
    }}
  />
);
```

- [ ] **Step 2: 替换 `FullscreenSpinner` 的 spinner 颜色**

把 `<Loader2 className="w-8 h-8 text-white/60 animate-spin" />` 改为 `<Loader2 className="w-8 h-8 text-accent animate-spin" />`

- [ ] **Step 3: 验证**

Run: `grep -nE 'text-white|theme="dark"|#0D0B14' App.tsx`
Expected: 无输出。
Run: `npm run build` → 成功。

- [ ] **Step 4: 提交**

```bash
git add App.tsx
git commit -m "feat(ui): light toast and accent spinner"
```

---

## Phase 2 — 共享组件

> 每个任务统一套用上方"共享映射参考"。下方仅列**非机械/签名级**改动。完成后跑该文件的 `$DARK` grep（期望无输出）+ `npm run build`。

### Task 5: `components/Select.tsx`

**Files:**
- Modify: `components/Select.tsx`

- [ ] **Step 1: 套用映射参考替换全部颜色类**（文字、选中态、悬停等）

- [ ] **Step 2: 触发器按钮（`L130-149`）改 Fluent field**

把触发器 `className` 中的 `border border-white/10 bg-white/5 focus:outline-0 focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 ... ${isOpen ? "ring-2 ring-purple-500/50 border-purple-500" : ""}` 改为：保留布局类（`relative w-full flex items-center justify-between rounded-md transition-all px-4 text-sm font-medium h-10/h-12`），颜色/边框/聚焦改用 `fluent-field` + `text-ink`；`isOpen` 态用 `${isOpen ? "shadow-[inset_0_-2px_0_0_#0f6cbd]" : ""}`。

- [ ] **Step 3: 下拉菜单容器（`L164`）**

把 `bg-[#1A1625] border border-white/10 rounded-lg shadow-xl` 改为 `bg-surface border border-stroke rounded-lg shadow-flyout`。

- [ ] **Step 4: 选项选中态（`renderOption`, `L101`）**

把 `${option.value === value ? "text-purple-400 bg-white/5" : "text-white/80"}` 改为 `${option.value === value ? "text-accent bg-accent-light" : "text-ink-secondary"}`；hover 由 `hover:bg-white/10` 改 `hover:bg-fill`。

- [ ] **Step 5: 分组标题/分隔线**：`text-white/40` → `text-ink-tertiary`，`bg-white/10` 分隔线 → `bg-stroke`。

- [ ] **Step 6: 验证 + 提交**

```bash
grep -nE 'text-white|bg-white/|border-white/|bg-black/|purple-|#1A1625' components/Select.tsx   # 期望无输出
npm run build
git add components/Select.tsx
git commit -m "feat(ui): restyle Select to Fluent 2"
```

### Task 6: `components/Tooltip.tsx`

**Files:**
- Modify: `components/Tooltip.tsx`

- [ ] **Step 1: 读取文件**，定位气泡容器与箭头的配色类。
- [ ] **Step 2: 改为浅色气泡**：气泡背景改 `bg-surface`，文字 `text-ink`，边 `border border-stroke`，阴影 `shadow-flyout`；若有深色箭头（border 三角/背景），同步改为 `surface`/`stroke` 配色。
- [ ] **Step 3: 验证 + 提交**

```bash
grep -nE 'text-white|bg-white/|border-white/|bg-black/|purple-|#0D0B14|#1A1625' components/Tooltip.tsx   # 期望无输出
npm run build
git add components/Tooltip.tsx
git commit -m "feat(ui): light Fluent tooltip"
```

### Task 7: `components/Skeleton.tsx` + `components/ErrorBoundary.tsx`

**Files:**
- Modify: `components/Skeleton.tsx`、`components/ErrorBoundary.tsx`

- [ ] **Step 1: Skeleton** — 骨架底色由白半透明改深墨半透明：`bg-white/5`/`bg-white/10` → `bg-fill-subtle`/`bg-fill`；若用渐变高光，改为基于 `rgba(0,0,0,…)` 的浅色微光。
- [ ] **Step 2: ErrorBoundary** — 套映射参考（卡片 `acrylic-card` 或 `bg-surface`，文字 `ink`，按钮 `bg-accent`）。
- [ ] **Step 3: 验证 + 提交**

```bash
grep -nE 'text-white|bg-white/|border-white/|bg-black/|purple-|#0D0B14|#1A1625' components/Skeleton.tsx components/ErrorBoundary.tsx   # 期望无输出
npm run build
git add components/Skeleton.tsx components/ErrorBoundary.tsx
git commit -m "feat(ui): light skeleton and error boundary"
```

---

## Phase 3 — 核心可见界面

### Task 8: `components/Header.tsx`

**Files:**
- Modify: `components/Header.tsx`

- [ ] **Step 1: 顶栏容器（`L42`）** 改亚克力浅色：
  `className="w-full backdrop-blur-md sticky top-0 z-50 bg-background-dark/30 border-b border-white/5"` → `className="w-full backdrop-blur-md sticky top-0 z-50 bg-card border-b border-stroke"`
- [ ] **Step 2: Logo 标题文字**：`text-white` → `text-ink`。
- [ ] **Step 3: 移动端切换药丸（`L56`）**：`bg-white/10 border border-white/10 ... text-white` → `bg-surface border border-stroke ... text-ink shadow-card`。
- [ ] **Step 4: 移动端下拉菜单（`L86`）**：`bg-[#1A1625]/95 ... border-white/10` → `bg-surface border border-stroke shadow-flyout`；选项选中态 `bg-purple-600/20 text-purple-400` → `bg-accent-light text-accent`，未选 `text-white/70 hover:bg-white/5 hover:text-white` → `text-ink-secondary hover:bg-fill hover:text-ink`。
- [ ] **Step 5: 桌面端滑动药丸导航（`L133-145`）**：容器 `bg-black/20 border border-white/10` → `bg-fill-subtle border border-stroke`；滑动块 `bg-purple-600 shadow-lg shadow-purple-900/30` → `bg-accent shadow-card`；激活文字 `text-white` 保留为 `text-on-accent`，未激活 `text-white/60 hover:text-white/90` → `text-ink-secondary hover:text-ink`。
- [ ] **Step 6: 右侧动作图标（`L177-240`）**：统一 `text-white/70` → `text-ink-secondary`，所有 `hover:text-red-400`/`green-400`/`purple-400` → `hover:text-accent`，`hover:bg-white/10` → `hover:bg-fill`。
- [ ] **Step 7: 用户 chip（`L220-229`）**：分隔线 `border-white/10` → `border-stroke`，用户名 `text-white/80` → `text-ink-secondary`，admin 徽章 `text-purple-300 bg-purple-500/15` → `text-accent bg-accent-light`。
- [ ] **Step 8: 验证 + 提交**

```bash
grep -nE 'text-white|bg-white/|border-white/|bg-black/|purple-|red-400|green-400|#1A1625|background-dark' components/Header.tsx   # 期望无输出
npm run build
git add components/Header.tsx
git commit -m "feat(ui): Fluent 2 acrylic header"
```

### Task 9: `components/LoginView.tsx`

**Files:**
- Modify: `components/LoginView.tsx`

- [ ] **Step 1: 卡片容器（`L44`）**：`bg-[#0D0B14] border border-white/10 rounded-2xl ... shadow-2xl` → `bg-surface border border-stroke rounded-xl ... shadow-dialog`。
- [ ] **Step 2: 文字**：标题 `text-white` → `text-ink`，副标题 `text-white/60` → `text-ink-secondary`，label `text-white/70` → `text-ink-secondary`。
- [ ] **Step 3: 输入框（`L65`、`L79`）**：把 `bg-white/5 border border-white/10 text-white focus:outline-0 focus:border-purple-500` 改为保留布局类（`w-full px-4 py-2.5 rounded-md text-ink`）+ `fluent-field`，placeholder 加 `placeholder:text-ink-placeholder`。
- [ ] **Step 4: 错误文字**：`text-red-400` 保留（语义红，浅底可读）；如对比不足改 `text-red-600`。
- [ ] **Step 5: 提交按钮（`L90`）**：`bg-purple-600 hover:bg-purple-500 text-white` → `bg-accent hover:bg-accent-hover text-on-accent shadow-card`。
- [ ] **Step 6: 验证 + 提交**

```bash
grep -nE 'text-white|bg-white/|border-white/|bg-black/|purple-|#0D0B14' components/LoginView.tsx   # 期望无输出
npm run build
git add components/LoginView.tsx
git commit -m "feat(ui): Fluent 2 login dialog"
```

### Task 10: 创作页 — `CreationView` + `PromptInput` + `ControlPanel`

**Files:**
- Modify: `views/CreationView.tsx`、`components/PromptInput.tsx`、`components/ControlPanel.tsx`

- [ ] **Step 1: CreationView 控制卡（`L94`）**：`bg-black/20 p-4 ... rounded-xl backdrop-blur-xl border border-white/10 ... shadow-2xl shadow-black/20` → `acrylic-card p-4 md:p-6 rounded-lg flex flex-col gap-4 md:gap-6`（`acrylic-card` 已含 bg/blur/border/shadow，移除重复的 bg/border/shadow 类）。
- [ ] **Step 2: 生成按钮（`L103`）**：保留 `generate-button-gradient`（已在 Task 2 改 Fluent 蓝）；阴影 `shadow-purple-900/40 hover:shadow-purple-700/50` → `shadow-card hover:shadow-card-hover`；文字保留 `text-white`（在蓝渐变上）改为 `text-on-accent`。
- [ ] **Step 3: 重置按钮（`L122`）**：`bg-white/5 border border-white/10 text-white/70 hover:text-white hover:bg-white/10 hover:border-white/20` → `bg-surface border border-stroke text-ink-secondary hover:text-ink hover:bg-fill shadow-card`。
- [ ] **Step 4: PromptInput** — label `text-white group-focus-within:text-purple-400` → `text-ink group-focus-within:text-accent`；历史按钮/自动翻译/优化按钮套映射（`text-white/60`→`text-ink-secondary`、`bg-white/5`→`bg-fill-subtle`、`hover:text-purple-300`→`hover:text-accent`、toggle 开 `bg-purple-600`→`bg-accent`、关 `bg-white/10`→`bg-fill`）；历史下拉 `bg-[#1A1625] border-white/10 shadow-2xl` → `bg-surface border-stroke shadow-flyout`，项 hover `hover:bg-white/10`→`hover:bg-fill`，分隔 `border-white/5`→`border-stroke-subtle`。
- [ ] **Step 5: PromptInput textarea（`L157`）**：移除 `bg-white/5 border border-white/10 focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500`，加 `fluent-field`；文字 `text-white/90`→`text-ink`，placeholder `placeholder:text-white/30`→`placeholder:text-ink-placeholder`；保留 `form-input flex w-full ... resize-none rounded-md min-h-32 p-4` 等布局类。
- [ ] **Step 6: ControlPanel** — 套映射：HD toggle（开`bg-purple-600`→`bg-accent`、关`bg-white/10`→`bg-fill`、`focus:ring-purple-500/50`→`focus:ring-accent/40`）；高级设置按钮 `text-white/60 hover:text-purple-400`→`text-ink-secondary hover:text-accent`；分隔 `border-white/5`→`border-stroke-subtle`；step/guidance 标签 `text-white/80`→`text-ink`、读数 `text-white/50 bg-white/5`→`text-ink-tertiary bg-fill-subtle`；range `text-purple-500`→`text-accent`；Seed 输入容器（`L372`）`border border-white/10 bg-white/5 focus-within:ring-2 focus-within:ring-purple-500/50 focus-within:border-purple-500`→ 移除并加 `fluent-field`（容器用 `focus-within`），内部 ± 按钮 `text-white/40 hover:text-white hover:bg-white/5 border-white/5`→`text-ink-tertiary hover:text-ink hover:bg-fill-subtle border-stroke-subtle`，input 文字 `text-white/90`→`text-ink`、placeholder→`placeholder:text-ink-placeholder`；骰子按钮 `bg-white/10 text-white/60 hover:bg-white/20 hover:text-white`→`bg-fill text-ink-secondary hover:bg-fill-strong hover:text-ink`。
- [ ] **Step 7: 验证 + 提交**

```bash
grep -nE 'text-white|bg-white/|border-white/|bg-black/|purple-|#1A1625' views/CreationView.tsx components/PromptInput.tsx components/ControlPanel.tsx   # 期望无输出（text-on-accent 不计）
npm run build
git add views/CreationView.tsx components/PromptInput.tsx components/ControlPanel.tsx
git commit -m "feat(ui): Fluent 2 creation view, prompt input, control panel"
```

### Task 11: 预览区 — `PreviewStage` + `ImageToolbar` + `ImageComparison` + `HistoryGallery`

**Files:**
- Modify: `components/PreviewStage.tsx`、`components/ImageToolbar.tsx`、`components/ImageComparison.tsx`、`components/HistoryGallery.tsx`

- [ ] **Step 1: 逐个读取文件**，套用共享映射参考替换所有 `$DARK` 颜色类。
- [ ] **Step 2: 浮层/工具条**（PreviewStage、ImageToolbar）：半透明深色浮层（`bg-black/…`、`bg-[#…]`）改为 `acrylic-card` 或 `bg-surface/90 backdrop-blur` + `shadow-flyout`；图标 `text-white/…`→`text-ink-secondary`，激活/hover→`text-accent`/`hover:bg-fill`。
- [ ] **Step 3: 信息浮层文字**：白系→`ink` 系。注意覆盖在图片上的文字若需高对比，可保留半透明深底 `bg-black/60` + `text-white`——**此为允许特例**，在该处加注释 `{/* overlay on image: dark scrim intentional */}`。
- [ ] **Step 4: HistoryGallery 缩略图**：选中环 `ring-purple-500`/边框→`ring-accent`；卡片描边 `border-white/10`→`border-stroke`，hover 底→`hover:bg-fill`。
- [ ] **Step 5: 验证 + 提交**

```bash
grep -nE 'text-white|bg-white/|border-white/|purple-|#0D0B14|#1A1625' components/PreviewStage.tsx components/ImageToolbar.tsx components/ImageComparison.tsx components/HistoryGallery.tsx   # 仅图片 scrim 特例可保留（须带注释）
npm run build
git add components/PreviewStage.tsx components/ImageToolbar.tsx components/ImageComparison.tsx components/HistoryGallery.tsx
git commit -m "feat(ui): Fluent 2 preview stage, toolbar, comparison, history"
```

---

## Phase 4 — 其余界面

### Task 12: 编辑器 — `ImageEditorView` + `editor/*`

**Files:**
- Modify: `views/ImageEditorView.tsx`、`components/editor/EditorToolbar.tsx`、`components/editor/EditorBottomBar.tsx`

- [ ] **Step 1: 读取三个文件**，套映射参考。
- [ ] **Step 2: 编辑器工具栏/底栏**：深色亚克力浮层 → `acrylic-card`/`bg-surface` + `shadow-flyout`；激活工具 `bg-purple-…`/`text-purple-…` → `bg-accent-light text-accent`；普通图标 `text-white/…` → `text-ink-secondary`，hover → `text-accent`/`hover:bg-fill`。
- [ ] **Step 3: 画布背景**：若编辑画布用深底，保留中性深底（编辑场景需要）——**允许特例**，加注释；否则用 `bg-fill-subtle`。
- [ ] **Step 4: 验证 + 提交**

```bash
grep -nE 'text-white|bg-white/|purple-|#0D0B14|#1A1625' views/ImageEditorView.tsx components/editor/EditorToolbar.tsx components/editor/EditorBottomBar.tsx   # 画布 scrim 特例可留（带注释）
npm run build
git add views/ImageEditorView.tsx components/editor/EditorToolbar.tsx components/editor/EditorBottomBar.tsx
git commit -m "feat(ui): Fluent 2 image editor"
```

### Task 13: 云图库 — `CloudGalleryView`

**Files:**
- Modify: `views/CloudGalleryView.tsx`

- [ ] **Step 1: 读取并套映射参考**：卡片→`acrylic-card`/`bg-surface`、文字→`ink` 系、筛选/分页按钮→`bg-accent`/`bg-surface+border-stroke`、选中→`bg-accent-light text-accent`、缩略图选中环→`ring-accent`。
- [ ] **Step 2: 验证 + 提交**

```bash
grep -nE 'text-white|bg-white/|border-white/|bg-black/|purple-|#0D0B14|#1A1625' views/CloudGalleryView.tsx   # 期望无输出
npm run build
git add views/CloudGalleryView.tsx
git commit -m "feat(ui): Fluent 2 cloud gallery"
```

### Task 14: 设置弹窗 — `SettingsModal` + `settings/SettingsTabs`

**Files:**
- Modify: `components/SettingsModal.tsx`、`components/settings/SettingsTabs.tsx`

- [ ] **Step 1: 背景遮罩（`SettingsModal L90`）**：`bg-black/60 backdrop-blur-sm` 保留（对话框遮罩，浅底也合理），可降到 `bg-black/40`。
- [ ] **Step 2: 弹窗主体（`L96`）**：`bg-[#0D0B14]/95 backdrop-blur-xl border border-white/[0.08] rounded-2xl shadow-[...purple...] ring-1 ring-white/[0.05]` → `bg-surface border border-stroke rounded-xl shadow-dialog`（去掉紫色光晕与 ring）。
- [ ] **Step 3: 头部/底部条（`L98`、`L207`）**：`border-white/[0.06] bg-white/[0.02]` → `border-stroke-subtle bg-fill-subtle`；标题 `text-white`→`text-ink`；关闭按钮 `text-white/40 hover:text-white hover:bg-white/[0.08]`→`text-ink-tertiary hover:text-ink hover:bg-fill`。
- [ ] **Step 4: 取消/保存按钮（`L208`、`L214`）**：取消 `text-white/60 hover:text-white hover:bg-white/[0.06]`→`text-ink-secondary hover:text-ink hover:bg-fill`；保存 `bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white shadow-[...purple...]`→`bg-accent hover:bg-accent-hover active:bg-accent-pressed text-on-accent shadow-card`。
- [ ] **Step 5: SettingsTabs** — 读取并套映射：激活标签 `text-purple-…`/底部指示条 `bg-purple-…`→`text-accent`/`bg-accent`；未激活 `text-white/…`→`text-ink-secondary`，hover→`hover:bg-fill`/`hover:text-ink`。
- [ ] **Step 6: 验证 + 提交**

```bash
grep -nE 'text-white|bg-white/|border-white/|purple-|#0D0B14|#1A1625' components/SettingsModal.tsx components/settings/SettingsTabs.tsx   # bg-black/40 遮罩特例可留
npm run build
git add components/SettingsModal.tsx components/settings/SettingsTabs.tsx
git commit -m "feat(ui): Fluent 2 settings modal shell"
```

### Task 15: 设置各标签页 — `settings/*Tab`

**Files:**
- Modify: `components/settings/GeneralTab.tsx`、`ModelsTab.tsx`、`PromptTab.tsx`、`LiveTab.tsx`、`StorageTab.tsx`

- [ ] **Step 1: 逐个读取**，套共享映射参考（label/正文 `ink` 系；输入框移除色彩类加 `fluent-field`；开关 `bg-accent`/`bg-fill`；测试/操作按钮 `bg-accent` 或次级 `bg-surface+border-stroke`；分隔 `border-stroke-subtle`）。
- [ ] **Step 2: 验证 + 提交**

```bash
grep -nE 'text-white|bg-white/|border-white/|bg-black/|purple-|#0D0B14|#1A1625' components/settings/GeneralTab.tsx components/settings/ModelsTab.tsx components/settings/PromptTab.tsx components/settings/LiveTab.tsx components/settings/StorageTab.tsx   # 期望无输出
npm run build
git add components/settings/GeneralTab.tsx components/settings/ModelsTab.tsx components/settings/PromptTab.tsx components/settings/LiveTab.tsx components/settings/StorageTab.tsx
git commit -m "feat(ui): Fluent 2 settings tabs"
```

### Task 16: 管理后台 — `AdminView` + `admin/*`

**Files:**
- Modify: `views/AdminView.tsx`、`components/admin/CreateUserForm.tsx`、`UserAccountActions.tsx`、`UserConfigEditor.tsx`

- [ ] **Step 1: 逐个读取**，套映射参考：弹窗/面板 `bg-surface`+`shadow-dialog`/`acrylic-card`；表格行 hover `hover:bg-fill`、分隔 `border-stroke`；主操作 `bg-accent`，危险操作保留语义红（浅底用 `bg-red-600 text-white` / `text-red-600`）；表单输入加 `fluent-field`。
- [ ] **Step 2: 验证 + 提交**

```bash
grep -nE 'text-white|bg-white/|border-white/|bg-black/|purple-|#0D0B14|#1A1625' views/AdminView.tsx components/admin/CreateUserForm.tsx components/admin/UserAccountActions.tsx components/admin/UserConfigEditor.tsx   # 危险按钮 text-white(在红底) 可留
npm run build
git add views/AdminView.tsx components/admin/CreateUserForm.tsx components/admin/UserAccountActions.tsx components/admin/UserConfigEditor.tsx
git commit -m "feat(ui): Fluent 2 admin view"
```

### Task 17: 其余 — `FAQModal` + `ProviderForm` + `ProvidersManager` + `Icons`

**Files:**
- Modify: `components/FAQModal.tsx`、`components/ProviderForm.tsx`、`components/ProvidersManager.tsx`、`components/Icons.tsx`

- [ ] **Step 1: FAQModal/ProviderForm/ProvidersManager** — 套映射参考（弹窗 `bg-surface`+`shadow-dialog`、卡片 `acrylic-card`、输入 `fluent-field`、按钮 accent）。
- [ ] **Step 2: Icons.tsx（Logo）** — 检查 `Logo` 是否硬编码紫色/深色填充；若品牌图标含紫色，改为 Fluent 蓝 `#0F6CBD`（或保留品牌图形仅调主色）。其余线性图标无需改。
- [ ] **Step 3: 验证 + 提交**

```bash
grep -nE 'text-white|bg-white/|border-white/|bg-black/|purple-|#0D0B14|#1A1625' components/FAQModal.tsx components/ProviderForm.tsx components/ProvidersManager.tsx components/Icons.tsx   # Logo 品牌色按需保留
npm run build
git add components/FAQModal.tsx components/ProviderForm.tsx components/ProvidersManager.tsx components/Icons.tsx
git commit -m "feat(ui): Fluent 2 FAQ, provider forms, logo"
```

---

## Phase 5 — 收尾与全局验证

### Task 18: 清理旧令牌

**Files:**
- Modify: `tailwind.config.mjs`

- [ ] **Step 1: 确认无引用**

```bash
grep -rnE 'background-dark|background-light|bg-gradient-brilliant' --include='*.tsx' --include='*.ts' --include='*.html' .
```
`bg-gradient-brilliant`（登录/根容器背景）应仍在使用——**保留**。`background-dark`/`background-light` 若无引用，进入 Step 2。

- [ ] **Step 2: 删除 `tailwind.config.mjs` colors 中的 `background-light`、`background-dark`**（保留 `primary`，已指向 accent 蓝；如确认全项目无 `primary` 类引用也可一并删）。

- [ ] **Step 3: 验证 + 提交**

```bash
npm run build
git add tailwind.config.mjs
git commit -m "chore(ui): remove legacy dark theme tokens"
```

### Task 19: 全局扫描与测试

- [ ] **Step 1: 全项目残留深色令牌扫描**

```bash
grep -rnE 'class="dark"|#0D0B14|#0d0b14|#1A1625|bg-background-dark' --include='*.tsx' --include='*.ts' --include='*.html' --include='*.css' .
grep -rnE 'text-white(?![-])|bg-white/|border-white/|bg-black/[0-9]|\bpurple-' --include='*.tsx' .
```
Expected: 仅剩**带注释的允许特例**（图片/画布 scrim、危险按钮红底白字）。逐条复核。

- [ ] **Step 2: 构建**

Run: `npm run build`
Expected: 成功。

- [ ] **Step 3: 现有测试套件**

Run: `npm run test`
Expected: 全绿（本次未改逻辑）。

- [ ] **Step 4: 目视核对清单（`npm run dev`）**
  - [ ] 登录页：浅蓝 mesh + 居中亚克力卡 + 蓝按钮 + Fluent 输入聚焦线
  - [ ] Header：亚克力顶栏 + 蓝色滑动药丸 + 图标统一蓝 hover
  - [ ] 创作页：亚克力控制卡 + 蓝渐变生成按钮 + 输入聚焦线 + 浅色 range
  - [ ] 预览/工具条/历史：浅色浮层 + 蓝激活态
  - [ ] 编辑器：浅色工具栏 + 蓝激活工具
  - [ ] 云图库：浅色卡片 + 蓝选中环
  - [ ] 设置：白底对话框 + 各标签/表单/保存按钮 Fluent 化
  - [ ] 管理后台：浅色表格/表单/操作
  - [ ] FAQ / Toast / Tooltip：浅色
  - [ ] 整体对比度无发灰糊、文字清晰可读

- [ ] **Step 5: 最终提交（如目视后有微调）**

```bash
git add <调整的文件>
git commit -m "polish(ui): Fluent 2 visual adjustments"
```

---

## 自查 — Spec 覆盖核对

- spec §4 令牌 → Task 1/2 ✅
- spec §5.2/5.3/5.4（css/html/App）→ Task 2/3/4 ✅
- spec §6 映射表 → 共享映射参考 ✅
- spec §7 组件模式（卡片/field/按钮/select/toggle/range/toast）→ Task 2/4/5/10 ✅
- spec §8 各界面 → Task 8–17 全覆盖 ✅
- spec §9 实现顺序 → Phase 1–5 对应 ✅
- spec §11 验证 → Task 19 ✅
