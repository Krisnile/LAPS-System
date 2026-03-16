"""core URL Configuration

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/4.1/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import include, path
from django.contrib.auth.views import LogoutView
from apps.pages.views import LAPSLoginView
from rest_framework.authtoken.views import obtain_auth_token # <-- NEW

urlpatterns = [
    path('', include('apps.pages.urls')),
    path('', include('apps.dyn_dt.urls')),
    path('', include('apps.dyn_api.urls')),
    path('charts/', include('apps.charts.urls')),
    # 统一登录入口：当访问 /admin/login/ 时使用自定义登录视图（React 登录页）
    path("admin/login/", LAPSLoginView.as_view(), name="admin_login"),  # /admin/login/ -> LAPSLoginView
    path("admin/", admin.site.urls),
    path("accounts/logout/", LogoutView.as_view(next_page='/accounts/auth-signin/'), name="logout"),
]

# Lazy-load on routing is needed
# During the first build, API is not yet generated
try:
    urlpatterns.append( path("api/"      , include("api.urls"))    )
    urlpatterns.append( path("login/jwt/", view=obtain_auth_token) )
except:
    pass