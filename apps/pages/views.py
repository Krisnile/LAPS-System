"""
apps.pages.views
----------------
主站页面视图：仪表盘、项目/数据集/任务、标注、个人信息、用户管理（admin）、
登录重定向、API（segment-image、annotations 等）。
"""
from django.shortcuts import render, get_object_or_404, redirect
from django.http import Http404, JsonResponse, HttpResponse, FileResponse
from django.core.files.storage import default_storage
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.contrib.auth.models import User
from django.contrib.auth import login as auth_login, get_user_model
from django.views import View
from PIL import Image as PILImage, ImageDraw
from django.conf import settings
import json
import os
import uuid
import base64
import zipfile
import urllib.error
import urllib.request
from io import BytesIO
from urllib.parse import urlparse

from django.core.files.base import ContentFile
from . import models
from .coco_mask import binary_mask_bbox_and_area, build_coco_document, resize_mask_bytes_to_size
from .annotation_export import (
    EXPORT_FORMATS,
    build_merged_coco_project,
    build_project_export_zip_bytes,
    build_project_simple_export_dict,
    build_simple_export_dict,
    build_voc_xml_string,
    build_yolo_bbox_line,
    load_annotation_binary_mask,
)
from django.utils import timezone
from django.utils.translation import gettext as _
from django.contrib.auth.views import LoginView
from django.db import IntegrityError
from django.db.models import Count, Prefetch
from django.urls import reverse

# SAM / YOLO-seg：两者均返回灰度掩码 PNG bytes
try:
    from .sam_inference import run_segmentation_on_bytes, run_yolo_segmentation_on_bytes
except Exception:
    run_segmentation_on_bytes = None
    run_yolo_segmentation_on_bytes = None


def _is_manage_admin(user):
    """仅用户名 admin 可进入用户管理系统"""
    return user.is_authenticated and user.username == 'admin'


_TASK_BADGE_BY_STATUS = {
    'pending': 'warning',
    'done': 'success',
}


def _dashboard_payload(user):
    """
    首页仪表盘 React 的 props 字典（序列化为 JSON 写入 data-dashboard）。
    含 KPI、图表数据、最近任务列表。
    """
    urls = {
        'projects': reverse('projects'),
        'datasets': reverse('datasets'),
        'tasks': reverse('tasks'),
        'annotation': reverse('annotation'),
    }
    display_name = ((user.get_full_name() or '').strip() or (user.username or '')) if user.is_authenticated else ''

    task_qs = models.Task.objects.filter(owner=user).select_related('project', 'image')
    projects_count = models.Project.objects.filter(owner=user).count()
    datasets_count = models.Dataset.objects.filter(owner=user).count()
    tasks_count = task_qs.count()
    pending_tasks = task_qs.filter(status='pending').count()
    completed_tasks = task_qs.filter(status='done').count()

    task_status_chart = [
        {
            'key': 'pending',
            'name': 'Pending',
            'nameZh': '待标注',
            'value': pending_tasks,
            'fill': '#fb6340',
        },
        {
            'key': 'done',
            'name': 'Done',
            'nameZh': '已完成',
            'value': completed_tasks,
            'fill': '#2dce89',
        },
    ]

    resource_chart = [
        {
            'key': 'projects',
            'name': 'Projects',
            'nameZh': '项目',
            'value': projects_count,
        },
        {
            'key': 'datasets',
            'name': 'Datasets',
            'nameZh': '数据集',
            'value': datasets_count,
        },
        {
            'key': 'tasks',
            'name': 'Tasks',
            'nameZh': '任务',
            'value': tasks_count,
        },
    ]

    recent_tasks = []
    for t in task_qs.order_by('-created_at')[:5]:
        fn = ''
        if t.image_id and t.image.file:
            fn = os.path.basename(t.image.file.name)
        short = (fn[:48] + '…') if len(fn) > 48 else fn
        recent_tasks.append(
            {
                'id': t.id,
                'project_name': t.project.name,
                'image_short': short,
                'image_name': fn,
                'status_display': t.get_status_display(),
                'badge': _TASK_BADGE_BY_STATUS.get(t.status, 'secondary'),
            }
        )

    return {
        'projectsCount': projects_count,
        'datasetsCount': datasets_count,
        'tasksCount': tasks_count,
        'pendingTasks': pending_tasks,
        'completedTasks': completed_tasks,
        'isAuthenticated': user.is_authenticated,
        'username': display_name,
        'urls': urls,
        'taskStatusChart': task_status_chart,
        'resourceChart': resource_chart,
        'recentTasks': recent_tasks,
    }


class LAPSLoginView(LoginView):
    """
    自定义登录视图：
    - 保留原有滑动验证校验
    - 内置 admin 若仍为初始密码（与 defaults 一致），登录后优先进入 django-unfold 的修改密码页（admin:password_change）
    - 否则：合法 next → 跳转；admin 选「超级管理员」→ /admin/；其余 → 首页
    """
    template_name = "accounts/auth-signin.html"

    def post(self, request, *args, **kwargs):
        # 简单服务端校验滑动验证是否完成
        slider_ok = request.POST.get('slider_ok')
        if slider_ok != '1':
            messages.error(request, '请先完成滑动验证后再登录。')
            return redirect('auth_signin')
        role = request.POST.get('role') or 'user'
        request.session['login_role'] = role
        return super().post(request, *args, **kwargs)

    def form_invalid(self, form):
        """
        登录失败时（账号不存在 / 密码错误等），给出统一的友好提示，
        由于表单由 React 渲染，这里不再依赖 Django 默认的 form.errors 展示。
        """
        messages.error(self.request, "用户名或密码错误，请检查后重试。")
        return redirect('auth_signin')

    def get_success_url(self):
        """
        - 内置 admin 仍为初始密码 → 后台「修改密码」（须 is_staff 才能访问 admin 路由）
        - 若有合法 next → 跳转 next
        - admin 且选「超级管理员」→ /admin/；其余 → 首页 /
        """
        user = self.request.user
        if user.is_authenticated and user.username == "admin" and user.is_staff:
            from apps.pages.defaults import DEFAULT_ADMIN_PASSWORD

            if user.check_password(DEFAULT_ADMIN_PASSWORD):
                return reverse("admin:password_change")
        redirect_to = self.get_redirect_url()
        if redirect_to:
            return redirect_to
        role = self.request.session.pop("login_role", "user")
        if user.is_authenticated and user.username == "admin" and role == "super":
            return "/admin/"
        return "/"


class LAPSSignupView(View):
    """
    简单的注册视图：
    - 使用 Django 自带 User 模型创建账号
    - 表单复用 UserCreationForm + Email 字段
    - 注册成功后自动登录并跳转到首页
    """
    template_name = "accounts/auth-signup.html"

    def get(self, request, *args, **kwargs):
        # React 注册卡片自己渲染表单，这里仅渲染壳模板
        return render(request, self.template_name, {})

    def post(self, request, *args, **kwargs):
        """
        处理注册提交：
        - 基于 POST 字段手动校验
        - 通过 Django User 模型创建账号
        - 使用 messages 提示成功 / 失败
        """
        User = get_user_model()
        username = (request.POST.get("username") or "").strip()
        email = (request.POST.get("email") or "").strip()
        password1 = request.POST.get("password1") or ""
        password2 = request.POST.get("password2") or ""

        if not username or not password1:
            messages.error(request, "用户名和密码不能为空。")
            return redirect("auth_signup")

        if password1 != password2:
            messages.error(request, "两次输入的密码不一致。")
            return redirect("auth_signup")

        if User.objects.filter(username=username).exists():
            messages.error(request, "该用户名已存在，请更换一个。")
            return redirect("auth_signup")

        try:
            user = User.objects.create_user(
                username=username,
                email=email or "",
                password=password1,
            )
        except Exception:
            messages.error(request, "注册失败，请稍后重试。")
            return redirect("auth_signup")

        messages.success(request, "注册成功，请使用新账号登录。")
        return redirect("auth_signin")


