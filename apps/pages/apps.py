"""
apps.pages.apps
---------------
主应用配置：verbose_name 为「页面管理」（支持 zh-hans/en 切换）。
SAM 在首次分割请求时懒加载，避免阻塞站点启动与首屏。
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

        # 勿在 ready() 中加载 SAM：会阻塞进程启动与首个页面响应数秒。
        # 首次分割请求时由 sam_inference.load_predictor() 懒加载即可。
