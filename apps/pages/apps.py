"""
apps.pages.apps
---------------
主应用配置：verbose_name 为「页面管理」（支持 zh-hans/en 切换）。
ready() 中预加载 SAM 模型，减少首次标注请求延迟。
"""
from django.apps import AppConfig
from django.utils.translation import gettext_lazy as _


class PagesConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.pages"
    verbose_name = _("Pages")
    
    def ready(self):
        # 注册 pre_delete：删除 Image/Annotation 时移除磁盘上的上传文件
        from . import signals  # noqa: F401

        # Warm-up: try to load SAM predictor at startup so first request is faster.
        try:
            from . import sam_inference
            # call load_predictor but ignore failures
            sam_inference.load_predictor()
        except Exception:
            pass
