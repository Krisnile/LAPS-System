# Generated manually: annotation_type, Project.linked_datasets M2M, remove Dataset.project

from django.db import migrations, models


def copy_project_fk_to_m2m(apps, schema_editor):
    Dataset = apps.get_model("pages", "Dataset")
    Project = apps.get_model("pages", "Project")
    for ds in Dataset.objects.exclude(project_id=None):
        try:
            proj = Project.objects.get(pk=ds.project_id)
            proj.linked_datasets.add(ds)
        except Project.DoesNotExist:
            pass


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("pages", "0006_dataset_project"),
    ]

    operations = [
        migrations.AddField(
            model_name="project",
            name="annotation_type",
            field=models.CharField(
                choices=[
                    ("segmentation_sam", "Image segmentation (SAM)"),
                    ("detection_yolo", "Object detection (YOLO) — coming soon"),
                ],
                default="segmentation_sam",
                help_text="Determines which model/UI to use; only segmentation (SAM) is active for now.",
                max_length=32,
                verbose_name="Annotation task type",
            ),
        ),
        migrations.AddField(
            model_name="project",
            name="linked_datasets",
            field=models.ManyToManyField(
                blank=True,
                help_text="Datasets used by this project. Batch task creation may require picking one of these.",
                related_name="projects",
                to="pages.dataset",
                verbose_name="Linked datasets",
            ),
        ),
        migrations.RunPython(copy_project_fk_to_m2m, noop_reverse),
        migrations.RemoveField(
            model_name="dataset",
            name="project",
        ),
    ]