@login_required
def support_wiki(request):
    """
    Support / user guide：登录后的使用流程说明。
    底栏 Support 入口；需登录后访问。
    """
    return render(
        request,
        "pages/support_wiki.html",
        {"segment": "Support"},
    )


@login_required
def index(request):
    """数据管理首页：React 仪表盘（KPI、图表、最近任务）。"""
    context = {'segment': 'dashboard'}
    try:
        payload = _dashboard_payload(request.user)
    except Exception:
        payload = {
            'projectsCount': 0,
            'datasetsCount': 0,
            'tasksCount': 0,
            'pendingTasks': 0,
            'completedTasks': 0,
            'isAuthenticated': request.user.is_authenticated,
            'username': (request.user.get_full_name() or '').strip() or request.user.username,
            'urls': {
                'projects': reverse('projects'),
                'datasets': reverse('datasets'),
                'tasks': reverse('tasks'),
                'annotation': reverse('annotation'),
            },
            'taskStatusChart': [],
            'resourceChart': [],
            'recentTasks': [],
        }
    context['dashboard_json'] = json.dumps(payload, ensure_ascii=False)
    return render(request, 'pages/dashboard.html', context)


@login_required
def profile(request):
    """个人信息与设置页：头像、邮箱、昵称"""
    user = request.user
    try:
        profile_obj, _ = models.UserProfile.objects.get_or_create(user=user, defaults={})
    except Exception:
        class _DummyProfile:
            avatar = None
        profile_obj = _DummyProfile()
    if request.method == 'POST' and hasattr(profile_obj, 'save'):
        try:
            user.email = (request.POST.get('email') or user.email or '').strip() or user.email
            user.first_name = (request.POST.get('nickname') or user.first_name or '').strip()
            user.save()
            if request.FILES.get('avatar'):
                profile_obj.avatar = request.FILES['avatar']
                profile_obj.save()
            messages.success(request, '保存成功。邮箱与昵称已更新。')
        except Exception:
            messages.error(request, '保存失败，请重试。')
        return redirect('profile')
    return render(request, 'pages/profile.html', {
        'segment': 'profile',
        'profile': profile_obj,
    })


@login_required
def user_manage_list(request):
    """用户管理列表（仅 admin 可访问，对应 auth_user 表信息）"""
    if not _is_manage_admin(request.user):
        messages.warning(request, '无权限访问用户管理。')
        return redirect('index')
    users = User.objects.all().order_by('-date_joined')
    return render(request, 'pages/user_manage.html', {
        'segment': 'user_manage',
        'users': users,
    })


@login_required
@require_http_methods(['POST'])
def user_manage_toggle_active(request, pk):
    """切换用户 is_active（仅 admin）"""
    if not _is_manage_admin(request.user):
        return redirect('index')
    user = get_object_or_404(User, pk=pk)
    if user.username == 'admin':
        messages.warning(request, '不能禁用 admin 账户。')
        return redirect('user_manage')
    user.is_active = not user.is_active
    user.save()
    messages.success(request, f'用户 {user.username} 已{"启用" if user.is_active else "禁用"}。')
    return redirect('user_manage')


def _is_xhr(request):
    return (request.headers.get('X-Requested-With') or '').lower() == 'xmlhttprequest'


# ZIP / URL 导入安全与体量上限
_DATASET_ZIP_MAX_FILES = 400
_DATASET_ZIP_MAX_UNCOMPRESSED = 500 * 1024 * 1024  # 500 MiB
_DATASET_URL_MAX_LINES = 80
_DATASET_URL_MAX_BYTES_PER_IMAGE = 25 * 1024 * 1024  # 25 MiB
_DATASET_URL_FETCH_TIMEOUT = 25
_IMAGE_EXT_ZIP = {
    '.jpg',
    '.jpeg',
    '.png',
    '.gif',
    '.bmp',
    '.webp',
    '.tif',
    '.tiff',
}
_PIL_EXT = {'JPEG': '.jpg', 'PNG': '.png', 'GIF': '.gif', 'WEBP': '.webp', 'BMP': '.bmp', 'TIFF': '.tiff'}


def _zip_entry_basename(name):
    base = os.path.basename((name or '').replace('\\', '/'))
    if not base or '..' in base:
        return None
    return base


def _save_raw_bytes_as_image(dataset, raw_bytes):
    """校验为图像后通过 ImageField 写入 MEDIA_ROOT（datasets/user_<owner>/年/月/日），并创建 Image 记录。"""
    if not raw_bytes or len(raw_bytes) < 24:
        raise ValueError('invalid image data')
    bio = BytesIO(raw_bytes)
    pil = PILImage.open(bio)
    pil.load()
    fmt = (pil.format or 'PNG').upper()
    ext = _PIL_EXT.get(fmt, '.png')
    width, height = pil.size
    stored_name = f"{uuid.uuid4().hex[:16]}{ext}"
    img = models.Image(dataset=dataset)
    img.file.save(stored_name, ContentFile(raw_bytes), save=False)
    img.width = width
    img.height = height
    img.save()
    return img


def _save_images_to_dataset(dataset, files):
    """将上传文件经 ImageField 写入媒体目录（按数据集 owner 分 user_<id>/年/月/日），并创建 Image 记录。"""
    created = []
    for f in files:
        safe_name = os.path.basename((getattr(f, 'name', None) or 'upload.bin').replace('\\', '/'))
        if not safe_name or safe_name in ('.', '..'):
            safe_name = f'image_{uuid.uuid4().hex[:10]}.bin'
        img = models.Image(dataset=dataset)
        img.file.save(safe_name, f, save=False)
        try:
            img.file.open('rb')
            pil = PILImage.open(img.file)
            img.width, img.height = pil.size
        except Exception:
            img.width, img.height = None, None
        finally:
            try:
                img.file.close()
            except Exception:
                pass
        img.save()
        created.append(img)
    return created


def _save_images_from_zip(dataset, uploaded_zip):
    """从 ZIP 解压常见图像扩展名并导入（跳过路径穿越与非图像文件）。"""
    created = []
    with zipfile.ZipFile(uploaded_zip) as zf:
        infos = [i for i in zf.infolist() if not i.is_dir()]
        if len(infos) > _DATASET_ZIP_MAX_FILES:
            raise ValueError(
                _('ZIP contains too many entries (max %(max)s).') % {'max': _DATASET_ZIP_MAX_FILES}
            )
        total_size = sum(i.file_size for i in infos)
        if total_size > _DATASET_ZIP_MAX_UNCOMPRESSED:
            raise ValueError(_('ZIP uncompressed size exceeds the allowed limit.'))
        for info in infos:
            safe = _zip_entry_basename(info.filename)
            if not safe:
                continue
            ext = os.path.splitext(safe)[1].lower()
            if ext not in _IMAGE_EXT_ZIP:
                continue
            if info.file_size > _DATASET_URL_MAX_BYTES_PER_IMAGE:
                continue
            try:
                with zf.open(info, 'r') as member_fp:
                    raw = member_fp.read()
                img = _save_raw_bytes_as_image(dataset, raw)
                # 用 ZIP 内文件名作为初始备注（可随后在界面修改）
                base_no_ext = os.path.splitext(safe)[0][:200]
                if base_no_ext:
                    img.caption = base_no_ext
                    img.save(update_fields=['caption'])
                created.append(img)
            except Exception:
                continue
    return created


def _parse_dataset_url_import_line(line):
    """
    解析 URL 导入单行：返回 (url, caption_or_none)。
    支持「URL | 备注」或「URL<TAB>备注」；备注最长 500（与 Image.caption 一致）。
    """
    s = (line or '').strip()
    if not s:
        return None, None
    url = s
    user_caption = None
    if ' | ' in s:
        url, rest = s.split(' | ', 1)
        url = url.strip()
        rest = rest.strip()
        user_caption = rest[:500] if rest else None
    elif '\t' in s:
        url, rest = s.split('\t', 1)
        url = url.strip()
        rest = rest.strip()
        user_caption = rest[:500] if rest else None
    if not url:
        return None, None
    return url, user_caption


