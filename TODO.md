LAPS-System 待办（中文，按优先级）

说明：可执行的改进列表，含目的、验收与相关文件，便于逐步完善。  
近期变更摘要见 **[CHANGELOG.md](CHANGELOG.md)**；环境与部署见 **[docs/SETUP.md](docs/SETUP.md)**。

## 已完成（供参考）

- 仪表盘 i18n：dashboard 页可见文案已加 `data-en`/`data-zh`。
- 仪表盘主页增强：欢迎语、KPI（含已完成）、最近任务列表与标注入口、空状态快速开始引导（`views.py::index`、`dashboard.html`）。
- 专业主题与布局：`laps-theme.css`（Inter 字体、侧栏/卡片/页脚样式）；页脚与主背景一致（透明）；main-panel 左边距与 footer 左内边距避免被侧栏遮挡。
- 固定插件浅色可读：`fixed-plugin-override.css` 保证主题/语言下拉在 white-content 下可读。
- 页面加载优化：全局已移除 Google Maps、TrackJS；字体异步加载（不阻塞首屏）；Chart/demo 全局加载以保持切换稳定。
- **账户与个人设置**：右上角下拉「账户与设置」→ 个人设置页（头像/邮箱/昵称、保存成功/失败提示）；个人设置页为独立布局（无侧栏），与主站 head 统一，顶栏样式与主站一致（含高度 56px）。
- **登录/注册**：登录页、注册页可切换语言与主题；admin 仍为初始密码时登录后 → **`/admin/password_change/`**；否则合法 `next` 优先；选「超级管理员」且 admin → **`/admin/`**；统一使用 `base_auth.html`。
- **用户管理**：内置 admin / admin123456（`migrate` 写入）；`create_admin` 可重置；侧栏已移除「登出」，仅保留下拉内登出。
- **主题变量与侧栏**：`laps-theme.css` 中定义 `--laps-bg`、`--laps-text`、`--laps-text-muted`、`--laps-border`；侧栏背景改为主题背景；全站部分文字颜色随主题变量统一。
- **代码整理**：`views.py` 中 `Image.open` → `PILImage.open` 修复；`image_processing` 因模板移除改为重定向首页；`.footer` 仅保留在 `laps-theme.css`，从 `fixed-plugin-override.css` 移除重复；为 views/urls、head/scripts、布局、CSS 增加注释；`archived_templates` 及 `/examples/` 路由已移除。

## 优先（建议先做）

- 补全其余页面的客户端 i18n（`data-en`/`data-zh`）
  - 目的：语言切换覆盖项目、数据集、任务、footer 等所有可见文本。
  - 验收：切换语言后各主要页面无遗漏。
  - 相关文件：`templates/pages/projects.html`、`datasets.html`、`tasks.html`、`templates/includes/footer.html` 等。
  - 参考命令：`grep -R "data-en" templates/ | cut -d: -f1 | sort -u`；`find templates -name '*.html' -exec grep -L "data-en" {} \;`
  - 估时：中（1-2 天）

- 处理 SAM 模型加载的 torch FutureWarning（安全/兼容性）
  - 目的：消除 torch.load 的安全/未来不兼容风险（例如 `weights_only` 参数）。
  - 验收：加载模型时无 FutureWarning，且记录/评估风险或使用推荐的安全加载方式。
  - 相关文件：可能是 `apps/pages/sam_inference.py` 或其他包含 model load 的文件。
  - 建议起步：定位加载模型的代码（grep "torch.load" 或搜索 SAM 加载函数），根据当前 PyTorch/segment_anything 推荐方式修改或 pin 依赖。
  - 估时：小->中（数小时到1天）

- 添加基本单元/集成测试（关键 API）
  - 目的：保证 `/tasks/next/`、`/segment-image/`、`/api/annotations/` 的稳定性。
  - 验收：新增测试通过，CI 能执行。
  - 相关文件：`apps/pages/tests.py`（已有），新增 `tests/test_annotation_flow.py` 等。
  - 建议起步命令：
    ```bash
    python3 manage.py test apps.pages
    ```
  - 估时：中（半天到1天）

## 重要（短期改进，提升可用性）

