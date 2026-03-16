# LAPS-System 前端（React + Vite）

此目录为 LAPS-System 的前端子项目，使用 **React + Vite** 为部分页面提供增强 UI：

- 登录页（挂载到 `#root-login`）
- 仪表盘 Dashboard（`#root-dashboard`）
- Projects / Datasets / Tasks 页面（分别挂载到 `#root-projects` / `#root-datasets` / `#root-tasks`）

构建后的静态文件会输出到 `../static/frontend/`，由 Django 模板通过 `{% static 'frontend/assets/main-*.js' %}` 引入。

## 开发 & 构建

```bash
cd frontend
npm install        # 首次安装依赖
npm run dev        # （可选）本地调试 React 组件
npm run build      # 构建产物到 ../static/frontend/
```

实际部署时，只需在后端启动前执行一次 `npm run build`，并在模板中引用最新生成的 `main-*.js` 即可。***
