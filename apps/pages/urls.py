"""
apps.pages.urls
---------------
主站路由：首页、账户/个人设置、登录(覆盖)、用户管理、项目/数据集/任务、
示例(已重定向)、标注、任务 next、分割与标注 API。
"""
from django.urls import path
from . import views

urlpatterns = [
    path('', views.index, name='index'),
    path('account/', views.profile, name='profile'),
    path('accounts/auth-signin/', views.LAPSLoginView.as_view(), name='auth_signin'),
    path('manage/', views.user_manage_list, name='user_manage'),
    path('manage/user/<int:pk>/toggle/', views.user_manage_toggle_active, name='user_manage_toggle'),
    path('image-processing/', views.image_processing, name='image_processing'),  # 已归档，重定向首页
    path('projects/', views.projects, name='projects'),
    path('datasets/', views.datasets, name='datasets'),
    path('tasks/', views.tasks, name='tasks'),
    path('examples/', views.examples_index, name='examples_index'),  # 已归档，重定向首页
    path('examples/<str:name>/', views.examples_view, name='examples_view'),  # 仅渲染 archived_templates/<name>.html
    path('tasks/next/', views.next_task, name='next_task'),
    path('annotate/', views.annotation, name='annotation'),
    path('save-image/', views.save_processed_image, name='save_processed_image'),
    path('segment-image/', views.segment_image, name='segment_image'),
    path('api/annotations/', views.save_annotation, name='save_annotation'),
]
