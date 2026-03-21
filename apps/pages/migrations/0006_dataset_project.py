# Generated manually for Dataset.project (optional link to Project)

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("pages", "0005_backfill_owner_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="dataset",
            name="project",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="datasets",
                to="pages.project",
            ),
        ),
    ]
