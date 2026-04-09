# Generated manually for SiteBroadcast

import django.utils.timezone
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("pages", "0012_task_unique_project_image"),
    ]

    operations = [
        migrations.CreateModel(
            name="SiteBroadcast",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("title_zh", models.CharField(blank=True, default="", max_length=200, verbose_name="Title (Chinese)")),
                ("title_en", models.CharField(blank=True, default="", max_length=200, verbose_name="Title (English)")),
                ("body_zh", models.TextField(blank=True, default="", verbose_name="Message (Chinese)")),
                ("body_en", models.TextField(blank=True, default="", verbose_name="Message (English)")),
                ("is_active", models.BooleanField(default=True, help_text="If enabled, other broadcasts are turned off automatically.", verbose_name="Enabled")),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={
                "verbose_name": "Site broadcast",
                "verbose_name_plural": "Site broadcasts",
            },
        ),
    ]
