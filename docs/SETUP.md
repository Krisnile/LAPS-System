# 环境与部署

数据库安装、`.env` 与生产发布细节。

## PostgreSQL

### macOS（Homebrew）

```bash
brew install postgresql@16   # 或 postgresql
brew services start postgresql@16
createdb laps                # 常用：当前 macOS 用户即为本地超管，密码可为空
```

`.env` 示例：

```env
DEBUG=True
SECRET_KEY=<随机串>
DB_NAME=laps
DB_USERNAME=<终端 whoami 输出的用户名，勿写字面量 whoami>
DB_PASS=
DB_HOST=localhost
DB_PORT=5432
```

常见问题：

- `role "postgres" does not exist`：Homebrew 常无 `postgres` 角色，把 `DB_USERNAME` 设为 `whoami` 的输出。
- `role "whoami" does not exist`：误把用户名写成单词 `whoami`，改为真实系统用户名。

验证：`psql -h localhost -p 5432 -U "$(whoami)" -d laps -c "SELECT version();"`

### Ubuntu（本机 PostgreSQL）

```bash
sudo apt update && sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable --now postgresql
sudo -u postgres psql
```

在 `psql` 中（密码请改为强密码）：

```sql
CREATE USER laps_app WITH PASSWORD '强密码';
CREATE DATABASE laps OWNER laps_app ENCODING 'UTF8';
GRANT ALL PRIVILEGES ON DATABASE laps TO laps_app;
\c laps
GRANT ALL ON SCHEMA public TO laps_app;
\q
```

`.env`：`DB_USERNAME=laps_app`、`DB_PASS` 与上面一致、`DB_HOST=localhost`。

远程库：配置 `postgresql.conf` / `pg_hba.conf`，防火墙仅放行应用机 IP，勿对公网开放 5432。

## 生产发布

1. `cp env.sample .env`，设置 `DEBUG=False`、`SECRET_KEY`、上述 `DB_*`；按需收紧 `ALLOWED_HOSTS`（见 `config/settings.py`）。
2. 安装与构建：

```bash
pip install -r requirements.txt
cd frontend && npm ci && npm run build && cd ..
python manage.py collectstatic --noinput
python manage.py migrate
```

3. 进程（示例）：`gunicorn --config gunicorn-cfg.py config.wsgi`  
   Nginx：托管 `STATIC_ROOT`；大文件走 `MEDIA_URL` / `MEDIA_ROOT`，勿长期依赖 WhiteNoise 扛媒体流量。
4. **Docker**：若 `Dockerfile` 在构建阶段执行 `migrate` 且构建时连不上库会导致构建失败；更稳妥是在容器启动时再 `migrate` 后启动 Gunicorn。

内置管理员：`migrate` 后可用 `admin` / `admin123456`（见 `apps/pages/defaults.py`）；重置：`python manage.py create_admin`。
