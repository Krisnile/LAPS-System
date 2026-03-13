---
name: laps-frontend-design
description: Frontend UI/UX guidelines for the LAPS-System dashboard (colors, layout, components). Use for any HTML/CSS/JS or template changes affecting the look and feel.
---

# LAPS-System 前端设计规范（Dashboard）

本 Skill 约束在 **LAPS-System** 项目中做前端改动时的设计风格（配色、排版、组件形态），目标是：**专业、简洁、偏企业级仪表盘**。

## 1. 总体设计原则

1. **优先一致性，其次炫酷**
   - 不要为了「好看」大幅偏离现有信息结构。
   - 优先统一：颜色、间距、圆角、阴影、字体大小等。
2. **高对比 + 低饱和**
   - 深色背景 + 中性色文本，通过少量主题色做强调。
   - 避免高饱和大面积纯色背景（尤其在深色模式）。
3. **一页一个主色**
   - 当前主题色来自侧边栏（红 / 蓝 / 绿）。
   - 同一页面只使用这一种主色做强调（按钮、激活态、少量边线）。
4. **使用已有 CSS 变量**
   - 优先使用 `laps-theme.css` 中的变量：
     - `--laps-bg`, `--laps-bg-light`
     - `--laps-text`, `--laps-text-muted`
     - `--laps-border`
   - 不要在新样式里硬编码大量颜色，除非是在定义新的主题变量。

## 2. 颜色与主题

### 2.1 基础背景与文字

- 深色模式：
  - 页面背景：`#141625` 或 `var(--laps-bg)`
  - 侧边栏背景：`#101221`
  - 主文字：`var(--laps-text)`（接近 `#f5f5f7`，非纯白）
  - 次文字：`var(--laps-text-muted)`
- 浅色模式：
  - 页面背景：`var(--laps-bg-light)`（浅灰蓝）
  - 卡片背景：`#ffffff`
  - 文本同样用 `var(--laps-text)` / `var(--laps-text-muted)`。

### 2.2 主题色（由侧边栏 data-color 驱动）

在 `laps-theme.css` 的 `:root` 中使用的主色（如已存在则沿用，不要无故改动值，只在此文中引用）：

- `--laps-accent-primary`: 红 / 品红（用于红色主题）
- `--laps-accent-blue`: 深蓝（用于蓝色主题）
- `--laps-accent-green`: 较柔和的绿色（用于绿色主题）
- 对应的柔和版：
  - `--laps-accent-primary-soft`
  - `--laps-accent-blue-soft`
  - `--laps-accent-green-soft`

**约定：**

- 通过 `.sidebar[data-color=...]` 决定当前页面主题色：
  - primary → 使用 `--laps-accent-primary` / `--laps-accent-primary-soft`
  - blue → 使用 `--laps-accent-blue` / `--laps-accent-blue-soft`
  - green → 使用 `--laps-accent-green` / `--laps-accent-green-soft`
- 所有「强调色」使用 `var(--laps-accent)`，而不是单独硬编码颜色。

## 3. 布局与间距

1. **主布局**
   - PC：左侧固定侧边栏 + 右侧 `.main-panel`，保持现有结构。
   - 移动：侧边栏隐藏，由原模板控制，不在 Skill 中强改。
2. **内容区 (`.content`)**
   - PC 内边距：`32px 30px 40px`（已在 `laps-theme.css` 中定义）。
   - 尽量使用栅格（Bootstrap 的 `row` / `col-md-*`）组织卡片，不要随意拼 `float`。
3. **卡片与模块间距**
   - 卡片之间上下间距：`24px` 左右（可通过 `mb-3` / `mb-4` 或自定义）。
   - 卡片内侧边距：使用 `card-header` 与 `card-body` 现有 padding，不再重复设。

## 4. 关键组件规范

### 4.1 顶部导航（`includes/navigation.html`）

- 背景：
  - 深色：使用现有 `navbar.navbar-absolute.navbar-transparent` 样式（半透明 + blur）。
  - 浅色：白色带轻微阴影。
- 标题（`.navbar-brand`）：
  - 字重 ≥ 600，字号约 `1rem`，字母间距 `0.02em`。
  - 不要再额外加粗的下划线或过多图标，以保持简洁。
- 右侧操作区：
  - 主题切换、搜索、通知、头像下拉的顺序保持不变；
  - 新增按钮时，优先使用 `.btn` 或 `.nav-link`，不要混用 inline style。

### 4.2 侧边栏（`includes/sidebar.html`）

