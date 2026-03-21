# 数据集图片按 owner 分目录：datasets/user_<id>/YYYY/MM/DD/；并搬迁旧路径下的文件

import os
import uuid

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.db import migrations, models

import apps.pages.models as pages_models


def relocate_dataset_images_to_user_dirs(apps, schema_editor):
    """将旧版 datasets/YYYY/MM/DD/ 下的文件移到 datasets/user_<owner_id>/… 并更新库中路径。"""
    Image = apps.get_model('pages', 'Image')
    Dataset = apps.get_model('pages', 'Dataset')

    for pk, dataset_id, file_val, uploaded_at in Image.objects.values_list(
        'pk', 'dataset_id', 'file', 'uploaded_at'
    ).iterator(chunk_size=200):
        if not file_val:
            continue
        old_path_str = str(file_val).replace('\\', '/').lstrip('/')
        if '/user_' in old_path_str:
            continue
        try:
            ds = Dataset.objects.get(pk=dataset_id)
        except Dataset.DoesNotExist:
            continue
        owner_id = ds.owner_id or 0
        dt = uploaded_at
        basename = os.path.basename(old_path_str)
        if not basename:
            continue

        def build_rel(suffix=''):
            stem, ext = os.path.splitext(basename)
            name = f'{stem}{suffix}{ext}' if suffix else basename
            return f'datasets/user_{owner_id}/{dt.year:04d}/{dt.month:02d}/{dt.day:02d}/{name}'

        new_rel = build_rel()
        if new_rel == old_path_str:
            continue
        if default_storage.exists(new_rel):
            new_rel = build_rel(f'_{uuid.uuid4().hex[:8]}')

        if default_storage.exists(old_path_str):
            with default_storage.open(old_path_str, 'rb') as src:
                default_storage.save(new_rel, ContentFile(src.read()))
            default_storage.delete(old_path_str)

        Image.objects.filter(pk=pk).update(file=new_rel)


class Migration(migrations.Migration):

    dependencies = [
        ('pages', '0010_ensure_default_admin_user'),
    ]

    operations = [
        migrations.RunPython(relocate_dataset_images_to_user_dirs, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='image',
            name='file',
            field=models.ImageField(upload_to=pages_models.dataset_image_upload_to),
        ),
    ]
