# LAPS-System

轻量交互式图像标注系统，基于 **Django + React + SAM**。

## 功能简介

- **账号系统**：自定义登录 / 注册页，支持中英文切换、主题色切换、深色 / 浅色模式。
- **项目 / 数据集 / 任务管理**：数据集独立上传；创建项目时选择标注类型（当前 SAM 分割）并多选关联数据集；任务页可看图示并快速建项目；主页提供统计与快捷入口（已 React 化）。
- **标注工作区**：基于 Segment Anything Model（SAM）的点选 / 框选交互式分割，支持撤销、清除与结果保存。
- **统一主题**：侧边栏、顶部栏、按钮、提示文字等随主题联动，登录页支持左布局 / 居中布局切换。

## 快速开始

1. 创建并激活环境（建议 Python 3.10）：

```bash
conda create -n laps python=3.10 -y
conda activate laps
pip install -r requirements.txt
```

2. 准备 PostgreSQL 并配置 `.env`（可从 `env.sample` 复制；**macOS Homebrew / Ubuntu 完整步骤见下文「PostgreSQL：macOS（Homebrew）开发与 Ubuntu 生产」**）：

```bash
# 本机服务已启动后（如 brew services start postgresql@16）
createdb laps   # 或使用 psql / GUI 创建与 DB_NAME 一致的数据库
```

3. 初始化数据库与静态文件：

```bash
python manage.py makemigrations
python manage.py migrate
python manage.py collectstatic --noinput
```

执行 `migrate` 时会通过迁移 **`0010_ensure_default_admin_user`** 写入内置超级管理员：**用户名 `admin`、初始密码 `admin123456`**（定义见 `apps/pages/defaults.py`）。**仍使用初始密码时，任意方式登录成功后都会先进入后台的「修改密码」页**（`/admin/password_change/`，django-unfold）；改密后再按 `next` 或登录身份（超级管理员 / 普通用户）跳转。密码经 Django 以**单向哈希**存储；用户管理 **`/manage/`** 与后台均**不可查看**他人明文密码。若请求中带合法 **`next`** 且表单回传，在**非初始密码**时优先跳转 `next`。若需把 admin 恢复为初始密码：`python manage.py create_admin`。

4. 构建前端（首次或修改前端代码后需要）：

```bash
cd frontend
npm install        # 首次执行
npm run build      # 生成 static/frontend/assets/main-*.js
```

5. 启动开发服务器：

```bash
python manage.py runserver
# 打开浏览器访问 http://127.0.0.1:8000/
```

## 技术栈

- **后端**：Django、**PostgreSQL**（需 `psycopg2-binary`）
- **前端**：React + Vite（登录页、Dashboard、Projects / Datasets / Tasks）、自定义主题 `laps-theme.css`
- **标注引擎**：Segment Anything Model（SAM）

更多实现细节可直接阅读源码与注释。

---

## PostgreSQL：macOS（Homebrew）开发与 Ubuntu 生产

Django 通过 **`psycopg2-binary`** 连接 PostgreSQL；`psql` 仅用于管理库表与排查连接。连接参数统一由项目根目录 **`.env`** 中的 `DB_NAME`、`DB_USERNAME`、`DB_PASS`、`DB_HOST`、`DB_PORT` 提供（可参考 `env.sample`）。

### macOS 本地开发（已用 Homebrew 安装）

1. **安装说明**  
   - **推荐**：`brew install postgresql@16`（或 `postgresql`，会安装当前主版本），**同时包含数据库服务与 `psql` 客户端**。  
   - 若只执行过 `brew install libpq`，一般**只有客户端**，本机没有 PostgreSQL 服务，需再装 `postgresql@xx` 或连接远程库。

2. **启动服务**

```bash
brew services start postgresql@16
# 若安装的是未带版本号的 postgresql，则可能是：
# brew services start postgresql
```

3. **建库（常用：用当前 macOS 登录名作为超级用户）**  
   Homebrew 默认常把**你的系统用户名**设为可本地登录的超级用户，密码可为空（仅本机 socket）。

```bash
# 查看服务与端口（默认多为 5432）
brew services list

# 用当前用户建库（无需 -U postgres）
createdb laps

# 或进入 psql 再执行
psql postgres -c "CREATE DATABASE laps;"
```

4. **`.env`（本机开发示例）**

```bash
DEBUG=True
SECRET_KEY=本地开发可写一段随机字符串
DB_NAME=laps
DB_USERNAME=krizmi1e   # 示例：请改为你在终端执行 whoami 显示的名字；勿填 whoami 这六个字母
DB_PASS=
DB_HOST=localhost
DB_PORT=5432
```

5. **验证连接后再迁移**

```bash
psql -h localhost -p 5432 -U "$(whoami)" -d laps -c "SELECT version();"
python manage.py migrate
```

