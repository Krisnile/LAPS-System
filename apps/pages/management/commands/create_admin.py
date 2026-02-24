from django.core.management.base import BaseCommand
from django.contrib.auth.models import User


class Command(BaseCommand):
    help = 'Create admin user (username: admin, password: 123456) for user management system.'

    def handle(self, *args, **options):
        username = 'admin'
        password = '123456'
        if User.objects.filter(username=username).exists():
            self.stdout.write(self.style.WARNING(f'User "{username}" already exists.'))
            return
        user = User.objects.create_user(username=username, password=password)
        user.is_staff = False
        user.is_superuser = False
        user.save()
        self.stdout.write(self.style.SUCCESS(f'Created user "{username}" with password 123456. You can now log in and access /manage/.'))
