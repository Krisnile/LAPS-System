from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from apps.pages.defaults import DEFAULT_ADMIN_PASSWORD, DEFAULT_ADMIN_USERNAME


class Command(BaseCommand):
    help = (
        f'确保内置超级管理员存在：用户名 {DEFAULT_ADMIN_USERNAME}，'
        f'密码 {DEFAULT_ADMIN_PASSWORD}（与数据库迁移一致）。'
    )

    def handle(self, *args, **options):
        User = get_user_model()
        username = DEFAULT_ADMIN_USERNAME
        password = DEFAULT_ADMIN_PASSWORD

        user = User.objects.filter(username=username).first()
        if user:
            user.set_password(password)
            user.is_staff = True
            user.is_superuser = True
            user.is_active = True
            user.save()
            self.stdout.write(
                self.style.SUCCESS(
                    f'已更新用户 "{username}"：已设为超级管理员并重置为默认密码。'
                )
            )
            return

        User.objects.create_superuser(
            username=username,
            email="",
            password=password,
        )
        self.stdout.write(
            self.style.SUCCESS(
                f'已创建超级用户 "{username}"，默认密码见 apps/pages/defaults.py。'
                f'登录后可选「超级管理员」进入 /admin/，或以普通身份进入 /manage/。'
            )
        )
