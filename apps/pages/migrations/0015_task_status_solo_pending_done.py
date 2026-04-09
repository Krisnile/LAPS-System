# 任务状态简化为单人使用：pending / done；旧状态合并为 pending

from django.db import migrations, models


def forwards(apps, schema_editor):
    Task = apps.get_model("pages", "Task")
    Task.objects.filter(status__in=["new", "assigned", "in_review"]).update(status="pending")


def backwards(apps, schema_editor):
    Task = apps.get_model("pages", "Task")
    Task.objects.filter(status="pending").update(status="new")


class Migration(migrations.Migration):

    dependencies = [
        ("pages", "0014_sitebroadcast_single_title_body"),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
        migrations.AlterField(
            model_name="task",
            name="status",
            field=models.CharField(
                choices=[("pending", "Pending annotation"), ("done", "Done")],
                default="pending",
                max_length=20,
            ),
        ),
    ]
