"""
注入全站可读的「系统广播」：管理员在后台启用的一条通知，供顶栏通知下拉展示。
"""
from .models import SiteBroadcast


def site_broadcast(request):
    b = (
        SiteBroadcast.objects.filter(is_active=True)
        .order_by("-updated_at")
        .first()
    )
    return {"site_broadcast": b}
