from django.urls import path
from . import views

urlpatterns = [
    path('', views.index, name='index'),
    path('image-processing/', views.image_processing, name='image_processing'),
    path('save-image/', views.save_processed_image, name='save_processed_image'),
    path('segment-image/', views.segment_image, name='segment_image'),
]