def _save_images_from_urls(dataset, url_text):
    """逐行 HTTP(S) URL 下载图像（跳过无效行与过大响应）；行内可带备注。"""
    lines = []
    for ln in (url_text or '').splitlines():
        s = (ln or '').strip()
        if s and s not in lines:
            lines.append(s)
    lines = lines[:_DATASET_URL_MAX_LINES]
    created = []
    for raw_line in lines:
        url, user_caption = _parse_dataset_url_import_line(raw_line)
        if not url:
            continue
        parsed = urlparse(url)
        if parsed.scheme not in ('http', 'https') or not parsed.netloc:
            continue
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'LAPS-DatasetImport/1.0'})
            with urllib.request.urlopen(req, timeout=_DATASET_URL_FETCH_TIMEOUT) as resp:
                raw = resp.read(_DATASET_URL_MAX_BYTES_PER_IMAGE + 1)
            if len(raw) > _DATASET_URL_MAX_BYTES_PER_IMAGE:
                continue
            hint = os.path.basename(parsed.path) or 'url_image'
            img = _save_raw_bytes_as_image(dataset, raw)
            if user_caption:
                img.caption = user_caption
            else:
                cap = os.path.splitext(hint)[0][:200]
                if cap:
                    img.caption = cap
            img.save(update_fields=['caption'])
            created.append(img)
        except (urllib.error.URLError, ValueError, OSError):
            continue
    return created


def _json_images_preview(images):
    return [{'id': i.id, 'url': i.file.url, 'caption': i.caption or ''} for i in images]


def _datasets_react_props(datasets_list, created_images=None):
    """列表页 React 初始数据（json.dumps + 模板 escape，避免手写 JSON 破坏 HTML 属性）。"""
    created_images = created_images or []
    rows = []
    for d in datasets_list:
        rows.append(
            {
                'id': d.id,
                'name': d.name,
                'created_at': str(d.created_at) if getattr(d, 'created_at', None) is not None else '',
                'description': d.description or '',
                'image_count': getattr(d, 'image_count', None),
                'detail_url': reverse('dataset_detail', kwargs={'pk': d.pk}),
            }
        )
    created_payload = [{'id': i.id, 'url': i.file.url} for i in created_images]
    return json.dumps(
        {
            'urls': {'datasets': reverse('datasets')},
            'datasets': rows,
            'createdImages': created_payload,
        },
        ensure_ascii=False,
    )


def _image_to_json(im: models.Image) -> dict:
    return {
        'id': im.id,
        'url': im.file.url,
        'short': im.file.name,
        'caption': im.caption or '',
    }


def _dataset_detail_react_props(ds, page_images, *, page: int, page_size: int, total_count: int):
    imgs = [_image_to_json(im) for im in page_images]
    total_pages = (total_count + page_size - 1) // page_size if total_count else 0
    return json.dumps(
        {
            'urls': {
                'datasets': reverse('datasets'),
                'datasets_list': reverse('datasets'),
                'dataset_images': reverse('dataset_images_api', kwargs={'pk': ds.id}),
            },
            'pagination': {
                'page': page,
                'page_size': page_size,
                'total': total_count,
                'total_pages': total_pages,
            },
            'dataset': {
                'id': ds.id,
                'name': ds.name,
                'created_at': str(ds.created_at) if ds.created_at else '',
                'description': ds.description or '',
                'image_count': ds.image_count,
                'images': imgs,
            },
            'createdImages': [],
        },
        ensure_ascii=False,
    )


@login_required
def projects(request):
    """项目管理：创建、更新、删除（前台 CRUD，与 Label Studio 式项目域对齐）。"""
    context = {'segment': 'projects'}
    if request.method == 'POST':
        intent = (request.POST.get('intent') or 'create').strip()
        user = request.user
        if intent == 'create':
            name = (request.POST.get('name') or 'Untitled').strip()[:200]
            description = request.POST.get('description', '')
            atype = (request.POST.get('annotation_type') or models.Project.ANNOTATION_SEGMENTATION_SAM).strip()
            valid_types = {c[0] for c in models.Project.ANNOTATION_TYPE_CHOICES}
            if atype not in valid_types:
                atype = models.Project.ANNOTATION_SEGMENTATION_SAM
            proj = models.Project.objects.create(
                name=name, description=description, owner=user, annotation_type=atype
            )
            ds_ids = []
            for x in request.POST.getlist('datasets'):
                try:
                    ds_ids.append(int(x))
                except (TypeError, ValueError):
                    pass
            for did in ds_ids:
                ds = get_object_or_404(models.Dataset, id=did, owner=user)
                proj.linked_datasets.add(ds)
            context['created'] = proj
            messages.success(request, 'Project created.')
        elif intent == 'update':
            proj = get_object_or_404(models.Project, id=request.POST.get('project_id'), owner=user)
            name = (request.POST.get('name') or proj.name).strip()[:200]
            proj.name = name
            proj.description = request.POST.get('description', '')
            atype = (request.POST.get('annotation_type') or proj.annotation_type).strip()
            valid_types = {c[0] for c in models.Project.ANNOTATION_TYPE_CHOICES}
            if atype in valid_types:
                proj.annotation_type = atype
            proj.save(update_fields=['name', 'description', 'annotation_type'])
            ds_ids = []
            for x in request.POST.getlist('datasets'):
                try:
                    ds_ids.append(int(x))
                except (TypeError, ValueError):
                    pass
            proj.linked_datasets.clear()
            for did in ds_ids:
                ds = get_object_or_404(models.Dataset, id=did, owner=user)
                proj.linked_datasets.add(ds)
            messages.success(request, 'Project updated.')
        elif intent == 'delete':
            proj = get_object_or_404(models.Project, id=request.POST.get('project_id'), owner=user)
            proj.delete()
            messages.success(request, 'Project deleted.')
        else:
            messages.error(request, 'Unknown action.')
    context['projects'] = (
        models.Project.objects.filter(owner=request.user)
        .prefetch_related('linked_datasets')
        .order_by('-created_at')[:200]
    )
    context['datasets_for_project'] = models.Dataset.objects.filter(owner=request.user).order_by('name')[:500]
    context['annotation_type_choice_list'] = [
        {'value': k, 'label': str(v)} for k, v in models.Project.ANNOTATION_TYPE_CHOICES
    ]
    return render(request, 'pages/projects.html', context)


def _redirect_detail_or_list(request, dataset_pk, to_detail):
    """POST 后跳转：详情页提交 redirect=detail 时回到该数据集详情。"""
    if to_detail and dataset_pk is not None:
        return redirect('dataset_detail', pk=dataset_pk)
    return redirect('datasets')


