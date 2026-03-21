"""
apps.pages.signals
------------------
删除模型行时同步删除 MEDIA 上的文件（Django 默认不会删 ImageField/FileField 物理文件）。
数据集删除会 CASCADE 到 Image、Task、Annotation，Collector 会在 delete_batch 之前
对每个实例发送 pre_delete，故此处可覆盖「删数据集 = 清掉该集所有图片文件」等场景。
"""
import logging

from django.db.models.signals import pre_delete
from django.dispatch import receiver

from . import models

logger = logging.getLogger(__name__)


def _safe_delete_fieldfile(fieldfile):
    """删除存储中的文件；已不存在或失败时忽略，避免阻断删除事务。"""
    if not fieldfile or not getattr(fieldfile, 'name', None):
        return
    try:
        fieldfile.delete(save=False)
    except Exception as exc:
        logger.warning('Failed to delete media file %s: %s', fieldfile.name, exc)


@receiver(pre_delete, sender=models.Image)
def delete_image_file_on_remove(sender, instance, **kwargs):
    _safe_delete_fieldfile(instance.file)


@receiver(pre_delete, sender=models.Annotation)
def delete_annotation_mask_on_remove(sender, instance, **kwargs):
    _safe_delete_fieldfile(instance.mask_file)
