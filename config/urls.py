"""
config.urls - LAPS-System 根路由

i18n/: 语言切换 | /: 主站+动态API | /charts/: 图表
/admin/login/: 自定义登录 | /admin/: unfold 后台 | /accounts/logout/: 登出
"""
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from django.contrib.auth.views import LogoutView
from apps.pages.views import LAPSLoginView

urlpatterns = [
    path("i18n/", include("django.conf.urls.i18n")),
    path('', include('apps.pages.urls')),
    path('', include('apps.dyn_api.urls')),
    path('charts/', include('apps.charts.urls')),
    path("admin/login/", LAPSLoginView.as_view(), name="admin_login"),
    path("admin/", admin.site.urls),
    path("accounts/logout/", LogoutView.as_view(next_page='/accounts/auth-signin/'), name="logout"),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