@login_required
def datasets(request):
    """数据集列表与统一 POST（创建 / 更新 / 删除 / 追加 / 单图）；预览与继续导入在详情页。"""
    context = {'segment': 'datasets'}
    user = request.user
    redirect_detail = request.POST.get('redirect') == 'detail'

    if request.method == 'POST':
        intent = (request.POST.get('intent') or 'create').strip()
        if intent == 'create':
            name = (request.POST.get('name') or f"dataset_{uuid.uuid4().hex[:6]}").strip()[:200]
            description = request.POST.get('description', '')
            import_type = (request.POST.get('import_type') or 'images').strip().lower()
            if import_type not in ('images', 'zip', 'urls'):
                import_type = 'images'
            ds = models.Dataset.objects.create(name=name, description=description, owner=user)
            created = []
            try:
                if import_type == 'zip':
                    z = request.FILES.get('archive')
                    if not z:
                        raise ValueError(_('Please choose a ZIP file to upload.'))
                    created = _save_images_from_zip(ds, z)
                elif import_type == 'urls':
                    created = _save_images_from_urls(ds, request.POST.get('url_list', ''))
                else:
                    files = request.FILES.getlist('files')
                    created = _save_images_to_dataset(ds, files) if files else []
            except ValueError as e:
                if _is_xhr(request):
                    return JsonResponse({'ok': False, 'error': str(e)}, status=400)
                messages.error(request, str(e))
            else:
                msg = str(_('Dataset created.')) + (f' {len(created)} image(s).' if created else '')
                messages.success(request, msg)
                if _is_xhr(request):
                    return JsonResponse(
                        {
                            'ok': True,
                            'message': msg,
                            'dataset': {'id': ds.id, 'name': ds.name},
                            'created_images': _json_images_preview(created),
                        }
                    )
                return redirect('dataset_detail', pk=ds.pk)
        elif intent == 'update':
            ds = get_object_or_404(models.Dataset, id=request.POST.get('dataset_id'), owner=user)
            ds.name = (request.POST.get('name') or ds.name).strip()[:200]
            ds.description = request.POST.get('description', '')
            ds.save()
            messages.success(request, _('Dataset updated.'))
            return _redirect_detail_or_list(request, ds.pk, redirect_detail)
        elif intent == 'delete':
            get_object_or_404(models.Dataset, id=request.POST.get('dataset_id'), owner=user).delete()
            messages.success(request, _('Dataset deleted.'))
            return redirect('datasets')
        elif intent == 'append_images':
            ds = get_object_or_404(models.Dataset, id=request.POST.get('dataset_id'), owner=user)
            import_type = (request.POST.get('import_type') or 'images').strip().lower()
            if import_type not in ('images', 'zip', 'urls'):
                import_type = 'images'
            created = []
            try:
                if import_type == 'zip':
                    z = request.FILES.get('archive')
                    if not z:
                        raise ValueError(_('Please choose a ZIP file to upload.'))
                    created = _save_images_from_zip(ds, z)
                elif import_type == 'urls':
                    created = _save_images_from_urls(ds, request.POST.get('url_list', ''))
                else:
                    files = request.FILES.getlist('files')
                    created = _save_images_to_dataset(ds, files) if files else []
            except ValueError as e:
                if _is_xhr(request):
                    return JsonResponse({'ok': False, 'error': str(e)}, status=400)
                messages.error(request, str(e))
                return _redirect_detail_or_list(request, ds.pk, redirect_detail)
            else:
                amsg = f'Added {len(created)} image(s).' if created else str(_('No files uploaded.'))
                messages.success(request, amsg)
                if _is_xhr(request):
                    return JsonResponse(
                        {
                            'ok': True,
                            'message': amsg,
                            'dataset_id': ds.id,
                            'created_images': _json_images_preview(created),
                        }
                    )
                return _redirect_detail_or_list(request, ds.pk, redirect_detail)
        elif intent == 'delete_image':
            img = get_object_or_404(models.Image, id=request.POST.get('image_id'), dataset__owner=user)
            ds_pk = img.dataset_id
            img.delete()
            messages.success(request, _('Image removed.'))
            return _redirect_detail_or_list(request, ds_pk, redirect_detail)
        elif intent == 'update_image':
            img = get_object_or_404(models.Image, id=request.POST.get('image_id'), dataset__owner=user)
            img.caption = (request.POST.get('caption') or '')[:500]
            img.save(update_fields=['caption'])
            if _is_xhr(request):
                return JsonResponse({'ok': True, 'id': img.id, 'caption': img.caption})
            messages.success(request, _('Note saved.'))
            return _redirect_detail_or_list(request, img.dataset_id, redirect_detail)
        else:
            messages.error(request, _('Unknown action.'))

    _DATASET_PAGE_LIMIT = 200
    datasets_list = list(
        models.Dataset.objects.filter(owner=user)
        .annotate(image_count=Count('images'))
        .order_by('-created_at')[:_DATASET_PAGE_LIMIT]
    )
    context['datasets_props_json'] = _datasets_react_props(datasets_list, context.get('created_images'))
    return render(request, 'pages/datasets.html', context)


@login_required
def dataset_detail(request, pk):
    """单个数据集详情：预览与管理图片、继续导入（列表页仅基本信息）。"""
    context = {'segment': 'datasets'}
    user = request.user
    ds = (
        models.Dataset.objects.filter(pk=pk, owner=user)
        .annotate(image_count=Count('images'))
        .first()
    )
    if ds is None:
        raise Http404(_('Dataset not found'))
    _PAGE_SIZE = 48
    img_qs = models.Image.objects.filter(dataset_id=pk).order_by('-uploaded_at')
    total_count = img_qs.count()
    page_images = list(img_qs[:_PAGE_SIZE])
    ds.preview_images = page_images
    context['dataset'] = ds
    context['dataset_detail_props_json'] = _dataset_detail_react_props(
        ds, page_images, page=1, page_size=_PAGE_SIZE, total_count=total_count
    )
    return render(request, 'pages/dataset_detail.html', context)


@login_required
@require_http_methods(['GET'])
def dataset_images_api(request, pk):
    """数据集图片分页 JSON，供详情页表格翻页（与详情首屏排序一致：上传时间倒序）。"""
    get_object_or_404(models.Dataset, pk=pk, owner=request.user)
    try:
        page = max(1, int(request.GET.get('page', 1)))
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = int(request.GET.get('page_size', 48))
    except (TypeError, ValueError):
        page_size = 48
    page_size = min(100, max(8, page_size))

    qs = models.Image.objects.filter(dataset_id=pk).order_by('-uploaded_at')
    total = qs.count()
    total_pages = (total + page_size - 1) // page_size if total else 0
    if total_pages and page > total_pages:
        page = total_pages
    start = (page - 1) * page_size
    images = [_image_to_json(im) for im in qs[start : start + page_size]]

    return JsonResponse(
        {
            'ok': True,
            'page': page,
            'page_size': page_size,
            'total': total,
            'total_pages': total_pages,
            'images': images,
        }
    )


@login_required
def tasks(request):
    """任务列表；从数据集批量生成任务（若项目已关联数据集，则仅能从中选择）。"""
    context = {'segment': 'tasks'}
    if request.method == 'POST':
        project_id = request.POST.get('project')
        dataset_id = request.POST.get('dataset')
        project = get_object_or_404(models.Project, id=project_id, owner=request.user)
        dataset = get_object_or_404(models.Dataset, id=dataset_id, owner=request.user)
        linked = project.linked_datasets.all()
        if linked.exists() and not linked.filter(pk=dataset.pk).exists():
            messages.error(
                request,
                'This dataset is not linked to the selected project. Link it when editing the project, or choose a linked dataset.',
            )
        else:
            created = []
            for img in dataset.images.all():
                if not models.Task.objects.filter(owner=request.user, project=project, image=img).exists():
                    try:
                        t = models.Task.objects.create(owner=request.user, project=project, image=img)
                        created.append(t)
                    except IntegrityError:
                        pass
            context['created_tasks'] = created
            messages.success(request, f'Created {len(created)} task(s).')

    context['projects'] = models.Project.objects.filter(owner=request.user).prefetch_related('linked_datasets')[:200]
    context['datasets'] = (
        models.Dataset.objects.filter(owner=request.user).prefetch_related(
            Prefetch('projects', queryset=models.Project.objects.order_by('name'))
        )[:200]
    )
    context['tasks'] = models.Task.objects.filter(owner=request.user).select_related('image', 'project').order_by('-created_at')[:500]
    return render(request, 'pages/tasks.html', context)


DEMO_TASK_IMAGE_COUNT = 2

