# Fluent 2 浅色主题重设计 — 设计文档

- **日期**：2026-06-03
- **分支**：feature/multi-user-mysql
- **状态**：已确认，待实现
- **作者**：brainstorming 协作产出

## 1. 背景

Peinture 当前是一个**深色主题**的 AI 图像生成工具：背景 `#0D0B14` + `bg-gradient-brilliant`（紫/橙/粉放射状渐变），强调色为紫色（`purple-600` / `#4b2bee`），主按钮为"紫→粉→琥珀"渐变，文字为白色叠不同透明度（`text-white/{90,80,60,40,30}`）。用户认为现有界面观感不佳，希望参考 **Fluent 2（Windows 11 / core-fluent2）** 风格重做：浅色渐变背景、半透明亚克力卡片、Fluent 蓝、清爽圆角、轻量空间动效。

技术栈：React 19 + Vite + Tailwind CSS 3.4 + lucide-react + zustand + sonner。

## 2. 目标与非目标

### 目标
- 全应用切换为 **Fluent 2 浅色**观感：浅蓝 mesh 背景 + 亚克力卡片 + Fluent 蓝强调色 + 收敛圆角 + 150–300ms 轻量动效。
- 建立一层**语义设计令牌**，把现有"深色白叠透明度"词汇系统性映射为 Fluent 浅色词汇。
- 覆盖全部界面：登录页、Header、创作页、编辑器、云图库、设置弹窗、管理后台、FAQ。

### 非目标（YAGNI）
- ❌ 不做双主题 / 深色模式（已确认全面浅色）。
- ❌ 不抽取组件 primitive 库（路线 C 已排除）。
- ❌ 不重排布局 / 不改信息架构（设置弹窗保留现有滑动标签，侧栏重排留作可选后续）。
- ❌ 不改组件结构、交互逻辑、数据流、路由、状态管理。

## 3. 关键决策

| 维度 | 决策 |
|---|---|
| 主题色调 | 全面浅色 Fluent 2 |
| 强调色 | 全面 Fluent 蓝（放弃紫色品牌色） |
| 覆盖范围 | 整个应用 |
| 执行路线 | A：语义令牌 + 系统化换肤 + 关键 Fluent 精修 |

## 4. 设计令牌

### 4.1 Fluent 蓝（强调色）
| 令牌 | 值 | 用途 |
|---|---|---|
| `accent` | `#0F6CBD` | 主按钮、选中态、聚焦环、链接、accent 图标 |
| `accent-hover` | `#115EA3` | 悬停（Fluent 习惯：悬停更深） |
| `accent-pressed` | `#0F548C` | 按下 |
| `accent-light` | `#EBF3FC` | 选中项 / 悬停的浅蓝底 |

### 4.2 画布与表面
| 令牌 | 值 | 用途 |
|---|---|---|
| `canvas` | `#F3F6FB` + 柔和蓝色 mesh 渐变 | 页面背景（body） |
| `card` | `rgba(255,255,255,0.72)` | 亚克力卡片/面板主表面（配 `backdrop-blur-xl`） |
| `surface` | `#FFFFFF` | 不透明卡片、下拉菜单、弹窗内容 |
| `fill-subtle` | `rgba(0,0,0,0.03)` | 输入框底、chip（原 `white/5`） |
| `fill` | `rgba(0,0,0,0.06)` | 悬停填充、开关关闭态轨道（原 `white/10`） |
| `fill-strong` | `rgba(0,0,0,0.09)` | 更强悬停/按下填充 |

### 4.3 墨色（文字 / 图标）
| 令牌 | 值 | 原对应 |
|---|---|---|
| `ink` | `#242424` | `text-white` / `white/90` |
| `ink-secondary` | `#5C5C5C` | `white/60` |
| `ink-tertiary` | `#8A8A8A` | `white/40` |
| `ink-placeholder` | `#BDBDBD` | `white/30` |
| `on-accent` | `#FFFFFF` | accent 上的文字/图标 |

### 4.4 描边
| 令牌 | 值 | 原对应 |
|---|---|---|
| `stroke` | `rgba(0,0,0,0.08)` | `border-white/10` |
| `stroke-subtle` | `rgba(0,0,0,0.05)` | `border-white/5` |
| `stroke-strong` | `rgba(0,0,0,0.18)` | 控件底部强描边（Fluent 输入框） |

