# SiteBroadcast: single title + body (merge zh/en fields)

from django.db import migrations, models


def merge_broadcast_fields(apps, schema_editor):
    SiteBroadcast = apps.get_model("pages", "SiteBroadcast")
    for row in SiteBroadcast.objects.all():
        title = (getattr(row, "title_zh", None) or getattr(row, "title_en", None) or "").strip()
        body = (getattr(row, "body_zh", None) or getattr(row, "body_en", None) or "").strip()
        row.title = title
        row.body = body
        row.save(update_fields=["title", "body"])


class Migration(migrations.Migration):

    dependencies = [
        ("pages", "0013_sitebroadcast"),
    ]

    operations = [
        migrations.AddField(
            model_name="sitebroadcast",
            name="title",
            field=models.CharField(blank=True, default="", max_length=200, verbose_name="Title"),
        ),
        migrations.AddField(
            model_name="sitebroadcast",
            name="body",
            field=models.TextField(blank=True, default="", verbose_name="Message"),
        ),
        migrations.RunPython(merge_broadcast_fields, migrations.RunPython.noop),
        migrations.RemoveField(model_name="sitebroadcast", name="title_zh"),
        migrations.RemoveField(model_name="sitebroadcast", name="title_en"),
        migrations.RemoveField(model_name="sitebroadcast", name="body_zh"),
        migrations.RemoveField(model_name="sitebroadcast", name="body_en"),
    ]