DEMO_SAMPLE_BY_TYPE = {
    models.Project.ANNOTATION_SEGMENTATION_SAM: {
        'dataset_name': 'LAPS 体验数据集（分割样例）',
        'project_name': 'LAPS SAM 分割体验（样例）',
        'dataset_desc': str(_('Sample images for segmentation demo; safe to delete.')),
        'project_desc': str(_('Fixed sample SAM project; you may delete anytime.')),
    },
    models.Project.ANNOTATION_SEGMENTATION_YOLO: {
        'dataset_name': 'LAPS 体验数据集（YOLO分割样例）',
        'project_name': 'LAPS YOLO 分割体验（样例）',
        'dataset_desc': str(_('Sample images for YOLO segmentation demo; safe to delete.')),
        'project_desc': str(_('Fixed sample YOLO segmentation project; you may delete anytime.')),
    },
}


def _laps_demo_png_bytes_seg(card_index: int) -> bytes:
    """分割示意：椭圆区域。"""
    w, h = 640, 420
    img = PILImage.new('RGB', (w, h), (245, 250, 255))
    draw = ImageDraw.Draw(img)
    draw.rectangle([28, 28, w - 28, h - 28], outline=(0, 105, 180), width=4)
    draw.ellipse([130, 90, 500, 310], outline=(0, 137, 123), width=3)
    draw.text((44, 40), f'LAPS Seg Demo {card_index}', fill=(33, 37, 41))
    buf = BytesIO()
    img.save(buf, format='PNG')
    return buf.getvalue()


def _laps_demo_png_bytes_det(card_index: int) -> bytes:
    """检测示意：多个矩形框。"""
    w, h = 640, 420
    img = PILImage.new('RGB', (w, h), (255, 248, 240))
    draw = ImageDraw.Draw(img)
    draw.rectangle([30, 30, w - 30, h - 30], outline=(200, 80, 0), width=3)
    draw.rectangle([80, 100, 280, 260], outline=(230, 81, 0), width=4)
    draw.rectangle([380, 120, 560, 280], outline=(230, 81, 0), width=4)
    draw.text((44, 40), f'LAPS Det Demo {card_index}', fill=(90, 40, 0))
    buf = BytesIO()
    img.save(buf, format='PNG')
    return buf.getvalue()


@login_required
@require_http_methods(['POST'])
def tasks_sample_demo(request):
    """按请求体中的 annotation_type 创建（或补齐）固定名称的体验数据集、项目、示例图与任务。"""
    try:
        body = json.loads(request.body.decode() or '{}')
    except Exception:
        body = {}
    atype = (body.get('annotation_type') or models.Project.ANNOTATION_SEGMENTATION_SAM).strip()
    valid = {k for k, _ in models.Project.ANNOTATION_TYPE_CHOICES}
    if atype not in valid:
        return JsonResponse({'code': 0, 'msg': 'invalid annotation_type'})
    meta = DEMO_SAMPLE_BY_TYPE.get(atype)
    if not meta:
        return JsonResponse({'code': 0, 'msg': 'unsupported type'})
    user = request.user
    png_fn = _laps_demo_png_bytes_seg if atype == models.Project.ANNOTATION_SEGMENTATION_SAM else _laps_demo_png_bytes_det

    ds, _ = models.Dataset.objects.get_or_create(
        owner=user,
        name=meta['dataset_name'],
        defaults={'description': meta['dataset_desc']},
    )
    for _attempt in range(12):
        if ds.images.count() >= DEMO_TASK_IMAGE_COUNT:
            break
        idx = ds.images.count() + 1
        raw = png_fn(idx)
        im = models.Image(dataset=ds)
        fname = f'laps_demo_{uuid.uuid4().hex[:12]}.png'
        im.file.save(fname, ContentFile(raw), save=True)

    proj, _ = models.Project.objects.get_or_create(
        owner=user,
        name=meta['project_name'],
        defaults={
            'description': meta['project_desc'],
            'annotation_type': atype,
        },
    )
    if proj.annotation_type != atype:
        proj.annotation_type = atype
        proj.save(update_fields=['annotation_type'])
    proj.linked_datasets.add(ds)

    for im in ds.images.all():
        try:
            models.Task.objects.get_or_create(
                project=proj,
                image=im,
                defaults={'owner': user, 'status': 'pending'},
            )
        except IntegrityError:
            pass

    n_tasks = models.Task.objects.filter(project=proj, owner=user).count()
    return JsonResponse({
        'code': 1,
        'project_id': proj.id,
        'dataset_id': ds.id,
        'annotation_type': atype,
        'image_count': ds.images.count(),
        'task_count': n_tasks,
        'annotate_url': reverse('annotation') + f'?project={proj.id}',
    })


@login_required
@require_http_methods(['GET'])
def tasks_json_list(request):
    """当前用户任务表（便于前端表格 CRUD 后刷新）。"""
    tasks = (
        models.Task.objects.filter(owner=request.user)
        .select_related('project', 'image', 'image__dataset')
        .order_by('-created_at')[:1000]
    )
    out = []
    for t in tasks:
        url = ''
        iname = ''
        ds_name = ''
        try:
            if t.image and t.image.file:
                url = t.image.file.url
                iname = os.path.basename(t.image.file.name)
            if t.image and t.image.dataset:
                ds_name = t.image.dataset.name
        except Exception:
            pass
        ds_id = None
        try:
            if t.image and t.image.dataset_id:
                ds_id = t.image.dataset_id
        except Exception:
            pass
        out.append({
            'id': t.id,
            'project_id': t.project_id,
            'project_name': t.project.name if t.project else '',
            'dataset_id': ds_id,
            'image_id': t.image_id,
            'image_url': url,
            'image_name': iname,
            'dataset_name': ds_name,
            'status': t.status,
            'created_at': t.created_at.isoformat(),
        })
    return JsonResponse({'code': 1, 'tasks': out})


@login_required
@require_http_methods(['POST'])
def tasks_delete_group(request):
    """删除当前用户下指定「项目 + 数据集」范围内全部任务（第二层任务表批量清空）。"""
    try:
        body = json.loads(request.body.decode() or '{}')
    except Exception:
        return JsonResponse({'code': 0, 'msg': 'invalid json'})
    try:
        pid = int(body.get('project_id'))
        did = int(body.get('dataset_id'))
    except (TypeError, ValueError):
        return JsonResponse({'code': 0, 'msg': 'project_id and dataset_id required'})
    get_object_or_404(models.Project, id=pid, owner=request.user)
    get_object_or_404(models.Dataset, id=did, owner=request.user)
    qs = models.Task.objects.filter(owner=request.user, project_id=pid, image__dataset_id=did)
    n_deleted, _ = qs.delete()
    return JsonResponse({'code': 1, 'deleted': n_deleted})


def _dataset_allowed_for_project(project, dataset):
    """与任务批量生成页一致：项目若已关联数据集，则仅允许这些集中的图建任务。"""
    linked = project.linked_datasets.all()
    if linked.exists() and not linked.filter(pk=dataset.pk).exists():
        return False
    return True