- 丰富标注工具（多边形、画笔/刷子、边界框、标签管理）
  - 目的：从点/掩码扩展为 LabelStudio 级别的交互工具。
  - 验收：在 `annotate` 页面可创建/编辑多边形、边框，并能保存为 `Annotation`。
  - 相关文件：`templates/pages/annotation.html`, `static/assets/js/annotation.js`, 后端 `views.py` 保存逻辑。
  - 建议：分步实现：先边界框，再多边形，最后刷子。
  - 估时：大（数天到数周）

- 任务与工作流（分配/审核/回退/历史）
  - 目的：实现多人协作与审核流程（assign/review/status transitions）。
  - 验收：能分配任务给用户、标注后进入待审、审阅通过/退回并记录历史。
  - 相关文件：`apps/pages/models.py`（Task 扩展）、`views.py`、`templates/pages/tasks*`。
  - 估时：中->大（几天）

- 导出/导入（COCO / PascalVOC / CSV）
  - 目的：支持模型训练与外部系统互通（导出标注到 COCO 等）。
  - 验收：成功导出 COCO 格式的 `annotations.json`，并能由外部脚本加载。
  - 相关文件：新增 `apps/pages/export.py`，前端增加导出按钮。
  - 估时：中（1-3 天）

## 可选/中长期（工程化、性能、安全）

- 迁移为服务端 i18n（Django gettext）
  - 目的：从客户端 DOM 替换迁移到 Django 原生 i18n（更完整、SEO 与无 JS 支持、更易维护）。
  - 验收：模板使用 `{% trans %}` 与 `.po/.mo` 文件，语言中间件工作正常。
  - 影响文件：大量模板重写，`settings.py` i18n 配置。
  - 估时：中->大（数天）

- 存储 & 性能（S3、CDN、缓存、分页）
  - 目的：实现大规模图片存储与性能优化。
  - 验收：图片/掩码能存至 S3，前端通过 CDN 加载，页面在大量数据下仍能响应。
  - 相关：修改 `settings.py`（storages）、迁移脚本。
  - 估时：中

- 权限与用户角色（admin/annotator/reviewer）
  - 目的：细粒度访问控制。
  - 验收：不同角色看到不同 UI/可执行操作。
  - 相关：models + views + templates + admin
  - 估时：中

- CI / CD（自动化测试、静态检查）
  - 目的：保证合并质量，自动运行测试和 lint。
  - 验收：PR 自动跑测试并阻止失败合并。
  - 建议工具：GitHub Actions
  - 估时：小->中

## 小任务 / UX 改善（快速可交付）

- 在 fixed-plugin 添加语言切换提示（帮助文案），确保 `#langSelect` 可访问
  - 估时：小（数小时）

- 提供「示例数据 / 快速体验」按钮（load demo dataset）
  - 目的：新用户一键加载 demo project/dataset/task 体验标注。
  - 验收：点击即可体验完整流程。
  - 估时：小（数小时）

- 标注页错误/提示文案国际化（`annotation.js` 中通过 `lang-switcher` 或 `data-en`/`data-zh` 获取）
  - 估时：小（半天）

## QA / 验收清单（质量门）

- 构建检查
  - `python3 manage.py check` → PASS
- 运行/烟雾测试
  - `python3 manage.py runserver` → 主页、标注页能打开
- 单元/集成测试
  - `python3 manage.py test` → 关键 API 测试通过
- Lint / Typecheck（可选）
  - 使用 `flake8` / `mypy`（如果引入）

示例命令：
```bash
python3 manage.py check
python3 manage.py migrate
python3 manage.py runserver
python3 manage.py test apps.pages
```

## 建议的短期行动计划

1. 补全项目/数据集/任务/页脚等页面的 `data-en`/`data-zh`。
2. 添加 3–5 个关键后端测试（`/tasks/next/`、`/segment-image/`、`/api/annotations/`）。
3. 实现边界框或多边形工具的最简版本（可选）。
4. 导出 COCO 格式；后续可考虑 server-side i18n 与权限角色。

## 风险与注意事项

- 客户端 i18n：SEO 与无 JS 场景有限，复杂需求可迁 Django gettext。
- SAM：`torch.load` 的 FutureWarning 建议上线前处理或记录。
- 存储：生产环境建议 S3 等；本地适合开发。