6. **常见问题**  
   - **`role "postgres" does not exist`**：Homebrew 版未必有 `postgres` 角色，把 `DB_USERNAME` 设为终端里 **`whoami` 命令打印的名字**（不是单词 whoami），或执行：`createuser -s postgres`（按需）。
   - **`role "whoami" does not exist`**：说明 `.env` 里误把 `DB_USERNAME` 写成了 `whoami`；应改为真实用户名，或留空/删掉该行使用默认（若仍报错再按上一条处理）。  
   - **连接拒绝**：确认 `brew services start …` 已运行，且端口与 `DB_PORT` 一致。

---

### Ubuntu 生产环境（服务器本机 PostgreSQL）

1. **安装并开机自启**

```bash
sudo apt update
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable --now postgresql
```

2. **用系统用户 `postgres` 管理账号与数据库**

```bash
sudo -u postgres psql
```

在 `psql` 内执行（密码请改为强密码）：

```sql
CREATE USER laps_app WITH PASSWORD '请改为强密码';
CREATE DATABASE laps OWNER laps_app ENCODING 'UTF8';
GRANT ALL PRIVILEGES ON DATABASE laps TO laps_app;
\c laps
GRANT ALL ON SCHEMA public TO laps_app;
\q
```

3. **应用与数据库在同一台 Ubuntu 上时的 `.env`**

```bash
DEBUG=False
SECRET_KEY=生产环境务必使用长随机串
DB_NAME=laps
DB_USERNAME=laps_app
DB_PASS=与上面 CREATE USER 一致
DB_HOST=localhost
DB_PORT=5432
```

4. **验证**

```bash
psql -h localhost -p 5432 -U laps_app -d laps -c "SELECT 1;"
```

5. **若 PostgreSQL 在另一台机器 / 仅允许 TCP**  
   - 修改 **`postgresql.conf`**：`listen_addresses = '*'` 或指定网卡 IP（按安全策略收紧）。  
   - 修改 **`pg_hba.conf`**：为应用服务器 IP 增加一行 `host laps laps_app <应用机IP>/32 scram-sha-256`（或 `md5`，与服务器认证方式一致）。  
   - 重启：`sudo systemctl restart postgresql`  
   - 防火墙：`sudo ufw allow from <应用服务器IP> to any port 5432`（避免对全网开放 5432）。  
   - Django 中 **`DB_HOST`** 填数据库服务器地址，**`DB_PASS`** 等与库内用户一致。

---

## 生产部署（PostgreSQL）

项目**仅使用 PostgreSQL** 作为业务库。建库、`psql` 与 `.env` 的详细步骤见上一节 **「PostgreSQL：macOS（Homebrew）开发与 Ubuntu 生产」**；本节补充发布流程与进程部署。

### 1. 准备数据库（`psql`）

在数据库服务器上（或使用本机 `psql` 连到远端）创建库与用户，示例与 **上一节 Ubuntu 小节** 相同；通用 SQL 如下：

```sql
-- 以超级用户登录：psql -U postgres -h <主机> -p 5432
CREATE USER laps_app WITH PASSWORD '请改为强密码';
CREATE DATABASE laps OWNER laps_app ENCODING 'UTF8';
GRANT ALL PRIVILEGES ON DATABASE laps TO laps_app;
-- PostgreSQL 15+ 若需默认 public 权限，可额外：
\c laps
GRANT ALL ON SCHEMA public TO laps_app;
```

验证连接：

```bash
psql -h <主机> -p 5432 -U laps_app -d laps -c "SELECT 1;"
```

也可用命令行一步建库（本机已配置 `peer`/`trust` 时，常见于 Linux 上 `postgres` 用户）：

```bash
sudo -u postgres createdb -O laps_app laps
```

### 2. 环境与密钥

```bash
cp env.sample .env
```

生产环境务必设置：

| 变量 | 说明 |
|------|------|
| `DEBUG` | `False` |
| `SECRET_KEY` | 随机长字符串，勿泄露 |
| `DB_NAME` / `DB_USERNAME` / `DB_PASS` / `DB_HOST` / `DB_PORT` | 与上一步 PostgreSQL 一致 |
| `ALLOWED_HOSTS` | 在 `config/settings.py` 中按域名收紧（当前默认 `*` 仅便于开发） |

### 3. 安装依赖、前端构建、静态与迁移

```bash
pip install -r requirements.txt
cd frontend && npm ci && npm run build && cd ..
python manage.py collectstatic --noinput
python manage.py migrate
```

内置管理员已在 `migrate` 时写入；若需**再次重置**为默认账号密码，可执行：

```bash
python manage.py create_admin
```

### 4. 启动应用（Gunicorn）

仓库自带 `gunicorn-cfg.py`（默认监听 `0.0.0.0:5005`）：

```bash
gunicorn --config gunicorn-cfg.py config.wsgi
```

生产建议前置 **Nginx**（或同类反向代理）：转发 HTTP(S) 到 Gunicorn，并单独配置：

- **静态文件**：`STATIC_ROOT`（`collectstatic` 输出目录）
- **用户上传媒体**：`MEDIA_URL` / `MEDIA_ROOT`（头像、数据集图片等），勿交给 WhiteNoise 长期托管大文件

