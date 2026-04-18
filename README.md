# LAPS-System

轻量**交互式图像标注**系统：**Django + PostgreSQL + React + SAM**（Segment Anything）。

## 功能

| 模块 | 说明 |
|------|------|
| 账号 | 登录 / 注册、个人设置、中英文与深/浅色主题 |
| 业务流 | 项目、数据集（本地上传 / ZIP / URL）、任务队列 |
| 标注 | SAM 点/框提示分割，撤销、保存；模板 + `annotation.js` |
| 管理 | django-unfold `/admin/`；用户管理 `/manage/`（仅 `admin`） |

## 技术栈

- **后端**：Django 4.x、`psycopg2-binary`、可选 REST（`apps.dyn_api`）
- **前端**：React + Vite（登录、Dashboard、Projects / Datasets / Tasks），主题 `laps-theme.css`
- **推理**：`apps/pages/sam_inference.py`；权重目录 **`model/sam/`**（SAM）、**`model/yolo/`**（YOLO，需 `pip install ultralytics`）；旧路径根目录 **`sam/`** 仍兼容

## 环境要求

- Python **3.10+**
- **PostgreSQL**
- Node **18+**（仅构建前端）

## 快速开始

```bash
git clone https://github.com/Krisnile/LAPS-System.git
cd LAPS-System

python -m venv .venv && source .venv/bin/activate   # 或 conda
pip install -r requirements.txt

cp env.sample .env
# 编辑 .env：SECRET_KEY、DB_*（建库步骤见 docs/SETUP.md）

createdb laps   # 或使用 psql / GUI 创建与 DB_NAME 一致的库

python manage.py migrate
python manage.py collectstatic --noinput

cd frontend && npm install && npm run build && cd ..

python manage.py runserver
# http://127.0.0.1:8000/
```

开发中若改前端源码，需重新构建：在 `frontend/` 下执行 `npm run build`，或在仓库根目录执行 `npm run build`（脚本会转发到 `frontend`）。

## 配置说明

| 变量 | 说明 |
|------|------|
| `SECRET_KEY` | 必填；生产使用长随机串 |
| `DEBUG` | 生产设为 `False` |
| `DB_NAME` / `DB_USERNAME` / `DB_PASS` / `DB_HOST` / `DB_PORT` | PostgreSQL 连接 |

勿将 `.env` 提交到 Git（已列入 `.gitignore`）。

## 默认管理员

迁移 **`0010_ensure_default_admin_user`** 会确保存在 **`admin` / `admin123456`**（与 `apps/pages/defaults.py` 一致）。仍使用初始密码时，登录后会进入后台改密页。重置账号：`python manage.py create_admin`。

## 媒体与数据路径

上传文件写入 **`MEDIA_ROOT`**（默认项目下 `media/`）。数据集图片路径形如 **`datasets/user_<owner_id>/年/月/日/`**；删除数据集会级联删除库记录并清理磁盘文件（见 `apps/pages/signals.py`）。

## 模型文件（分割）

- **SAM**：检查点放在 **`model/sam/`**（旧版根目录 **`sam/`** 仍会自动兼容）。
- **YOLO**：分割权重（如 `yolov8n-seg.pt`）放在 **`model/yolo/`**，并执行 **`pip install ultralytics`**（默认 `requirements.txt` 未包含，按需安装）。
- 标注页「分割模型」下拉与接口 POST 参数 **`model=sam|yolo`** 与上述目录对应。

## 文档

| 文档 | 内容 |
|------|------|
| [docs/SETUP.md](docs/SETUP.md) | PostgreSQL（macOS / Ubuntu）、生产部署、Docker 注意点 |
| [docs/WORKFLOW.md](docs/WORKFLOW.md) | 项目 / 数据集 / 任务工作流 |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 架构与目录说明 |
| [CHANGELOG.md](CHANGELOG.md) | 变更摘要 |

## 项目结构（节选）

```
apps/pages/     # 核心业务：模型、视图、SAM、迁移
config/         # Django 配置与根 URL
frontend/       # React 源码（构建产物在 static/frontend/）
templates/      # Django 模板
static/         # 静态资源与主题
locale/         # Admin 等 gettext 翻译
```

## 贡献

Issue / PR：[github.com/Krisnile/LAPS-System](https://github.com/Krisnile/LAPS-System)

## 许可

见仓库根目录 [LICENSE](LICENSE)。
