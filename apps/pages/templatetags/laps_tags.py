"""
模板标签：用户头像、Vite 构建产物（带 hash 的 JS/CSS，避免缓存导致前端不更新）。
"""
import json
from pathlib import Path

from django import template
from django.conf import settings
from django.templatetags.static import static
from django.utils.safestring import mark_safe

from apps.pages.models import UserProfile

register = template.Library()

_MANIFEST_PATH = Path(settings.BASE_DIR) / 'static' / 'frontend' / 'manifest.json'


def _vite_entry_from_manifest(data):
    """找到 isEntry: true 的入口（通常为 src/main.jsx）。"""
    for key, val in data.items():
        if isinstance(val, dict) and val.get('isEntry') and val.get('file'):
            return val
    return None


def _vite_static_urls():
    """
    返回 (entry_css_urls, entry_js_url)，均为 {% static %} 可用的相对路径。
    无 manifest 时 js 为 frontend/assets/main.js，css 为空列表。
    """
    fallback_js = 'frontend/assets/main.js'
    if not _MANIFEST_PATH.is_file():
        return [], static(fallback_js)

    try:
        data = json.loads(_MANIFEST_PATH.read_text(encoding='utf-8'))
    except (json.JSONDecodeError, OSError):
        return [], static(fallback_js)

    entry = _vite_entry_from_manifest(data)
    if not entry:
        return [], static(fallback_js)

    css_urls = []
    for css in entry.get('css') or []:
        css_path = css.lstrip('/')
        if not css_path.startswith('frontend/'):
            css_path = f'frontend/{css_path}'
        css_urls.append(static(css_path))

    js_path = entry['file'].lstrip('/')
    if not js_path.startswith('frontend/'):
        js_path = f'frontend/{js_path}'
    return css_urls, static(js_path)


def _vite_preload_html():
    css_urls, js_url = _vite_static_urls()
    # 入口为 ES module；与 script type="module" 一致，便于预加载与执行行为对齐
    parts = [f'<link rel="modulepreload" href="{js_url}" crossorigin>']
    for href in css_urls:
        parts.append(f'<link rel="preload" href="{href}" as="style">')
    return '\n'.join(parts)


def _vite_entry_styles_html():
    css_urls, _ = _vite_static_urls()
    return '\n'.join(f'<link rel="stylesheet" href="{href}">' for href in css_urls)


def _vite_react_head_html():
    return _vite_preload_html() + '\n' + _vite_entry_styles_html()


def _vite_react_script_html():
    _, js_url = _vite_static_urls()
    # Vite 默认产出含 top-level import/export；非 module 会解析失败，动态 import 也无法按入口 URL 解析 chunk
    return f'<script type="module" src="{js_url}" crossorigin></script>'


@register.simple_tag
def vite_react_preload():
    """尽量靠 <head> 前部：预下载 Vite JS/CSS，与解析并行。"""
    return mark_safe(_vite_preload_html())


@register.simple_tag
def vite_react_styles():
    """放在主样式链之后：React 入口 CSS。"""
    return mark_safe(_vite_entry_styles_html())


@register.simple_tag
def vite_react_head():
    """等同于 preload + styles（仅当无法拆分位置时使用）。"""
    return mark_safe(_vite_react_head_html())


@register.simple_tag
def vite_react_script():
    """置于 body 末尾：<script type=\"module\">（Vite 产物为 ES module）。"""
    return mark_safe(_vite_react_script_html())


@register.simple_tag
def vite_react_assets():
    """兼容旧模板：head 块 + defer 脚本。"""
    return mark_safe(_vite_react_head_html() + '\n' + _vite_react_script_html())

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