@login_required
def annotation(request):
    """标注工作区：必选项目 + 任务目录选图；数据均在库中（项目—关联数据集—任务—图片）。"""
    user = request.user
    ds_count = models.Dataset.objects.filter(owner=user).count()
    img_count = models.Image.objects.filter(dataset__owner=user).count()
    proj_count = models.Project.objects.filter(owner=user).count()
    task_total = models.Task.objects.filter(owner=user).count()
    task_pending = models.Task.objects.filter(owner=user).exclude(status='done').count()

    projects_qs = (
        models.Project.objects.filter(owner=user)
        .annotate(task_count=Count('tasks'), linked_count=Count('linked_datasets'))
        .order_by('name')[:200]
    )

    initial_project_id = None
    raw_pid = request.GET.get('project')
    if raw_pid:
        try:
            cand = int(raw_pid)
            if projects_qs.filter(pk=cand).exists():
                initial_project_id = cand
        except ValueError:
            pass

    annotate_stats = {
        'datasets': ds_count,
        'images': img_count,
        'projects': proj_count,
        'tasks_total': task_total,
        'tasks_pending': task_pending,
    }
    task_detail_tpl = reverse('annotate_task_detail', kwargs={'pk': 0})
    annotation_export_tpl = reverse('annotation_export', kwargs={'pk': 0})
    task_annotations_tpl = reverse('annotate_task_annotations', kwargs={'pk': 0})
    project_export_tpl = reverse('annotate_project_export', kwargs={'pk': 0})
    delete_annotation_tpl = reverse('delete_annotation', kwargs={'pk': 0})
    annotate_bootstrap = {
        'urls': {
            'datasets': reverse('datasets'),
            'projects': reverse('projects'),
            'tasks': reverse('tasks'),
            'annotation': reverse('annotation'),
            'catalog': reverse('annotate_catalog'),
            'available_images': reverse('annotate_available_images'),
            'task_create': reverse('annotate_task_create'),
            'task_detail_tpl': task_detail_tpl,
            'annotation_export_tpl': annotation_export_tpl,
            'task_annotations_tpl': task_annotations_tpl,
            'project_export_tpl': project_export_tpl,
            'delete_annotation_tpl': delete_annotation_tpl,
        },
        'stats': annotate_stats,
        'flags': {
            'has_images': img_count > 0,
            'has_projects': proj_count > 0,
            'has_tasks': task_total > 0,
            'has_pending_tasks': task_pending > 0,
        },
        'initial_project_id': initial_project_id,
        'segmentation_models': [
            {'id': 'sam', 'label_zh': 'SAM（提示驱动分割）', 'label_en': 'SAM (prompt segmentation)'},
            {'id': 'yolo', 'label_zh': 'YOLO11（实例分割）', 'label_en': 'YOLO11 (instance segmentation)'},
        ],
        'default_segmentation_model': 'sam',
    }
    context = {
        'segment': 'annotation',
        'annotate_stats': annotate_stats,
        'annotate_bootstrap': annotate_bootstrap,
        'annotate_projects': projects_qs,
        'initial_project_id': initial_project_id,
    }
    return render(request, 'pages/annotation.html', context)


@login_required
@require_http_methods(["GET"])
def annotate_catalog(request):
    """当前用户某项目下的任务目录（含图片 URL），用于标注页侧栏任务列表；支持分页，每页最多 6 条。"""
    pid = request.GET.get('project_id')
    if not pid:
        return JsonResponse({'code': 0, 'msg': 'project_id required'})
    project = get_object_or_404(models.Project, id=int(pid), owner=request.user)
    linked_ids = list(project.linked_datasets.values_list('id', flat=True))

    try:
        page = max(1, int(request.GET.get('page', 1)))
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = int(request.GET.get('page_size', 6))
    except (TypeError, ValueError):
        page_size = 6
    page_size = max(1, min(page_size, 6))

    tasks_qs = (
        models.Task.objects.filter(project=project, owner=request.user)
        .select_related('image', 'image__dataset')
        .order_by('-created_at')
    )
    total = tasks_qs.count()
    if total == 0:
        total_pages = 1
        page = 1
        start = 0
    else:
        total_pages = (total + page_size - 1) // page_size
        page = min(max(1, page), total_pages)
        start = (page - 1) * page_size

    task_list = []
    for t in tasks_qs[start : start + page_size]:
        url = ''
        name = ''
        ds_name = ''
        try:
            if t.image_id and t.image and t.image.file:
                url = t.image.file.url
                name = os.path.basename(t.image.file.name)
                ds_name = t.image.dataset.name if t.image.dataset_id else ''
        except Exception:
            pass
        task_list.append({
            'id': t.id,
            'status': t.status,
            'image_id': t.image_id,
            'image_url': url,
            'image_name': name or (f'image #{t.image_id}' if t.image_id else ''),
            'dataset_name': ds_name,
            'created_at': t.created_at.isoformat(),
        })
    return JsonResponse({
        'code': 1,
        'project': {
            'id': project.id,
            'name': project.name,
            'annotation_type': project.annotation_type,
            'linked_dataset_ids': linked_ids,
            'linked_count': len(linked_ids),
            'task_count': total,
            'label_config': project.label_config if isinstance(project.label_config, dict) else {},
        },
        'tasks': task_list,
        'pagination': {
            'total': total,
            'page': page,
            'page_size': page_size,
            'total_pages': total_pages,
        },
    })


@login_required
@require_http_methods(["GET"])
def annotate_available_images(request):
    """可为该项目新建任务的图片（已排除已有任务的图）：来自关联数据集，或未关联时来自本人全部数据集。"""
    pid = request.GET.get('project_id')
    if not pid:
        return JsonResponse({'code': 0, 'msg': 'project_id required'})
    project = get_object_or_404(models.Project, id=int(pid), owner=request.user)
    linked = project.linked_datasets.all()
    if linked.exists():
        ds_qs = linked
    else:
        ds_qs = models.Dataset.objects.filter(owner=request.user)
    existing_ids = models.Task.objects.filter(project=project).values_list('image_id', flat=True)
    images = (
        models.Image.objects.filter(dataset__in=ds_qs)
        .exclude(id__in=existing_ids)
        .select_related('dataset')
        .order_by('-uploaded_at')[:500]
    )
    out = []
    for im in images:
        if not _dataset_allowed_for_project(project, im.dataset):
            continue
        url = ''
        try:
            if im.file:
                url = im.file.url
        except Exception:
            pass
        out.append({
            'id': im.id,
            'dataset_name': im.dataset.name,
            'image_url': url,
            'caption': im.caption or '',
        })
    return JsonResponse({'code': 1, 'images': out})


@login_required
@require_http_methods(["POST"])
def annotate_task_create(request):
    """为项目 + 单张图片创建任务（一张图对应一个任务，存在联合业务约束）。"""
    try:
        data = json.loads(request.body.decode() or '{}')
    except Exception:
        return JsonResponse({'code': 0, 'msg': 'invalid json'})
    project_id = data.get('project_id')
    image_id = data.get('image_id')
    if not project_id or not image_id:
        return JsonResponse({'code': 0, 'msg': 'project_id and image_id required'})
    project = get_object_or_404(models.Project, id=int(project_id), owner=request.user)
    image = get_object_or_404(models.Image, id=int(image_id), dataset__owner=request.user)
    if not _dataset_allowed_for_project(project, image.dataset):
        return JsonResponse({'code': 0, 'msg': 'dataset not linked to this project'})
    if models.Task.objects.filter(project=project, image=image).exists():
        return JsonResponse({'code': 0, 'msg': 'task already exists for this image'})
    try:
        task = models.Task.objects.create(
            owner=request.user,
            project=project,
            image=image,
            status='pending',
        )
    except IntegrityError:
        return JsonResponse({'code': 0, 'msg': 'task already exists for this image'})
    url = ''
    try:
        url = image.file.url if image.file else ''
    except Exception:
        pass
    return JsonResponse({
        'code': 1,
        'task': {
            'id': task.id,
            'status': task.status,
            'image_id': image.id,
            'image_url': url,
            'image_name': os.path.basename(image.file.name) if image.file else '',
            'dataset_name': image.dataset.name,
            'created_at': task.created_at.isoformat(),
        },
    })


