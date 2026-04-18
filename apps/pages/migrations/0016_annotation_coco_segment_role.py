# Annotation：COCO JSON 快照、分割角色（前景/背景/其他）

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("pages", "0015_task_status_solo_pending_done"),
    ]

    operations = [
        migrations.AddField(
            model_name="annotation",
            name="segment_role",
            field=models.CharField(
                blank=True,
                default="",
                help_text="foreground / background / other — UI role when saving.",
                max_length=32,
                verbose_name="Segment role",
            ),
        ),
        migrations.AddField(
            model_name="annotation",
            name="coco_json",
            field=models.JSONField(blank=True, null=True, verbose_name="COCO JSON snapshot"),
        ),
        migrations.AlterField(
            model_name="annotation",
            name="label",
            field=models.CharField(
                blank=True,
                help_text="Custom COCO category name chosen when saving.",
                max_length=200,
                verbose_name="Category name",
            ),
        ),
    ]
