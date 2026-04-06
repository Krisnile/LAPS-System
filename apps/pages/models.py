"""
apps.pages.models
-----------------
核心数据模型：UserProfile、Product、Project、Dataset、Image、Task、Annotation。
- Project/Dataset/Image/Task/Annotation 支持后台中英文（verbose_name 使用 gettext_lazy）。
- Product 为兼容 DYNAMIC_API 保留，未在 admin 中注册。
"""
import os
import uuid

from django.db import models
from django.conf import settings
from django.utils import timezone
from django.utils.translation import gettext_lazy as _


def dataset_image_upload_to(instance, filename):
    """
    数据集图片按所属用户分目录：MEDIA_ROOT/datasets/user_<owner_id>/YYYY/MM/DD/<文件名>
    owner 为空时用 user_0，与迁移中对无归属数据的处理一致。
    """
    base = os.path.basename((filename or 'image.bin').replace('\\', '/'))
    if not base or base in ('.', '..'):
        base = f'{uuid.uuid4().hex[:16]}.bin'
    ds = getattr(instance, 'dataset', None)
    uid = getattr(ds, 'owner_id', None) if ds is not None else None
    if uid is None:
        uid = 0
    now = timezone.now()
    return f'datasets/user_{uid}/{now:%Y}/{now:%m}/{now:%d}/{base}'


class UserProfile(models.Model):
    """用户扩展信息：头像等（与 Django User 一对一）"""
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='laps_profile')
    avatar = models.ImageField(upload_to='avatars/%Y/%m/', null=True, blank=True)

    def __str__(self):
        return f"Profile of {self.user.username}"


# 兼容 DYNAMIC_API，供 config.settings.DYNAMIC_API['product'] 使用
class Product(models.Model):
    id = models.AutoField(primary_key=True)
    name = models.CharField(max_length=100)
    info = models.CharField(max_length=100, default='')
    price = models.IntegerField(blank=True, null=True)

    def __str__(self):
        return self.name


class Project(models.Model):
    """标注项目：可选关联多个数据集（M2M）；标注任务类型决定工作流与模型（如 SAM 分割）。"""

    ANNOTATION_SEGMENTATION_SAM = "segmentation_sam"
    ANNOTATION_DETECTION_YOLO = "detection_yolo"
    ANNOTATION_TYPE_CHOICES = [
        (ANNOTATION_SEGMENTATION_SAM, _("Image segmentation (SAM)")),
        (ANNOTATION_DETECTION_YOLO, _("Object detection (YOLO) — coming soon")),
    ]

    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    annotation_type = models.CharField(
        max_length=32,
        choices=ANNOTATION_TYPE_CHOICES,
        default=ANNOTATION_SEGMENTATION_SAM,
        verbose_name=_("Annotation task type"),
        help_text=_("Determines which model/UI to use; only segmentation (SAM) is active for now."),
    )
    label_config = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    linked_datasets = models.ManyToManyField(
        "Dataset",
        blank=True,
        related_name="projects",
        verbose_name=_("Linked datasets"),
        help_text=_("Datasets used by this project. Batch task creation may require picking one of these."),
    )

    class Meta:
        verbose_name = _("Project")
        verbose_name_plural = _("Projects")

    def __str__(self):
        return self.name


class Dataset(models.Model):
    """图像集合；上传与管理独立于项目。通过「项目」页或任务页创建项目时勾选关联。
    删除数据集会级联删除其下 Image（及关联 Task/Annotation）；物理文件由 signals 在 pre_delete 中清理。"""
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        verbose_name = _("Dataset")
        verbose_name_plural = _("Datasets")

    def __str__(self):
        return self.name


class Image(models.Model):
    """数据集图片：元数据在库中；文件在 MEDIA_ROOT/datasets/user_<owner_id>/年/月/日/（按数据集 owner 隔离）。"""
    dataset = models.ForeignKey(Dataset, related_name='images', on_delete=models.CASCADE)
    file = models.ImageField(upload_to=dataset_image_upload_to)
    caption = models.CharField(
        max_length=500,
        blank=True,
        default="",
        verbose_name=_("Caption / note"),
        help_text=_("Optional label or note for dataset management / preview."),
    )
    width = models.IntegerField(null=True, blank=True)
    height = models.IntegerField(null=True, blank=True)
    uploaded_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-uploaded_at"]
        verbose_name = _("Image")
        verbose_name_plural = _("Images")

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
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='owned_tasks')
    assigned_to = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='new')
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        verbose_name = _("Task")
        verbose_name_plural = _("Tasks")
        constraints = [
            models.UniqueConstraint(
                fields=["project", "image"],
                name="uniq_laps_task_project_image",
            ),
        ]

    def __str__(self):
        return f"Task {self.id} ({self.image.file.name})"


class Annotation(models.Model):
    task = models.ForeignKey(Task, related_name='annotations', on_delete=models.CASCADE)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='owned_annotations')
    mask_file = models.FileField(upload_to='annotations/%Y/%m/%d', null=True, blank=True)
    mask_rle = models.TextField(null=True, blank=True)
    label = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        verbose_name = _("Annotation")
        verbose_name_plural = _("Annotations")

    def __str__(self):
        return f"Annotation {self.id} for Task {self.task_id}"