### 5. Docker 镜像说明

根目录 `Dockerfile` 在**构建阶段**执行了 `migrate`，若构建时无法连接数据库会导致镜像构建失败。生产上更常见的做法是：**镜像内不包含 migrate**，在容器**启动命令**或编排（如 `docker compose` 的 `command`）中先执行 `python manage.py migrate` 再启动 Gunicorn，并传入上述数据库环境变量。

---

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

2. PostgreSQL 与迁移、静态文件

先创建数据库并配置 `.env`（**macOS Homebrew / Ubuntu 分步骤见前文「PostgreSQL：macOS（Homebrew）开发与 Ubuntu 生产」**；变量摘要见下文「数据库连接说明」）。然后：

```bash
python3 manage.py makemigrations
python3 manage.py migrate
python3 manage.py collectstatic --noinput
```

`migrate` 会写入内置超级管理员 **admin / admin123456**（见前文「快速开始」第 3 步与 `apps/pages/defaults.py`）。

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

5. 数据库连接说明

**安装、启动服务、建库与 `psql` 验证**请以文档前文 **「PostgreSQL：macOS（Homebrew）开发与 Ubuntu 生产」** 为准；以下为 `.env` 变量摘要。

项目**仅连接 PostgreSQL**。在项目根目录 `.env` 中配置（`config/settings.py` 缺省为：`DB_NAME=laps`、`DB_USERNAME=postgres`、`DB_HOST=localhost`、`DB_PORT=5432`、`DB_PASS` 为空；**Homebrew 下常需把 `DB_USERNAME` 改为终端执行 `whoami` 得到的用户名——不要写 `whoami` 这六个字母**；若误写，项目已自动按当前登录名解析）：

```bash
DB_NAME=laps
DB_USERNAME=your_db_user
DB_PASS=your_db_password
DB_HOST=localhost
DB_PORT=5432
```

请确保已安装 `psycopg2-binary`（见 `requirements.txt`），并先创建数据库再执行 `migrate`。

**线上/服务器部署**（Gunicorn、Nginx、Docker 注意点）见 **「生产部署（PostgreSQL）」**；**Ubuntu 上安装 PostgreSQL 与建库**见 **「PostgreSQL：…Ubuntu 生产」** 小节。

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
- 用户：为项目创建数据集，上传图片（本地上传 / ZIP / URL），查看图片列表；删除数据集会同时删除 **`media/datasets/…`** 中对应图片文件（不单删表行）。
- 程序员：`pages.Image` 记录在 **PostgreSQL**；文件经 **`ImageField`** 存于 **`MEDIA_ROOT`** 下 **`datasets/user_<owner_id>/%Y/%m/%d/`**（按数据集 `owner` 分用户目录，非项目根目录）。导入逻辑见 `apps/pages/views.py`；物理文件在删除时由 **`apps/pages/signals.py`** 的 `pre_delete` 处理。

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
- 用户：内置超级管理员 **用户名 `admin`、初始密码 `admin123456`**（`migrate` 写入）。**仍为初始密码时登录会先打开后台修改密码页**（`/admin/password_change/`）。改密后：选**超级管理员**可进 **`/admin/`**；选**普通用户**进前台。用户管理 **`/manage/`**（仅 admin，列表**不展示密码明文**）。
- 若需将 admin 恢复为初始密码并确保 `is_superuser`：`python manage.py create_admin`。
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
- **已归档**：`/image-processing/` 重定向首页；`/examples/` 及归档模板已移除。

代码整理与本次修改记录
- **Bug 修复**：`views.py` 中 `Image.open` 改为 `PILImage.open`（两处）；缺失模板的 `image_processing`、`examples_index` 改为重定向首页，避免 TemplateDoesNotExist。
- **重复代码合并**：`.footer` 样式仅保留在 `laps-theme.css`，从 `fixed-plugin-override.css` 中移除重复定义。
- **注释与文档**：为 `apps/pages/views.py`、`urls.py` 增加文件头注释；为 `includes/head.html`、`scripts.html`、`layouts/base.html`、`fixed-plugin-override.css`、`theme-switcher.css` 增加用途说明。
- **主题与侧栏**：在 `laps-theme.css` 中定义主题变量 `--laps-bg`、`--laps-bg-light`、`--laps-text`、`--laps-text-muted`、`--laps-border`；侧栏背景改为使用主题背景（与主内容区一致）；全站部分文字颜色（body、顶栏、页脚、内容区、卡片标题/副标题）统一使用上述变量，切换深浅主题时整体一致。
- **布局统一**：登录/注册页使用 `base_auth.html`（共用 `includes/head.html`），个人设置页使用 `base_standalone.html`（共用 head）；顶栏与主页一致：内边距 12px 20px、min-height 56px，个人信息页顶栏样式与主站 navbar 对齐。
- **账户与用户管理**：内置 admin 初始密码、密码仅哈希存储；`create_admin` 可重置；用户管理无密码列；侧栏已移除登出入口，仅保留下拉内登出。
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
