"""
注入全站可读的「系统广播」：管理员在后台启用的一条通知，供顶栏通知下拉展示。
以及登录用户的界面偏好 JSON，供首屏脚本写入 localStorage，与数据库持久化一致。
"""
import json

from django.utils.safestring import mark_safe

from .models import SiteBroadcast, UserProfile


def site_broadcast(request):
    b = (
        SiteBroadcast.objects.filter(is_active=True)
        .order_by("-updated_at")
        .first()
    )
    return {"site_broadcast": b}


def user_ui_preferences(request):
    """
    已登录：返回 mark_safe 的 JSON 字面量，供 laps-ui-prefs-bootstrap 写入 localStorage。
    未登录：laps_ui_prefs 为 None，不注入脚本。
    """
    if not getattr(request, "user", None) or not request.user.is_authenticated:
        return {"laps_ui_prefs": None}
    try:
        prof = UserProfile.objects.only("preferences").get(user=request.user)
        prefs = prof.preferences if isinstance(prof.preferences, dict) else {}
    except UserProfile.DoesNotExist:
        prefs = {}
    return {"laps_ui_prefs": mark_safe(json.dumps(prefs, ensure_ascii=False))}
