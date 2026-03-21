from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("pages", "0007_project_annotation_linked_datasets"),
    ]

    operations = [
        migrations.AddField(
            model_name="image",
            name="caption",
            field=models.CharField(
                blank=True,
                default="",
                max_length=500,
                verbose_name="Caption / note",
                help_text="Optional label or note for this image in the dataset manager.",
            ),
        ),
    ]
