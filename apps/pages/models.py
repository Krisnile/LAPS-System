from django.db import models
from django.conf import settings
from django.utils import timezone


class UserProfile(models.Model):
    """用户扩展信息：头像等（与 Django User 一对一）"""
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='laps_profile')
    avatar = models.ImageField(upload_to='avatars/%Y/%m/', null=True, blank=True)

    def __str__(self):
        return f"Profile of {self.user.username}"


# Existing model kept for compatibility
class Product(models.Model):
    id = models.AutoField(primary_key=True)
    name = models.CharField(max_length=100)
    info = models.CharField(max_length=100, default='')
    price = models.IntegerField(blank=True, null=True)

    def __str__(self):
        return self.name


class Project(models.Model):
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    label_config = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    def __str__(self):
        return self.name


class Dataset(models.Model):
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(default=timezone.now)

    def __str__(self):
        return self.name


class Image(models.Model):
    dataset = models.ForeignKey(Dataset, related_name='images', on_delete=models.CASCADE)
    file = models.ImageField(upload_to='datasets/%Y/%m/%d')
    width = models.IntegerField(null=True, blank=True)
    height = models.IntegerField(null=True, blank=True)
    uploaded_at = models.DateTimeField(default=timezone.now)

    def __str__(self):
        return f"{self.file.name}"


class Task(models.Model):
    STATUS_CHOICES = [
        ('new', 'New'),
        ('assigned', 'Assigned'),
        ('in_review', 'In Review'),
        ('done', 'Done'),
    ]
    project = models.ForeignKey(Project, related_name='tasks', on_delete=models.CASCADE)
    image = models.ForeignKey(Image, related_name='tasks', on_delete=models.CASCADE)
    assigned_to = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='new')
    created_at = models.DateTimeField(default=timezone.now)

    def __str__(self):
        return f"Task {self.id} ({self.image.file.name})"


class Annotation(models.Model):
    task = models.ForeignKey(Task, related_name='annotations', on_delete=models.CASCADE)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    mask_file = models.FileField(upload_to='annotations/%Y/%m/%d', null=True, blank=True)
    mask_rle = models.TextField(null=True, blank=True)
    label = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    def __str__(self):
        return f"Annotation {self.id} for Task {self.task_id}"
