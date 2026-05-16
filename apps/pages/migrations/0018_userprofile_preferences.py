# Generated manually for UI preferences persistence

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("pages", "0017_yolo_segmentation_type"),
    ]

    operations = [
        migrations.AddField(
            model_name="userprofile",
            name="preferences",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
