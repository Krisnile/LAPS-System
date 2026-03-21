"""
模板标签：用户头像等。
"""
from django import template
from django.templatetags.static import static

from apps.pages.models import UserProfile

register = template.Library()

_DEFAULT_AVATAR = "assets/img/anime3.png"


@register.simple_tag
def user_avatar_src(user):
    """
    返回用户头像的 URL（含 MEDIA_URL）或默认静态占位图。
    无 UserProfile 或未上传头像时使用默认图。
    """
    default = static(_DEFAULT_AVATAR)
    if not user or not getattr(user, "is_authenticated", False):
        return default
    try:
        prof = user.laps_profile
    except UserProfile.DoesNotExist:
        return default
    if prof.avatar:
        return prof.avatar.url
    return default