@login_required
@require_http_methods(["GET", "PATCH", "DELETE"])
def annotate_task_detail(request, pk):
    """单任务查询 / 改状态 / 删除（owner 隔离）。"""
    task = get_object_or_404(models.Task, pk=pk, owner=request.user)
    if request.method == 'GET':
        url = ''
        name = ''
        ds_name = ''
        try:
            if task.image and task.image.file:
                url = task.image.file.url
                name = os.path.basename(task.image.file.name)
                ds_name = task.image.dataset.name if task.image.dataset_id else ''
        except Exception:
            pass
        return JsonResponse({
            'code': 1,
            'task': {
                'id': task.id,
                'status': task.status,
                'project_id': task.project_id,
                'image_id': task.image_id,
                'image_url': url,
                'image_name': name,
                'dataset_name': ds_name,
            },
        })
    if request.method == 'DELETE':
        task.delete()
        return JsonResponse({'code': 1, 'msg': 'deleted'})
    # PATCH
    try:
        data = json.loads(request.body.decode() or '{}')
    except Exception:
        return JsonResponse({'code': 0, 'msg': 'invalid json'})
    status = data.get('status')
    allowed = {c[0] for c in models.Task.STATUS_CHOICES}
    if status not in allowed:
        return JsonResponse({'code': 0, 'msg': 'invalid status'})
    task.status = status
    task.save(update_fields=['status'])
    return JsonResponse({
        'code': 1,
        'task': {'id': task.id, 'status': task.status},
    })


@login_required
@require_http_methods(["GET"])
def annotate_task_annotations(request, pk):
    """某任务下已保存的标注列表（用于前端恢复遮罩与列表）。"""
    task = get_object_or_404(models.Task, pk=pk, owner=request.user)
    anns = (
        models.Annotation.objects.filter(task=task, owner=request.user)
        .order_by('id')
    )
    out = []
    for a in anns:
        url = ''
        try:
            if a.mask_file:
                url = a.mask_file.url
        except Exception:
            pass
        out.append({
            'id': a.id,
            'category_name': a.label or 'default',
            'segment_role': (a.segment_role or 'foreground').strip().lower() or 'foreground',
            'mask_url': url,
        })
    return JsonResponse({'code': 1, 'annotations': out})


@login_required
@require_http_methods(["DELETE"])
def delete_annotation(request, pk):
    """删除单条标注；若任务下已无标注则任务状态改回 pending。"""
    ann = get_object_or_404(models.Annotation, pk=pk, owner=request.user)
    task = ann.task
    ann.delete()
    if not models.Annotation.objects.filter(task=task).exists():
        task.status = 'pending'
        task.save(update_fields=['status'])
    return JsonResponse({'code': 1, 'msg': 'deleted'})


@login_required
@require_http_methods(["GET"])
def export_project_annotations(request, pk):
    """导出当前用户该项目下全部已保存标注（所选格式）。"""
    project = get_object_or_404(models.Project, pk=pk, owner=request.user)
    fmt = (request.GET.get('format') or 'coco').strip().lower()
    if fmt not in EXPORT_FORMATS:
        return JsonResponse({
            'code': 0,
            'msg': 'invalid format',
            'formats': sorted(EXPORT_FORMATS),
        }, status=400)

    anns = list(
        models.Annotation.objects.filter(task__project=project, owner=request.user)
        .select_related('task', 'task__image')
        .order_by('task_id', 'id')
    )

    if fmt == 'coco':
        doc = build_merged_coco_project(anns)
        body = json.dumps(doc, ensure_ascii=False, indent=2)
        resp = HttpResponse(body, content_type='application/json; charset=utf-8')
        resp['Content-Disposition'] = f'attachment; filename="project_{pk}_coco.json"'
        return resp

    if fmt == 'simple':
        doc = build_project_simple_export_dict(anns)
        body = json.dumps(doc, ensure_ascii=False, indent=2)
        resp = HttpResponse(body, content_type='application/json; charset=utf-8')
        resp['Content-Disposition'] = f'attachment; filename="project_{pk}_simple.json"'
        return resp

    if fmt in ('voc', 'yolo_bbox', 'mask_png'):
        raw = build_project_export_zip_bytes(fmt, anns)
        resp = HttpResponse(raw, content_type='application/zip')
        resp['Content-Disposition'] = f'attachment; filename="project_{pk}_{fmt}.zip"'
        return resp

    return JsonResponse({'code': 0, 'msg': 'unsupported'}, status=400)


@csrf_exempt
def save_processed_image(request):
    if request.method == 'POST' and request.FILES.get('image'):
        image = request.FILES['image']
        rel = f"canvas/{uuid.uuid4().hex}.png"
        saved_path = default_storage.save(rel, ContentFile(image.read()))
        return JsonResponse({
            "code": 1,
            "msg": "保存成功",
            "url": default_storage.url(saved_path),
        })

    return JsonResponse({"code": 0, "msg": "失败"})


_ALLOWED_SEGMENT_ROLES = frozenset({'foreground', 'background', 'other'})


@login_required
def save_annotation(request):
    """
    保存分割掩罩与 COCO 风格 JSON。
    multipart：task_id、mask 或 mask_base64、segment_role（前景/背景/其他，仅元数据）、
    category_name（字符串，本条分割对应的唯一 COCO 类别名）。
    """
    if request.method != 'POST':
        return JsonResponse({'code': 0, 'msg': 'only POST'})

    task_id = request.POST.get('task_id')
    try:
        task = models.Task.objects.select_related('image', 'project').get(
            id=int(task_id), owner=request.user
        )
    except Exception:
        return JsonResponse({'code': 0, 'msg': 'task not found'})

    segment_role = (request.POST.get('segment_role') or '').strip().lower()
    if not segment_role:
        legacy = (request.POST.get('label') or '').strip().lower()
        if legacy in _ALLOWED_SEGMENT_ROLES:
            segment_role = legacy
        else:
            segment_role = 'foreground'
    if segment_role not in _ALLOWED_SEGMENT_ROLES:
        return JsonResponse({'code': 0, 'msg': 'invalid segment_role'})

    category_name = (request.POST.get('category_name') or '').strip()
    if not category_name:
        legacy_label = (request.POST.get('label') or '').strip()
        if legacy_label and legacy_label.lower() not in _ALLOWED_SEGMENT_ROLES:
            category_name = legacy_label
    if not category_name:
        category_name = 'default'
    category_name = category_name[:200]

    mask_bytes = None
    if request.FILES.get('mask'):
        mask_bytes = request.FILES['mask'].read()
    else:
        mask_b64 = request.POST.get('mask_base64', '')
        if mask_b64:
            try:
                _header, data = mask_b64.split(',', 1) if ',' in mask_b64 else ('', mask_b64)
                mask_bytes = base64.b64decode(data)
            except Exception:
                mask_bytes = None

    if not mask_bytes:
        return JsonResponse({'code': 0, 'msg': 'mask or mask_base64 required'})

    image = task.image
    if not image or not image.file:
        return JsonResponse({'code': 0, 'msg': 'task has no image'})

    iw, ih = image.width, image.height
    if not iw or not ih:
        try:
            image.file.seek(0)
            with PILImage.open(image.file) as im:
                iw, ih = im.size
            models.Image.objects.filter(pk=image.pk).update(width=iw, height=ih)
        except Exception:
            return JsonResponse({'code': 0, 'msg': 'cannot read image dimensions'})

    try:
        binary = resize_mask_bytes_to_size(mask_bytes, iw, ih)
    except Exception as exc:
        return JsonResponse({'code': 0, 'msg': f'invalid mask: {exc}'})

    if int(binary.sum()) < 1:
        return JsonResponse({'code': 0, 'msg': 'empty mask — run segmentation before save'})

    ann = models.Annotation(
        task=task,
        owner=request.user,
        user=request.user if request.user.is_authenticated else None,
        label=category_name,
        segment_role=segment_role,
    )
    ann.created_at = timezone.now()
    ann.save()

    fname = f"{uuid.uuid4().hex}.png"
    ann.mask_file.save(fname, ContentFile(mask_bytes), save=True)

    rel_path = ann.mask_file.name
    try:
        file_basename = os.path.basename(image.file.name)
    except Exception:
        file_basename = f'image_{image.id}.png'

    coco_doc = build_coco_document(
        image_id=image.id,
        image_file_name=file_basename,
        image_width=int(iw),
        image_height=int(ih),
        annotation_id=ann.id,
        category_name=category_name,
        segment_role=segment_role,
        binary_mask=binary,
        mask_relative_path=rel_path,
    )
    ann.coco_json = coco_doc
    ann.save(update_fields=['coco_json'])

    proj = task.project
    lc = proj.label_config if isinstance(proj.label_config, dict) else {}
    lc = dict(lc)
    lc['coco_last_category_name'] = category_name
    proj.label_config = lc
    proj.save(update_fields=['label_config'])

    task.status = 'done'
    task.save(update_fields=['status'])

    return JsonResponse({
        'code': 1,
        'msg': 'saved',
        'annotation_id': ann.id,
        'coco': coco_doc,
        'category_name': category_name,
        'segment_role': segment_role,
        'export_formats': sorted(EXPORT_FORMATS),
    })


