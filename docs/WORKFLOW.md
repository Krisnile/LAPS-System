# LAPS 标注流程与数据模型（对照 Label Studio）

## 产品定位

- **轻量**：单实例 Django + 前台 React 页面，无独立 Data Manager 微服务。
- **基于提示的分割标注**：默认对接 SAM 类交互式分割；推理层可替换或并行接入 YOLO 等模型做预标注/辅助（见 `sam_inference` 与 API 扩展点）。
- **数据集自由管理**：`Dataset` 独立上传与维护；与项目的关联在**创建/编辑项目**时通过多选数据集完成（M2M），而非在数据集表单上强制绑定单一项目。

## 与 Label Studio 的对应关系

| Label Studio 概念 | LAPS 实现 |
|-------------------|-----------|
| Project | `Project`：配置域、标签 JSON、`annotation_type`（任务类型）、`linked_datasets`（可选多数据集） |
| Import / 数据管理 | `Dataset` + `Image`：上传、追加、单图删除、元数据编辑；**不**再使用 `Dataset.project` |
| Task | `Task`：`(project, image)` 唯一业务含义 + `status` |
| 标注界面 | `/annotate/`：按 `task_id` 绑定上下文（当前实现以 SAM 分割为主） |
| Export | 当前以 DB + Admin/API 为主；可后续增加 COCO/JSON 导出 |

## 数据依赖（推荐顺序）

1. **Dataset**：可先任意创建并上传图像（与项目无关）。
2. **Project**：创建时选择 **标注任务类型**（`segmentation_sam` 已接入；`detection_yolo` 预留），并可勾选 **关联数据集**（`Project.linked_datasets`）。
3. **Tasks 批量生成**：选择项目与数据集。若该项目**已关联至少一个数据集**，则仅能从中选择；若**未关联任何数据集**，则允许在本人任意数据集上批量生成（兼容空关联项目）。
4. **Task** 创建后，**Annotate** 通过任务解析图像与项目上下文。

## 前台已提供的管理操作

- **项目**：创建（名称、描述、任务类型、多选关联数据集）、编辑（含关联数据集）、删除（级联删除其下任务）。
- **数据集**：列表页 `/datasets/` 仅展示基本信息（名称、图片数、创建时间、描述等）与 **新建导入**；每条可 **管理** 进入 `/datasets/<id>/` 详情页，在详情页完成 **继续导入**、缩略图 **预览与备注**、单图删除及数据集元数据编辑。创建时可选择导入类型：本地多图 / ZIP / URL 列表（每行一个 HTTP(S) 地址，可用「 | 」或 Tab 在地址后写备注，写入图片 `caption`）；详情页预载该集最近 120 张图（总量见 Admin）。项目与数据集的关联在 **项目** 页维护，数据集页不展示关联项目列。
- **任务页**：展示 **任务类型示意**（分割 / 检测）；**快速创建项目**（带任务类型与数据集勾选）；**批量生成任务**（项目 + 数据集，受关联规则约束）。

## 后续可增强（未实现）

- 按 `annotation_type` 切换标注工作区（检测框 UI、YOLO 预标等）。
- 导入导出格式（COCO、JSON）、只读 Data Manager 视图（筛选/排序/标签页）。
- 任务级状态机在 UI 上与列表过滤联动。

升级数据库请执行：`python manage.py migrate`（含 `0007_project_annotation_linked_datasets`：迁移原 `Dataset.project` 至 M2M）。

详见 `ARCHITECTURE.md` 与 `apps/pages/models.py`。