### 4.5 高度阴影（Fluent elevation）
| 令牌 | 值 | 用途 |
|---|---|---|
| `shadow-card` | `0 2px 4px rgba(0,0,0,0.10), 0 0 2px rgba(0,0,0,0.08)` | 静态卡片 |
| `shadow-card-hover` | `0 8px 16px rgba(0,0,0,0.12), 0 0 2px rgba(0,0,0,0.10)` | 卡片悬停 |
| `shadow-flyout` | `0 8px 16px rgba(0,0,0,0.14), 0 0 2px rgba(0,0,0,0.12)` | 下拉/弹出 |
| `shadow-dialog` | `0 14px 28px rgba(0,0,0,0.20), 0 0 8px rgba(0,0,0,0.14)` | 对话框 |

### 4.6 圆角
| 令牌 | 值 | 用途 |
|---|---|---|
| 控件 | `6px` | 按钮、输入框、下拉、chip |
| 卡片/面板 | `8px` | 卡片、下拉菜单容器 |
| 对话框 | `12px` | 模态弹窗、登录卡片 |
| 胶囊 | `9999px` | Header 导航药丸、toggle |

> ⚠️ 比现状更收敛（现卡片为 12–16px），这是 Fluent 的"清爽几何"DNA。若实现后觉得太硬，可整体上调到 8/12px。

### 4.7 动效
- 时长：`fast 100ms` / `normal 200ms` / `gentle 250ms` / `slow 300ms`。
- 缓动：减速曲线 `cubic-bezier(0.1, 0.9, 0.2, 1)`；标准 `cubic-bezier(0.33, 0, 0.67, 1)`。
- 全部落在 150–300ms 区间，强调"轻量空间变化"而非夸张弹跳。

## 5. 配置改动

### 5.1 `tailwind.config.mjs`
在 `theme.extend` 中新增：
- `colors`：`accent`/`accent-hover`/`accent-pressed`/`accent-light`、`canvas`、`card`、`surface`、`fill-subtle`/`fill`/`fill-strong`、`ink`/`ink-secondary`/`ink-tertiary`/`ink-placeholder`、`stroke`/`stroke-subtle`/`stroke-strong`。
  - solid hex 令牌（`accent`、`ink*`、`stroke-strong`）用 `#RRGGBB`，以便支持 `/40` 等 alpha 修饰。
  - 半透明令牌（`fill*`、`stroke`、`stroke-subtle`、`card`）直接用 `rgba(...)`。
- `boxShadow`：`card`、`card-hover`、`flyout`、`dialog`。
- `borderRadius`：调整 `DEFAULT`/`md`/`lg`/`xl` 为 Fluent 尺度（控件 6、卡片 8、对话框 12）。
- 保留现有 `fontFamily.display`、`primary`、`background-light/dark`（背景旧令牌实现完成后清理）。

### 5.2 `index.css`
- `@layer base body`：背景改 `canvas`、文字改 `ink`。
- 重写 `.bg-gradient-brilliant` → 浅蓝 mesh（低饱和、明亮）：
  ```css
  .bg-gradient-brilliant {
    background-color: #F3F6FB;
    background-image:
      radial-gradient(at 20% 20%, hsla(210, 100%, 90%, 0.55) 0px, transparent 50%),
      radial-gradient(at 80% 10%, hsla(205, 100%, 92%, 0.45) 0px, transparent 50%),
      radial-gradient(at 70% 85%, hsla(220, 85%, 92%, 0.40) 0px, transparent 50%);
    background-attachment: fixed;
  }
  ```
- 重写 `.generate-button-gradient` → Fluent 蓝渐变（`#2886DE → #0F6CBD → #115EA3`）。
- 滚动条：thumb 由 `rgba(255,255,255,0.15)` 改为 `rgba(0,0,0,0.18)`，悬停加深；Firefox 同步。
- `.custom-range` 轨道由白半透明改为 `rgba(0,0,0,0.12)`，thumb 用 `currentColor`（由 `text-accent` 驱动）。
- 新增 `.acrylic-card` 复合工具类（`bg-card` + `backdrop-blur-xl` + 顶部高光描边 + `shadow-card`），用于卡片统一材质。
- 新增 `.fluent-field` 工具类：白底 + 四周 `stroke` + 底部 `stroke-strong`，聚焦时底部 2px `accent` 高光线（用 `box-shadow inset 0 -2px accent` 或 border-bottom 动画实现）。

