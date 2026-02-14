from django.urls import path
from . import views

urlpatterns = [
    path('', views.index, name='index'),
    path('image-processing/', views.image_processing, name='image_processing'),
    path('projects/', views.projects, name='projects'),
    path('datasets/', views.datasets, name='datasets'),
    path('tasks/', views.tasks, name='tasks'),
    path('examples/', views.examples_index, name='examples_index'),
    path('examples/<str:name>/', views.examples_view, name='examples_view'),
    path('tasks/next/', views.next_task, name='next_task'),
    path('annotate/', views.annotation, name='annotation'),
    path('save-image/', views.save_processed_image, name='save_processed_image'),
    path('segment-image/', views.segment_image, name='segment_image'),
    path('api/annotations/', views.save_annotation, name='save_annotation'),
]