@login_required
@require_http_methods(["GET"])
def export_annotation(request, pk):
    """已保存标注的多格式下载：?format=coco|simple|voc|yolo_bbox|mask_png"""
    ann = get_object_or_404(models.Annotation, pk=pk, owner=request.user)
    fmt = (request.GET.get('format') or 'coco').strip().lower()
    if fmt not in EXPORT_FORMATS:
        return JsonResponse({
            'code': 0,
            'msg': 'invalid format',
            'formats': sorted(EXPORT_FORMATS),
        }, status=400)

    if fmt == 'mask_png':
        if not ann.mask_file:
            return JsonResponse({'code': 0, 'msg': 'no mask file'}, status=404)
        return FileResponse(
            ann.mask_file.open('rb'),
            as_attachment=True,
            filename=f'annotation_{pk}_mask.png',
            content_type='image/png',
        )

    loaded = load_annotation_binary_mask(ann)
    if loaded is None:
        return JsonResponse({'code': 0, 'msg': 'no mask file'}, status=404)
    binary, iw, ih = loaded
    if int(binary.sum()) < 1:
        return JsonResponse({'code': 0, 'msg': 'empty mask'}, status=400)

    task = ann.task
    image = task.image
    try:
        file_basename = os.path.basename(image.file.name)
    except Exception:
        file_basename = f'image_{image.id}.png'

    if fmt == 'coco':
        rel_path = ann.mask_file.name if ann.mask_file else ''
        doc = build_coco_document(
            image_id=image.id,
            image_file_name=file_basename,
            image_width=iw,
            image_height=ih,
            annotation_id=ann.id,
            category_name=ann.label or 'object',
            segment_role=ann.segment_role or 'foreground',
            binary_mask=binary,
            mask_relative_path=rel_path,
        )
        body = json.dumps(doc, ensure_ascii=False, indent=2)
        resp = HttpResponse(body, content_type='application/json; charset=utf-8')
        resp['Content-Disposition'] = f'attachment; filename="annotation_{pk}_coco.json"'
        return resp

    if fmt == 'simple':
        doc = build_simple_export_dict(ann, binary, iw, ih)
        body = json.dumps(doc, ensure_ascii=False, indent=2)
        resp = HttpResponse(body, content_type='application/json; charset=utf-8')
        resp['Content-Disposition'] = f'attachment; filename="annotation_{pk}_simple.json"'
        return resp

    bbox, _ = binary_mask_bbox_and_area(binary)
    if fmt == 'voc':
        xml = build_voc_xml_string(ann, bbox, iw, ih)
        resp = HttpResponse(xml, content_type='application/xml; charset=utf-8')
        resp['Content-Disposition'] = f'attachment; filename="annotation_{pk}_voc.xml"'
        return resp

    if fmt == 'yolo_bbox':
        txt = build_yolo_bbox_line(ann, bbox, iw, ih)
        resp = HttpResponse(txt, content_type='text/plain; charset=utf-8')
        resp['Content-Disposition'] = f'attachment; filename="annotation_{pk}_yolo.txt"'
        return resp

    return JsonResponse({'code': 0, 'msg': 'unsupported'}, status=400)


def next_task(request):
    """单人使用：返回当前用户下第一个未完成任务（不改变指派与状态）。"""
    user = request.user if request.user.is_authenticated else None
    if not user:
        return JsonResponse({'code': 0, 'msg': 'not authenticated'})

    task = (
        models.Task.objects.filter(owner=user)
        .exclude(status='done')
        .select_related('image', 'project')
        .order_by('id')
        .first()
    )
    if not task:
        return JsonResponse({'code': 0, 'msg': 'no tasks'})

    image_url = task.image.file.url if task.image and hasattr(task.image, 'file') else ''
    return JsonResponse({
        'code': 1,
        'task': task.id,
        'image_url': image_url,
        'project': task.project.id if task.project else None,
    })


def segment_image(request):
    if request.method == 'POST' and request.FILES.get('image'):
        uploaded_file = request.FILES['image']
        # Accept optional prompt data: points (JSON [[x,y],…])、point_labels（JSON [1|0,…] 与 points 等长，1=前景点 0=背景点）、box [x0,y0,x1,y1]
        points_raw = request.POST.get('points', '')
        labels_raw = request.POST.get('point_labels', '')
        box_raw = request.POST.get('box', '')
        points = None
        point_labels = None
        box = None
        try:
            if points_raw:
                import json
                pts = json.loads(points_raw)
                # Expect list of [x,y]
                points = [(float(p[0]), float(p[1])) for p in pts]
        except Exception:
            points = None
        try:
            if labels_raw and points:
                import json
                labs = json.loads(labels_raw)
                if isinstance(labs, list) and len(labs) == len(points):
                    point_labels = [int(x) for x in labs]
        except Exception:
            point_labels = None
        try:
            if box_raw:
                import json
                bx = json.loads(box_raw)
                # Expect [x0,y0,x1,y1]
                if len(bx) == 4:
                    box = [float(b) for b in bx]
        except Exception:
            box = None

        model_key = (request.POST.get('model') or 'sam').strip().lower()
        if model_key not in ('sam', 'yolo'):
            model_key = 'sam'
        from io import BytesIO
        img_bytes = uploaded_file.read()

        if model_key == 'yolo':
            if callable(run_yolo_segmentation_on_bytes):
                output_bytes = run_yolo_segmentation_on_bytes(
                    img_bytes, points=points, point_labels=point_labels, box=box
                )
                return HttpResponse(output_bytes, content_type='image/png')
            return HttpResponse(b'', status=400)

        if callable(run_segmentation_on_bytes):
            output_bytes = run_segmentation_on_bytes(
                img_bytes, points=points, point_labels=point_labels, box=box, model='sam'
            )
            return HttpResponse(output_bytes, content_type='image/png')

        img = PILImage.open(uploaded_file)
        draw = ImageDraw.Draw(img)
        draw.rectangle([10, 10, img.width-10, img.height-10], outline="red", width=5)
        output = BytesIO()
        img.save(output, format='PNG')
        output.seek(0)
        return HttpResponse(output.getvalue(), content_type='image/png')
    return HttpResponse('Error', status=400)


@require_http_methods(['GET'])
def nav_search_api(request):
    """
    顶栏「快速跳转」：按关键词匹配当前用户拥有的项目、数据集名称（供搜索框异步展示）。
    未登录返回空列表；q 为空时不查库，仅由前端展示固定快捷入口。
    """
    if not request.user.is_authenticated:
        return JsonResponse({'projects': [], 'datasets': []})
    q = (request.GET.get('q') or '').strip()[:80]
    if len(q) < 1:
        return JsonResponse({'projects': [], 'datasets': []})
    limit = 12
    user = request.user
    projects = [
        {
            'id': p.id,
            'name': p.name,
            'url': reverse('projects'),
        }
        for p in models.Project.objects.filter(owner=user, name__icontains=q).order_by('name')[:limit]
    ]
    datasets = [
        {
            'id': d.id,
            'name': d.name,
            'url': reverse('dataset_detail', kwargs={'pk': d.id}),
        }
        for d in models.Dataset.objects.filter(owner=user, name__icontains=q).order_by('name')[:limit]
    ]
    return JsonResponse({'projects': projects, 'datasets': datasets})
