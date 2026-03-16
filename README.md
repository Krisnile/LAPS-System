# LAPS-System

轻量交互式图像标注系统，基于 **Django + React + SAM**。

## 功能简介

- **账号系统**：自定义登录 / 注册页，支持中英文切换、主题色切换、深色 / 浅色模式。
- **项目 / 数据集 / 任务管理**：按项目组织数据集和标注任务，主页提供简单的统计与快捷入口（已 React 化）。
- **标注工作区**：基于 Segment Anything Model（SAM）的点选 / 框选交互式分割，支持撤销、清除与结果保存。
- **统一主题**：侧边栏、顶部栏、按钮、提示文字等随主题联动，登录页支持左布局 / 居中布局切换。

## 快速开始

1. 创建并激活环境（建议 Python 3.10）：

```bash
conda create -n laps python=3.10 -y
conda activate laps
pip install -r requirements.txt
```

2. 初始化数据库与静态文件：

```bash
python manage.py makemigrations
python manage.py migrate
python manage.py collectstatic --noinput
```

3. 构建前端（首次或修改前端代码后需要）：

```bash
cd frontend
npm install        # 首次执行
npm run build      # 生成 static/frontend/assets/main-*.js
```

4. 启动开发服务器：

```bash
python manage.py runserver
# 打开浏览器访问 http://127.0.0.1:8000/
```

## 技术栈

- **后端**：Django、SQLite（默认）/ PostgreSQL（可选）
- **前端**：React + Vite（登录页、Dashboard、Projects / Datasets / Tasks）、自定义主题 `laps-theme.css`
- **标注引擎**：Segment Anything Model（SAM）

更多实现细节可直接阅读源码与注释。***
# LAPS-System
轻量交互式图像标注系统（基于 SAM 的点/框提示分割）

本仓库实现了一个面向研究与数据标注流程的轻量级平台，主要目标是：

- 使用 SAM（Segment Anything Model）作为交互式分割引擎，支持点提示、框提示等方式生成遮罩（mask）。
- 提供项目 / 数据集 / 任务 / 标注 的简单工作流，适合研究生/工程化毕业设计使用。
- 基于 Django 服务端渲染模板（模板 + 静态资源 + 小量前端 JS），并在前端提供实时的中英文切换与主题切换（深色/浅色）。

主要特性概览
- 图像上传与管理：按数据集组织图片并生成任务。
- 交互式标注界面：点/框提示 → SAM 分割 → 结果可视化，支持保存、撤销、清除与历史回放。
- 项目/任务管理：任务分配、标注保存并记录 Annotation 到数据库。
- 仪表盘主页（已用 React 重写）：欢迎语、项目/数据集/任务 KPI（含待办与已完成）、最近任务列表与快捷标注入口、空状态时快速开始引导。
- 客户端国际化：页面元素通过 `data-en` / `data-zh` 即时切换，语言保存在 localStorage。
- 主题与界面：深色/浅色（white-content）可切换；专业主题 `laps-theme.css`（Inter 字体、统一卡片与侧栏样式）；顶部栏/侧边栏/强调文字会随主题色变化；页脚固定在底部。

快速开始（开发者）

前提：项目在 conda 环境中开发/运行（推荐 Python 3.10）。

1. 创建并激活环境（示例）

```bash
# create env (example)
conda create -n laps python=3.10 -y
conda activate laps
pip install -r requirements.txt
```

2. 数据库迁移与静态文件

```bash
python3 manage.py makemigrations
python3 manage.py migrate
python3 manage.py collectstatic --noinput
```

3. 构建前端（React 仪表盘与登录页）

前端使用 Vite + React，仅作为若干页面（登录页、Dashboard、Projects/Datasets/Tasks 等）的增强 UI 层，打包产物会被 Django 模板通过 `{% static %}` 引入：

```bash
cd frontend
npm install        # 首次拉取仓库时执行
npm run build      # 构建到 static/frontend/
```

4. 运行开发服务器

```bash
python3 manage.py runserver
# 访问 http://127.0.0.1:8000/
```

5. 使用 PostgreSQL 存储用户与业务数据（可选）

默认使用 SQLite（`db.sqlite3`）。若需使用 PostgreSQL 存储用户信息（账号、邮箱、昵称、密码、头像等）及项目/任务等数据，在项目根目录的 `.env` 中配置：

```bash
DB_ENGINE=postgresql
DB_NAME=laps
DB_USERNAME=your_db_user
DB_PASS=your_db_password
DB_HOST=localhost
DB_PORT=5432
```