- 外层 `.sidebar`：
  - 深色模式：`#101221`
  - 浅色模式：`#ffffff`
  - 不再根据主题色做大面积背景切换，只在内部 `wrapper` 与选中项做主题体现。
- 内层 `.sidebar-wrapper`：
  - 使用柔和渐变/纯色结合主题色（例如：顶部微弱着色 → 深色底）。
  - 圆角保持默认（Black Dashboard 已处理，除非视觉明显冲突，再做微调）。
- 导航项：
  - 激活项颜色：文字使用 `var(--laps-accent)`，背景使用 `var(--laps-accent-soft)` 或低透明度的深色块。
  - 非激活项使用中性色，hover 简单加深背景，不用强烈高光。

### 4.3 按钮

1. 公共规则：
   - 圆角：`8px`。
   - 字重：`500`。
   - hover：轻微上浮（Y 轴 -1px）+ 细微阴影，不要大面积放大或强烈发光。
2. `btn-primary`：
   - 若无特别需求，继续使用 Black Dashboard 内建颜色（来自 `black-dashboard.css`），不要强行绑定当前主题色。
   - 如必须主题化，使用：
     - 背景：`var(--laps-accent)`
     - 边框：同背景或稍暗
     - 字体：`#ffffff`
3. 其他语义按钮（`btn-success`, `btn-danger` 等）：
   - 仅在业务语义明确（成功/危险）时使用，不作为主题色替代。

### 4.4 卡片（`.card`）

- 保持当前圆角与阴影，只做以下小调整：
  - 标题（`.card-title`）建议单行，副标题用 `.card-category` 表达。
  - 若需要强调某卡片，可在卡片顶部或标题下添加一条短色条：
    - 使用 `border-top` 或 `::after` 伪元素，颜色为 `var(--laps-accent)`，高度 2px 左右。

### 4.5 表单与输入控件

- 输入框（`.form-control`）：
  - 圆角 `8px`，内边距 `10px 14px`（已在 CSS 中）。
  - 聚焦时可轻微改变边框颜色（可用主题色），但不要加过多阴影。
- 标签（`label`）：
  - 字号略小于标题，大于正文；保持与全局字体家族一致。

## 5. 修改前端时的操作步骤

每次在 LAPS-System 中做前端改动（模板、CSS、JS）时，请遵循：

1. **确认上下文**
   - 先阅读：`templates/layouts/base.html`、`templates/includes/*.html`、`static/assets/css/laps-theme.css`。
   - 确认：当前页面是否在使用 `base.html`/`base_auth.html`/`base_standalone.html`。
2. **使用已有组件**
   - 尽量复用 Bootstrap / Black Dashboard 已有组件和类。
   - 避免引入额外 UI 库（如 Tailwind、shadcn/ui 等），除非用户明确同意。
3. **样式落点**
   - 全局或通用调整 → 写在 `laps-theme.css` 中。
   - 某个独立页面的特殊样式 → 尽量放在专用 CSS（例如 `annotation.css`），避免污染所有页面。
4. **颜色与间距检查**
   - 新增颜色：优先选用 `var(--laps-*)` 或主题主色变量；如需新的常用色，应在 `:root` 定义变量后再使用。
   - 新增间距：尽量用现有 spacing 习惯（`24px` 左右的卡片间距，合适的内边距），避免出现过窄或过密的布局。
5. **多主题与多语言**
   - 注意深色 / 浅色模式下都要可读。
   - 若改动文案或新增文本，请继续按现有 `data-en` / `data-zh` 模式兼容多语言。

## 6. 示例：安全的前端美化改动

### 示例 1：统一按钮高度与圆角

- 目标：让所有动作按钮看起来一致。
- 做法：
  - 在 `laps-theme.css` 的 `.btn` 规则中统一：
    - `border-radius: 8px;`
    - `padding: 10px 18px;`
  - 避免在单个页模板（HTML）上单独写 `style="border-radius: 4px"` 之类的内联样式。

### 示例 2：轻微强调当前卡片

- 目标：当前页主要卡片更突出一点，但不过分抢眼。
- 做法：
  - 在该卡片的 HTML 上新增类名，如 `card card-main`。
  - 在 `laps-theme.css` 中加：
    - `.card-main { border-color: var(--laps-accent-soft); }`
  - 不要直接给整块卡片改成纯主题色背景。

---

今后在本项目内做任何 Dashboard UI 改动时，请先内化本 Skill，再基于这些约束进行设计与实现。这样可以在不引入大型 UI 框架的前提下，让 LAPS-System 的前端逐步变得统一、专业且易于维护。

