"""
apps.pages.urls
---------------
主站路由：首页、账户/个人设置、登录(覆盖)、用户管理、项目/数据集/任务、
示例(已重定向)、标注、任务 next、分割与标注 API。
"""
from django.urls import path
from django.views.generic import RedirectView
from . import views

urlpatterns = [
    path('support/', views.support_wiki, name='support'),
    path('', views.index, name='index'),
    path('account/', views.profile, name='profile'),
    path('accounts/auth-signin/', views.LAPSLoginView.as_view(), name='auth_signin'),
    path('accounts/auth-signup/', views.LAPSSignupView.as_view(), name='auth_signup'),
    path('manage/', views.user_manage_list, name='user_manage'),
    path('manage/user/<int:pk>/toggle/', views.user_manage_toggle_active, name='user_manage_toggle'),
    path(
        'image-processing/',
        RedirectView.as_view(pattern_name='index', permanent=False),
        name='image_processing',
    ),
    path('projects/', views.projects, name='projects'),
    path('datasets/<int:pk>/', views.dataset_detail, name='dataset_detail'),
    path('api/datasets/<int:pk>/images/', views.dataset_images_api, name='dataset_images_api'),
    path('datasets/', views.datasets, name='datasets'),
    path('tasks/', views.tasks, name='tasks'),
    path('tasks/sample-demo/', views.tasks_sample_demo, name='tasks_sample_demo'),
    path('api/nav-search/', views.nav_search_api, name='nav_search_api'),
    path('api/tasks/', views.tasks_json_list, name='tasks_json_list'),
    path('api/tasks/delete-group/', views.tasks_delete_group, name='tasks_delete_group'),
    path('tasks/next/', views.next_task, name='next_task'),
    path('annotate/', views.annotation, name='annotation'),
    path('api/annotate/catalog/', views.annotate_catalog, name='annotate_catalog'),
    path('api/annotate/available-images/', views.annotate_available_images, name='annotate_available_images'),
    path('api/annotate/tasks/', views.annotate_task_create, name='annotate_task_create'),
    path('api/annotate/tasks/<int:pk>/', views.annotate_task_detail, name='annotate_task_detail'),
    path(
        'api/annotate/tasks/<int:pk>/annotations/',
        views.annotate_task_annotations,
        name='annotate_task_annotations',
    ),
    path(
        'api/annotate/projects/<int:pk>/export/',
        views.export_project_annotations,
        name='annotate_project_export',
    ),
    path('save-image/', views.save_processed_image, name='save_processed_image'),
    path('segment-image/', views.segment_image, name='segment_image'),
    path('api/annotations/', views.save_annotation, name='save_annotation'),
    path('api/annotations/<int:pk>/export/', views.export_annotation, name='annotation_export'),
    path('api/annotations/<int:pk>/', views.delete_annotation, name='delete_annotation'),
]
