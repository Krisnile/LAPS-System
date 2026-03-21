# 同步 models 与迁移状态：Image.caption 的 help_text；Project 字段的 gettext_lazy 元数据

import django.utils.translation
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("pages", "0008_image_caption"),
    ]

    operations = [
        migrations.AlterField(
            model_name="image",
            name="caption",
            field=models.CharField(
                blank=True,
                default="",
                help_text=django.utils.translation.gettext_lazy(
                    "Optional label or note for dataset management / preview."
                ),
                max_length=500,
                verbose_name=django.utils.translation.gettext_lazy("Caption / note"),
            ),
        ),
        migrations.AlterField(
            model_name="project",
            name="annotation_type",
            field=models.CharField(
                choices=[
                    (
                        "segmentation_sam",
                        django.utils.translation.gettext_lazy("Image segmentation (SAM)"),
                    ),
                    (
                        "detection_yolo",
                        django.utils.translation.gettext_lazy(
                            "Object detection (YOLO) — coming soon"
                        ),
                    ),
                ],
                default="segmentation_sam",
                help_text=django.utils.translation.gettext_lazy(
                    "Determines which model/UI to use; only segmentation (SAM) is active for now."
                ),
                max_length=32,
                verbose_name=django.utils.translation.gettext_lazy("Annotation task type"),
            ),
        ),
        migrations.AlterField(
            model_name="project",
            name="linked_datasets",
            field=models.ManyToManyField(
                blank=True,
                help_text=django.utils.translation.gettext_lazy(
                    "Datasets used by this project. Batch task creation may require picking one of these."
                ),
                related_name="projects",
                to="pages.dataset",
                verbose_name=django.utils.translation.gettext_lazy("Linked datasets"),
            ),
        ),
        migrations.AlterModelOptions(
            name="annotation",
            options={
                "verbose_name": django.utils.translation.gettext_lazy("Annotation"),
                "verbose_name_plural": django.utils.translation.gettext_lazy("Annotations"),
            },
        ),
        migrations.AlterModelOptions(
            name="dataset",
            options={
                "verbose_name": django.utils.translation.gettext_lazy("Dataset"),
                "verbose_name_plural": django.utils.translation.gettext_lazy("Datasets"),
            },
        ),
        migrations.AlterModelOptions(
            name="image",
            options={
                "ordering": ["-uploaded_at"],
                "verbose_name": django.utils.translation.gettext_lazy("Image"),
                "verbose_name_plural": django.utils.translation.gettext_lazy("Images"),
            },
        ),
        migrations.AlterModelOptions(
            name="project",
            options={
                "verbose_name": django.utils.translation.gettext_lazy("Project"),
                "verbose_name_plural": django.utils.translation.gettext_lazy("Projects"),
            },
        ),
        migrations.AlterModelOptions(
            name="task",
            options={
                "verbose_name": django.utils.translation.gettext_lazy("Task"),
                "verbose_name_plural": django.utils.translation.gettext_lazy("Tasks"),
            },
        ),
    ]