### 5.3 `index.html`
- `<html lang="en" class="dark">` → 去掉 `class="dark"`。
- `<body class="bg-background-dark font-display text-white">` → `class="bg-canvas font-display text-ink">`。

### 5.4 `App.tsx`
- `ToasterPortal`：`theme="dark"` → `theme="light"`，toast 样式改为浅色 Fluent 卡片（白底、`stroke` 边、`ink` 文字）。
- `FullscreenSpinner`：spinner 颜色 `text-white/60` → `text-accent`（背景 mesh 不变）。
- 视图切换过渡保持不变。

## 6. 深→浅 映射规则（机械替换）

| 现在 | 换成 |
|---|---|
| `text-white` / `text-white/90` | `text-ink` |
| `text-white/80` | `text-ink`（强）或 `text-ink-secondary`（弱） |
| `text-white/60` | `text-ink-secondary` |
| `text-white/40` | `text-ink-tertiary` |
| `text-white/30` / placeholder | `text-ink-placeholder` |
| `bg-black/20`、`bg-[#0D0B14]`（卡片/弹窗） | `acrylic-card` 或 `bg-surface` |
| `bg-[#1A1625]`（下拉/弹出） | `bg-surface` + `shadow-flyout` |
| `bg-white/5` | `bg-fill-subtle` |
| `bg-white/10` / `hover:bg-white/10` | `bg-fill` / `hover:bg-fill` |
| `border-white/10` | `border-stroke` |
| `border-white/5` | `border-stroke-subtle` |
| `bg-purple-600` / `hover:bg-purple-500` / `active:bg-purple-700` | `bg-accent` / `hover:bg-accent-hover` / `active:bg-accent-pressed` |
| `text-purple-400` / `text-purple-300` | `text-accent` |
| `ring-purple-500/50`、`focus:border-purple-500` | `ring-accent/40`、`focus:border-accent` |
| `bg-purple-600/20 text-purple-400`（选中态） | `bg-accent-light text-accent` |
| Header 图标多色 hover（红/绿/紫） | 统一 `hover:text-accent` + `hover:bg-fill` |
| `shadow-2xl shadow-black/20` | `shadow-card` / `shadow-card-hover` |

## 7. 组件 / 材质模式

- **亚克力卡片**：`acrylic-card`（`bg-card` + `backdrop-blur-xl` + 顶部高光描边 + `shadow-card`）；交互卡片悬停 `-translate-y-0.5` + `shadow-card-hover`（200ms 减速曲线）。
- **Fluent 输入框（标志细节）**：`fluent-field`——白底 + 细描边 + 底部较重描边；聚焦时底部展开 2px Fluent 蓝高光线 + 柔和聚焦环。应用于 PromptInput textarea、Select 触发器、Seed 输入、各设置表单 input。
- **主按钮**：`bg-accent` 实心 + `text-on-accent`，悬停 `bg-accent-hover` + `shadow-card`，按下 `bg-accent-pressed`。
- **生成按钮（hero）**：保留醒目地位，用 `generate-button-gradient`（Fluent 蓝渐变）+ 蓝色光晕阴影；loading/disabled 行为不变。
- **次级按钮**：`bg-surface` + `border-stroke`，悬停 `bg-fill`。
- **图标按钮**：`text-ink-secondary`，悬停 `text-accent` + `bg-fill`。
- **Toggle / 开关**：开 `bg-accent`、关 `bg-fill`，滑块白色；结构不变仅换色。
- **Select / 下拉**：触发器用 `fluent-field`；菜单 `bg-surface` + `border-stroke` + `shadow-flyout`；选中项 `bg-accent-light text-accent`，悬停 `hover:bg-fill`。
- **Range 滑块**：浅色轨道 + `text-accent` 驱动 thumb。
- **Toast**：浅色 Fluent 卡片。

## 8. 各界面落地要点