安装依赖中已包含 `psycopg2-binary`。配置后执行 `migrate` 即可在 PostgreSQL 中创建表（含 `auth_user`、`pages_userprofile` 等）。

如果想创建示例数据，可使用 Django shell（或提供的辅助脚本）来创建 Project/Dataset/Image/Task。

页面与功能（面向用户与开发人员说明）

下面按页面给出“用户可见功能（如何操作）”与“程序员注意点/实现位置（方便后续开发）”。

1) 仪表盘（Dashboard，主页）
- 用户：登录后首页；欢迎语、项目/数据集/任务数量（含待办与已完成）、快捷操作（创建项目、上传数据集、打开标注）；最近任务列表（状态徽章 + 标注入口）；无数据时显示快速开始引导。
- 程序员：模板 `templates/pages/dashboard.html`；视图 `apps/pages/views.py::index` 提供 `projects_count`、`datasets_count`、`tasks_count`、`pending_tasks`、`completed_tasks`、`recent_tasks`。

2) 项目（Projects）
- 用户：管理项目（创建/编辑/删除）；每个项目可关联标签配置与多个数据集。
- 程序员：模型位于 `apps/pages/models.py`（Project），视图在 `apps/pages/views.py`，路由在 `apps/pages/urls.py`。

3) 数据集（Datasets）
- 用户：为项目创建数据集，上传图片（可通过页面上传或后台批量导入），查看图片列表。
- 程序员：图片文件使用 `ImageField`/文件存储；上传逻辑在 `apps/pages/views.py` 的上传接口；静态/媒体存放按 Django MEDIA 设置。

4) 任务（Tasks）
- 用户：为图片生成或分配任务，查看任务队列，领取/指派任务。
- 程序员：存在 `/tasks/next/` 接口供前端请求下一个未完成任务；任务模型与状态管理在 `apps/pages/models.py` 的 Task 类。

5) 标注（Annotate / Annotation workspace）
- 用户：核心标注界面，布局为两栏（左侧图像与交互区，右侧属性与标签面板）：
	- 上传/切换图片；使用鼠标单击画布设置点（正例/负例）；点击“运行（Run）”调用 `/segment-image/` 生成遮罩；在界面预览并调整遮罩透明度；保存（Save）将遮罩与注释信息 POST 到 `/api/annotations/`。
	- 支持“撤销（Undo）”、“清除（Clear）”、“下一张（Next）”等操作；历史（History）面板显示过往操作记录。
- 程序员：模板在 `templates/pages/annotation.html`，前端逻辑在 `static/assets/js/annotation.js`（处理提示点、调用分割、显示 mask、保存注释）；后端分割 API 在 `apps/pages/views.py::segment_image`，保存接口在 `apps/pages/views.py::save_annotation`。

6) 右上齿轮（Fixed plugin）
- 用户：主题（浅色/深色）与语言（中/英）切换按钮；点击语言选择不会自动收起下拉，语言保存在 localStorage，页面即时生效。
- 程序员：模板 `templates/includes/fixed-plugin.html`；样式覆盖 `static/assets/css/fixed-plugin-override.css`；语言切换代码集中在 `static/assets/js/lang-switcher.js`（全站复用）。

7) 用户管理系统（仅 admin 账户）
- 用户：使用**用户名 admin、密码 123456** 登录后会自动跳转到用户管理页 `/manage/`；可查看所有用户（对应数据库 auth_user 表的 ID、用户名、邮箱、昵称、注册时间、状态），并对非 admin 用户进行启用/禁用。
- 首次使用请执行：`python manage.py create_admin`，将创建用户 admin（密码 123456）；之后用该账号登录即可进入用户管理。
- 程序员：视图 `apps/pages/views.py::user_manage_list`、`user_manage_toggle_active`；模板 `templates/pages/user_manage.html`；路由 `manage/`、`manage/user/<id>/toggle/`。

后端 API（重要开发接口）
- GET /tasks/next/ — 返回下一个任务与图片 URL（JSON）。
- POST /segment-image/ — 接收图片路径与提示点，调用 SAM 生成 mask，返回二进制图像或 base64（当前实现返回 PNG 二进制）。
- POST /api/annotations/ — 接收 annotation 数据（task, user, mask path, labels, metadata），保存到 DB 并返回 annotation id。

程序员快速参考（文件与逻辑位置）
- 核心 App：`apps/pages/`（models.py, views.py, urls.py, templates/pages/）
- 模板布局：`templates/layouts/base.html` 与 `templates/includes/`（sidebar, navigation, fixed-plugin, footer 等）
- 静态资源：`static/assets/js/`（如 `lang-switcher.js`、`annotation.js`）、`static/assets/css/`（`laps-theme.css` 主题与侧栏/卡片/页脚样式，`fixed-plugin-override.css` 浅色主题与页脚透明）
- SAM：`apps/pages/sam_inference.py`；运行时可能有 torch 的 FutureWarning（`torch.load` 的 `weights_only`），部署前建议处理。

