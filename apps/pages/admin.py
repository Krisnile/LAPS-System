from django.contrib import admin
from . import models


@admin.register(models.Project)
class ProjectAdmin(admin.ModelAdmin):
	list_display = ('id', 'name', 'owner', 'created_at')


@admin.register(models.Dataset)
class DatasetAdmin(admin.ModelAdmin):
	list_display = ('id', 'name', 'owner', 'created_at')


@admin.register(models.Image)
class ImageAdmin(admin.ModelAdmin):
	list_display = ('id', 'file', 'width', 'height', 'uploaded_at')


@admin.register(models.Task)
class TaskAdmin(admin.ModelAdmin):
	list_display = ('id', 'project', 'image', 'assigned_to', 'status', 'created_at')


@admin.register(models.Annotation)
class AnnotationAdmin(admin.ModelAdmin):
	list_display = ('id', 'task', 'user', 'created_at')

# Keep Product out of admin by default (or uncomment to register)
