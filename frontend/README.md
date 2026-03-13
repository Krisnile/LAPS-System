# LAPS-System 前端（React + Vite）

此目录为 LAPS-System 的前端子项目，使用 **React + Vite** 为部分页面提供增强 UI：

- 登录页（基于 `base_auth.html`，通过 `#root-login` 挂载 React 组件）
- 仪表盘 Dashboard（`#root-dashboard`）
- Projects / Datasets / Tasks 页面（分别挂载到 `#root-projects` / `#root-datasets` / `#root-tasks`）

所有构建后的静态文件会输出到 `../static/frontend/`，由 Django 模板通过 `{% static 'frontend/assets/main-*.js' %}` 引入。后端路由与视图仍然由 Django 负责。

## 开发 & 构建

```bash
cd frontend
npm install        # 首次安装依赖
npm run dev        # 本地开发（如需调试 React 组件）
npm run build      # 构建产物到 ../static/frontend/
```

> 说明：实际部署时，只需保证在后端运行前已执行过 `npm run build`，并在模板中引用最新构建出的 `main-*.js` 文件即可。
