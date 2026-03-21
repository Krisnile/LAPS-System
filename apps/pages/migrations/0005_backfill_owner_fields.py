# Generated manually: backfill Task.owner / Annotation.owner

from django.db import migrations


def forwards(apps, schema_editor):
    Task = apps.get_model("pages", "Task")
    Annotation = apps.get_model("pages", "Annotation")

    # Backfill Task.owner: prefer project.owner, else assigned_to
    for task in Task.objects.all().iterator():
        if task.owner_id:
            continue
        owner_id = None
        try:
            owner_id = task.project.owner_id
        except Exception:
            owner_id = None
        if not owner_id:
            owner_id = task.assigned_to_id
        if owner_id:
            Task.objects.filter(pk=task.pk, owner_id__isnull=True).update(owner_id=owner_id)

    # Backfill Annotation.owner: prefer user, else task.owner
    for ann in Annotation.objects.all().iterator():
        if ann.owner_id:
            continue
        owner_id = ann.user_id
        if not owner_id:
            try:
                owner_id = ann.task.owner_id
            except Exception:
                owner_id = None
        if owner_id:
            Annotation.objects.filter(pk=ann.pk, owner_id__isnull=True).update(owner_id=owner_id)


def backwards(apps, schema_editor):
    # Keep user-entered owner values; do not blank on reverse.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("pages", "0004_task_annotation_owner"),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]