| 界面 | 要点 |
|---|---|
| `index.html` / `index.css` | 去 dark、浅蓝 mesh、浅色滚动条/range、acrylic/field 工具类 |
| `App.tsx` | 浅色 Toast、accent spinner |
| Header | 半透明亚克力顶栏（白底毛玻璃 + 底部 stroke），滑动药丸用 accent，图标 hover 统一 accent |
| LoginView | 居中亚克力对话框浮于蓝色 mesh（最像 Win11 系统对话框） |
| CreationView | 左侧控制卡 → 亚克力；生成按钮 → Fluent 蓝 hero；输入框 → fluent-field |
| ControlPanel / PromptInput / Select | 全部套用 field/卡片/下拉模式 |
| PreviewStage / ImageToolbar / ImageComparison | 工具条/浮层换为浅色亚克力 + accent 图标 |
| HistoryGallery | 缩略图卡片浅色描边 + 选中 accent 环 |
| ImageEditorView / editor/* | 工具栏浅色亚克力 + accent 激活态 |
| CloudGalleryView | 卡片/筛选器套用令牌 |
| SettingsModal + settings/* | 弹窗 `bg-surface` + `shadow-dialog`；标签、表单、保存按钮套令牌（保留滑动标签布局） |
| AdminView + admin/* | 表格/表单/操作按钮套令牌 |
| FAQModal / ErrorBoundary / Skeleton / Tooltip | 套令牌；Tooltip 定为浅色气泡：`bg-surface` + `border-stroke` + `text-ink` + `shadow-flyout`（Fluent 惯例） |

## 9. 文件清单与实现顺序

**阶段 1 — 令牌地基（先行，必须最先完成）**
1. `tailwind.config.mjs`（新增令牌）
2. `index.css`（base、mesh、滚动条、range、`.acrylic-card`、`.fluent-field`、generate 渐变）
3. `index.html`（去 dark、body 类）
4. `App.tsx`（Toast、spinner）

**阶段 2 — 共用组件（影响面最广，优先换）**
5. `components/Select.tsx`、`Tooltip.tsx`、`Skeleton.tsx`、`ErrorBoundary.tsx`

**阶段 3 — 核心可见界面**
6. `components/Header.tsx`
7. `components/LoginView.tsx`
8. `views/CreationView.tsx` + `components/PromptInput.tsx` + `ControlPanel.tsx`
9. `components/PreviewStage.tsx` + `ImageToolbar.tsx` + `ImageComparison.tsx` + `HistoryGallery.tsx`

**阶段 4 — 其余界面**
10. `views/ImageEditorView.tsx` + `components/editor/*`
11. `views/CloudGalleryView.tsx`
12. `components/SettingsModal.tsx` + `components/settings/*`
13. `views/AdminView.tsx` + `components/admin/*`
14. `components/FAQModal.tsx`、`ProviderForm.tsx`、`ProvidersManager.tsx`、`Icons.tsx`（Logo 配色如有）

**阶段 5 — 收尾**
15. 清理 `tailwind.config.mjs` 中废弃的 `background-dark` 等旧令牌（确认无引用后）。
16. 全屏目视核对 + 构建 + 测试。

## 10. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 浅底上对比度不足（原白字逻辑反转） | 严格按映射表用 `ink/ink-secondary/ink-tertiary`，关键文字校验 WCAG AA |
| 亚克力毛玻璃在浅底上"发灰糊" | `card` 透明度 0.72 偏高 + 顶部高光描边 + `shadow-card` 提升清晰度 |
| 遗漏散落的硬编码深色（`#0D0B14`/`#1A1625`/`white\/`/`purple-`） | 实现后用 grep 全量扫描这些 token 收尾 |
| 圆角收敛后观感偏硬 | 令牌集中，可一处上调 |
| 改动面大碰坏行为 | 只改 className 与样式文件；分阶段；每阶段后构建 |

## 11. 验证

- `npm run build` 通过（无类型/构建错误）。
- `npm run test`（vitest）全绿——本次只改样式，不应影响测试。
- grep 扫描确认无遗留：`bg-\[#0D0B14\]`、`#1A1625`、`text-white`、`bg-white/`、`purple-`、`bg-black/`、`class="dark"`。
- 逐屏目视核对（登录、创作、编辑器、图库、设置各标签、管理后台、FAQ）。

## 12. 后续（可选，本次不做）
- 设置弹窗改 Fluent 侧栏导航布局。
- Header 改 Fluent 命令栏。
- 抽取 Fluent primitive 组件库。
- 深色模式（双主题）。
