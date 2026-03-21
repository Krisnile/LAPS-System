"""
LAPS 内置默认超级管理员（Django User）。

- 用户名、初始密码在迁移与 `create_admin` 中保持一致。
- 仍为初始密码时，登录成功后会跳转到 Django 后台的修改密码页（admin:password_change）。
"""

DEFAULT_ADMIN_USERNAME = "admin"
DEFAULT_ADMIN_PASSWORD = "admin123456"
