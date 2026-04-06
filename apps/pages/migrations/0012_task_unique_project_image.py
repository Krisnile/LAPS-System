# 同一项目下同一图片仅允许一条任务（与业务规则一致；升级前自动去除重复保留最早 id）

from django.db import migrations, models


def dedupe_project_image_tasks(apps, schema_editor):
    Task = apps.get_model("pages", "Task")
    seen = set()
    for t in Task.objects.all().order_by("id"):
        key = (t.project_id, t.image_id)
        if key in seen:
            t.delete()
        else:
            seen.add(key)


class Migration(migrations.Migration):

    dependencies = [
        ("pages", "0011_image_storage_per_user"),
    ]

    operations = [
        migrations.RunPython(dedupe_project_image_tasks, migrations.RunPython.noop),
        migrations.AddConstraint(
            model_name="task",
            constraint=models.UniqueConstraint(
                fields=("project", "image"),
                name="uniq_laps_task_project_image",
            ),
        ),
    ]
