"""
apps.pages.views
----------------
主站页面视图：仪表盘、项目/数据集/任务、标注、个人信息、用户管理（admin）、
登录重定向、API（segment-image、annotations 等）。
"""
from django.shortcuts import render, get_object_or_404, redirect
from django.http import Http404, JsonResponse, HttpResponse
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
from django.utils import timezone
from django.utils.translation import gettext as _
from django.contrib.auth.views import LoginView
from django.db.models import Count, Prefetch
from django.urls import reverse

# SAM 分割推理（可选）：apps/pages/sam_inference.run_segmentation_on_bytes
try:
    from .sam_inference import run_segmentation_on_bytes
except Exception:
    run_segmentation_on_bytes = None


def _is_manage_admin(user):
    """仅用户名 admin 可进入用户管理系统"""
    return user.is_authenticated and user.username == 'admin'


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
    # Dashboard as the home page for data management
    context = {'segment': 'dashboard'}
    try:
        projects_count = models.Project.objects.filter(owner=request.user).count()
        datasets_count = models.Dataset.objects.filter(owner=request.user).count()
        tasks_count = models.Task.objects.filter(owner=request.user).count()
        pending_tasks = models.Task.objects.filter(owner=request.user, status='new').count()
        completed_tasks = models.Task.objects.filter(owner=request.user, status='done').count()
        recent_tasks = (
            models.Task.objects.filter(owner=request.user)
            .select_related('project', 'image')
            .order_by('-created_at')[:8]
        )
    except Exception:
        projects_count = datasets_count = tasks_count = pending_tasks = completed_tasks = 0
        recent_tasks = []
    context.update({
        'projects_count': projects_count,
        'datasets_count': datasets_count,
        'tasks_count': tasks_count,
        'pending_tasks': pending_tasks,
        'completed_tasks': completed_tasks,
        'recent_tasks': recent_tasks,
    })
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


def image_processing(request):
    """原图像处理页已归档，模板已移除，重定向到首页。"""
    return redirect('index')


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


def _dataset_detail_react_props(ds, preview_images, image_preview_limit):
    imgs = [
        {
            'id': im.id,
            'url': im.file.url,
            'short': im.file.name,
            'caption': im.caption or '',
        }
        for im in preview_images
    ]
    return json.dumps(
        {
            'image_preview_limit': image_preview_limit,
            'urls': {
                'datasets': reverse('datasets'),
                'datasets_list': reverse('datasets'),
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
    _PREVIEW_IMAGES = 120
    ds.preview_images = list(
        models.Image.objects.filter(dataset_id=pk).order_by('-uploaded_at')[:_PREVIEW_IMAGES]
    )
    context['dataset'] = ds
    context['dataset_image_preview_limit'] = _PREVIEW_IMAGES
    context['dataset_detail_props_json'] = _dataset_detail_react_props(ds, ds.preview_images, _PREVIEW_IMAGES)
    return render(request, 'pages/dataset_detail.html', context)


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
                    t = models.Task.objects.create(owner=request.user, project=project, image=img)
                    created.append(t)
            context['created_tasks'] = created
            messages.success(request, f'Created {len(created)} task(s).')

    context['projects'] = models.Project.objects.filter(owner=request.user).prefetch_related('linked_datasets')[:200]
    context['datasets'] = (
        models.Dataset.objects.filter(owner=request.user).prefetch_related(
            Prefetch('projects', queryset=models.Project.objects.order_by('name'))
        )[:200]
    )
    context['tasks'] = models.Task.objects.filter(owner=request.user).select_related('image', 'project').order_by('-created_at')[:500]
    context['datasets_for_project'] = models.Dataset.objects.filter(owner=request.user).order_by('name')[:500]
    context['annotation_type_choice_list'] = [
        {'value': k, 'label': str(v)} for k, v in models.Project.ANNOTATION_TYPE_CHOICES
    ]
    return render(request, 'pages/tasks.html', context)


@login_required
def annotation(request):
    """Annotation workspace page. This is a skeleton UI that will call into
    the existing `segment_image` endpoint for SAM or the fallback.
    """
    context = {'segment': 'annotation'}
    # Pass simple lists for project/task selection
    context['projects'] = models.Project.objects.filter(owner=request.user)[:200]
    return render(request, 'pages/annotation.html', context)


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


def save_annotation(request):
    """Save annotation for a task. Accepts multipart/form-data with task_id and mask file or mask_base64."""
    if request.method != 'POST':
        return JsonResponse({'code': 0, 'msg': 'only POST'})

    task_id = request.POST.get('task_id')
    label = request.POST.get('label', '')
    task = None
    try:
        task = models.Task.objects.get(id=int(task_id), owner=request.user)
    except Exception:
        return JsonResponse({'code': 0, 'msg': 'task not found'})

    ann = models.Annotation(
        task=task,
        owner=request.user,
        user=request.user if request.user.is_authenticated else None,
        label=label,
    )
    ann.created_at = timezone.now()
    ann.save()
    # mask 经 FileField 写入 MEDIA_ROOT（upload_to=annotations/...）
    if request.FILES.get('mask'):
        mask = request.FILES['mask']
        fname = f"{uuid.uuid4().hex}.png"
        ann.mask_file.save(fname, mask, save=True)
    else:
        mask_b64 = request.POST.get('mask_base64', '')
        if mask_b64:
            try:
                _header, data = mask_b64.split(',', 1) if ',' in mask_b64 else ('', mask_b64)
                b = base64.b64decode(data)
                fname = f"{uuid.uuid4().hex}.png"
                ann.mask_file.save(fname, ContentFile(b), save=True)
            except Exception:
                pass
    # mark task as done
    task.status = 'done'
    task.save()

    return JsonResponse({'code': 1, 'msg': 'saved', 'annotation_id': ann.id})


def next_task(request):
    """Return the next available task for the current user (simple FIFO). Assign it to the user."""
    user = request.user if request.user.is_authenticated else None
    if not user:
        return JsonResponse({'code': 0, 'msg': 'not authenticated'})

    # Strict owner isolation: only pick tasks owned by current user
    task = models.Task.objects.filter(owner=user, status='new').exclude(assigned_to__isnull=False).first()
    if not task:
        task = models.Task.objects.filter(owner=user, assigned_to__isnull=True).first()
    if not task:
        return JsonResponse({'code': 0, 'msg': 'no tasks'})

    if user:
        task.assigned_to = user
        task.status = 'assigned'
        task.save()

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
        # Accept optional prompt data: points (JSON array of [x,y]) and box (x0,y0,x1,y1)
        points_raw = request.POST.get('points', '')
        box_raw = request.POST.get('box', '')
        points = None
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
            if box_raw:
                import json
                bx = json.loads(box_raw)
                # Expect [x0,y0,x1,y1]
                if len(bx) == 4:
                    box = [float(b) for b in bx]
        except Exception:
            box = None

        # If SAM helper is available, use it; otherwise fallback to red border
        from io import BytesIO
        if callable(run_segmentation_on_bytes):
            img_bytes = uploaded_file.read()
            output_bytes = run_segmentation_on_bytes(img_bytes, points=points, box=box)
            return HttpResponse(output_bytes, content_type='image/png')

        img = PILImage.open(uploaded_file)
        draw = ImageDraw.Draw(img)
        draw.rectangle([10, 10, img.width-10, img.height-10], outline="red", width=5)
        output = BytesIO()
        img.save(output, format='PNG')
        output.seek(0)
        return HttpResponse(output.getvalue(), content_type='image/png')
    return HttpResponse('Error', status=400)