代码结构（整理说明）
- **布局**：`base.html` 主站（侧栏+顶栏+内容+页脚）；`base_auth.html` 登录/注册；`base_standalone.html` 个人设置；`base_manage.html` 用户管理（无侧栏）。
- **head/脚本**：统一使用 `includes/head.html`、`includes/scripts.html`，避免重复；页脚等全局样式仅在 `laps-theme.css` 定义。
- **已归档**：`/image-processing/`、`/examples/` 重定向首页；旧模板在 `templates/archived_templates/`，仅通过 `/examples/<name>/` 可访问。
- **无用/占位**：`includes/navigationrtl.html`、`rtlsidebar.html` 为 RTL 占位，主站未使用。

代码整理与本次修改记录
- **Bug 修复**：`views.py` 中 `Image.open` 改为 `PILImage.open`（两处）；缺失模板的 `image_processing`、`examples_index` 改为重定向首页，避免 TemplateDoesNotExist。
- **重复代码合并**：`.footer` 样式仅保留在 `laps-theme.css`，从 `fixed-plugin-override.css` 中移除重复定义。
- **注释与文档**：为 `apps/pages/views.py`、`urls.py` 增加文件头注释；为 `includes/head.html`、`scripts.html`、`layouts/base.html`、`fixed-plugin-override.css`、`theme-switcher.css` 增加用途说明；为归档路由在 `urls.py` 增加行尾注释；新增 `templates/archived_templates/README.md` 说明归档模板用途。
- **主题与侧栏**：在 `laps-theme.css` 中定义主题变量 `--laps-bg`、`--laps-bg-light`、`--laps-text`、`--laps-text-muted`、`--laps-border`；侧栏背景改为使用主题背景（与主内容区一致）；全站部分文字颜色（body、顶栏、页脚、内容区、卡片标题/副标题）统一使用上述变量，切换深浅主题时整体一致。
- **布局统一**：登录/注册页使用 `base_auth.html`（共用 `includes/head.html`），个人设置页使用 `base_standalone.html`（共用 head）；顶栏与主页一致：内边距 12px 20px、min-height 56px，个人信息页顶栏样式与主站 navbar 对齐。
- **账户与用户管理**：右上角下拉提供「账户与设置」「登出」；个人设置页为独立页（无侧栏）、保存后成功/失败提示；admin 登录跳转 `/manage/`，用户管理为独立系统（无侧栏）；`python manage.py create_admin` 创建 admin（密码 123456）；侧栏已移除登出入口，仅保留下拉内登出。
- **登录/注册页**：支持语言与主题切换（fixed-plugin + lang-switcher）；表单与错误提示 i18n（data-en/data-zh）。

国际化 & 主题（实现说明）
- 当前实现采用客户端即时切换：所有需要翻译的可见文本都应带上 `data-en` 与 `data-zh` 属性（这样 `lang-switcher.js` 能统一替换）。
- 如果希望迁移为 Django 的服务端 i18n（gettext），需要逐步替换模板中的可见文本为 `{% trans "..." %}`，生成 `.po/.mo` 并开启 `LocaleMiddleware`。

运行时注意事项
- 开发时 `python3 manage.py runserver` 即可；运行过程中会打印 SAM/torch 的 FutureWarning（属于第三方库提示，非本项目直接错误）。
- 数据文件与媒体请确认 `MEDIA_ROOT` 可写并在 `settings.py` 中正确配置。

测试与质量门（建议）
- 单元测试：`apps/*/tests.py` 中可加入更多覆盖后端视图与模型的测试。
- 集成测试：用 Django Test Client 模拟任务流（创建 Project/Dataset/Image/Task -> GET /tasks/next/ -> POST /segment-image/ -> POST /api/annotations/），确保端到端可用。

后续改进建议（short list）
- 把客户端 i18n 迁移到 Django gettext（更全面、SEO 友好）。
- 更完善的标注工具（多边形、画笔、键盘快捷键、标签自动建议）。
- 权限与多用户协作（任务分配、审核、版本管理）。
- SAM 模型加载安全：在生产环境中使用 weights_only=True 或审计权重来源。

贡献与维护
- 欢迎通过 GitHub Issues / Pull Requests 参与改进：
	https://github.com/Krisnile/LAPS-System

---

