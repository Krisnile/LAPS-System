# 确保存在内置超级管理员（与 apps/pages/defaults.py 保持用户名与密码一致）

from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.db import migrations

# 须与 apps.pages.defaults 同步
_DEFAULT_ADMIN_USERNAME = "admin"
_DEFAULT_ADMIN_PASSWORD = "admin123456"


def ensure_default_admin(apps, schema_editor):
    User = apps.get_model(settings.AUTH_USER_MODEL)
    username = _DEFAULT_ADMIN_USERNAME
    password = _DEFAULT_ADMIN_PASSWORD
    u = User.objects.filter(username=username).first()
    if u:
        u.password = make_password(password)
        u.is_staff = True
        u.is_superuser = True
        u.is_active = True
        u.save()
        return
    User.objects.create(
        username=username,
        password=make_password(password),
        is_staff=True,
        is_superuser=True,
        is_active=True,
        email="",
    )


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("pages", "0009_alter_project_and_image_meta"),
    ]

    operations = [
        migrations.RunPython(ensure_default_admin, noop_reverse),
    ]
