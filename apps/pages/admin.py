"""
apps.pages.admin
----------------
Django 后台管理配置：User（含 UserProfile）、Project、Dataset、Image、Task、Annotation。
- 超级用户可查看全部数据，普通用户仅能查看自己拥有的记录（owner 过滤）。
- 表单增删查改：fieldsets、save_model 自动设置 owner、formfield_for_foreignkey 限制可选范围。
- 列表页每行末尾显示「修改」「删除」按钮，操作更直观。
- 模型名称支持中英文切换（locale/zh_Hans、locale/en）。
"""
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils.html import format_html
from unfold.admin import ModelAdmin
from unfold.forms import AdminPasswordChangeForm, UserChangeForm, UserCreationForm
from . import models

User = get_user_model()


def _admin_actions(obj, request):
    """生成列表页每行的修改/删除按钮，权限不足时自动隐藏。"""
    opts = obj._meta
    info = (opts.app_label, opts.model_name)
    links = []
    if request.user.has_perm(f'{opts.app_label}.change_{opts.model_name}'):
        url = reverse(f'admin:{info[0]}_{info[1]}_change', args=[obj.pk])
        links.append(format_html('<a href="{}" class="button">修改</a>', url))
    if request.user.has_perm(f'{opts.app_label}.delete_{opts.model_name}'):
        url = reverse(f'admin:{info[0]}_{info[1]}_delete', args=[obj.pk])
        links.append(format_html('<a href="{}" class="deletelink">删除</a>', url))
    return format_html(' &nbsp; '.join(links)) if links else '-'


class AddLinkMixin:
    """详情页顶部增加「添加 XXX」链接，便于从详情页直接进入添加表单"""
    change_form_template = 'admin/change_form_with_add.html'

    def change_view(self, request, object_id, form_url='', extra_context=None):
        extra_context = extra_context or {}
        opts = self.model._meta
        if request.user.has_perm(f'{opts.app_label}.add_{opts.model_name}'):
            info = (opts.app_label, opts.model_name)
            extra_context['laps_admin_add_url'] = reverse(f'admin:{info[0]}_{info[1]}_add')
            extra_context['laps_admin_add_label'] = f'添加 {opts.verbose_name}'
        return super().change_view(request, object_id, form_url, extra_context)


# ---------------------------------------------------------------------------
# Inline
# ---------------------------------------------------------------------------
class UserProfileInline(admin.StackedInline):
    """用户详情页内嵌：头像等扩展信息"""
    model = models.UserProfile
    can_delete = True
    verbose_name = "扩展信息"
    verbose_name_plural = "扩展信息"
    fk_name = 'user'


class TaskInline(admin.TabularInline):
    """项目详情页内嵌任务列表，支持快速增删改；extra=1 显示空行与「添加」按钮"""
    model = models.Task
    extra = 1
    show_change_link = True
    fields = ('image', 'owner', 'assigned_to', 'status')
    autocomplete_fields = ('image', 'owner', 'assigned_to')

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if not getattr(request, 'user', None) or not request.user.is_superuser:
            if db_field.name == 'image':
                kwargs['queryset'] = models.Image.objects.filter(dataset__owner=request.user).select_related('dataset')
            elif db_field.name == 'owner':
                kwargs['queryset'] = db_field.related_model.objects.filter(pk=request.user.pk)
        return super().formfield_for_foreignkey(db_field, request, **kwargs)


class ImageInline(admin.TabularInline):
    """数据集详情页内嵌图片列表，支持快速增删改；extra=1 显示空行与「添加」按钮"""
    model = models.Image
    extra = 1
    show_change_link = True
    fields = ('file', 'caption', 'width', 'height')

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if request.user.is_superuser:
            return qs
        return qs.filter(dataset__owner=request.user)


class AnnotationInline(admin.TabularInline):
    """任务详情页内嵌标注列表，支持快速增删改；extra=1 显示空行与「添加」按钮"""
    model = models.Annotation
    extra = 1
    show_change_link = True
    fields = ('owner', 'user', 'label', 'created_at')
    readonly_fields = ('created_at',)
    can_delete = True


# ---------------------------------------------------------------------------
# Project
# ---------------------------------------------------------------------------
@admin.register(models.Project)
class ProjectAdmin(AddLinkMixin, ModelAdmin):
    """项目：列表展示、搜索、筛选；创建时自动设置 owner；每行有修改/删除按钮"""
    list_display = ('id', 'name', 'annotation_type', 'owner', 'created_at', '_actions')
    list_display_links = ('id', 'name')
    filter_horizontal = ('linked_datasets',)

    def _actions(self, obj):
        return _admin_actions(obj, self.request)
    _actions.short_description = '操作'
    search_fields = ('name', 'owner__username', 'owner__email')
    list_filter = ('created_at', 'annotation_type')
    date_hierarchy = 'created_at'
    readonly_fields = ('created_at',)

    inlines = (TaskInline,)
    fieldsets = (
        (None, {
            'fields': ('name', 'description', 'owner', 'annotation_type', 'linked_datasets'),
        }),
        ('标签配置', {
            'fields': ('label_config',),
            'classes': ('collapse',),
        }),
        ('时间', {
            'fields': ('created_at',),
        }),
    )

    def get_queryset(self, request):
        self.request = request
        qs = super().get_queryset(request)
        if request.user.is_superuser:
            return qs
        return qs.filter(owner=request.user)

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        """普通用户创建项目时，owner 仅能选自己"""
        if db_field.name == 'owner' and not request.user.is_superuser:
            kwargs['queryset'] = kwargs.get('queryset') or db_field.related_model.objects.filter(pk=request.user.pk)
        return super().formfield_for_foreignkey(db_field, request, **kwargs)

    def formfield_for_manytomany(self, db_field, request, **kwargs):
        if db_field.name == 'linked_datasets' and not request.user.is_superuser:
            kwargs['queryset'] = models.Dataset.objects.filter(owner=request.user).order_by('name')
        return super().formfield_for_manytomany(db_field, request, **kwargs)

    def save_model(self, request, obj, form, change):
        """新建时若未选 owner，自动设为当前用户"""
        if not change and not obj.owner_id:
            obj.owner = request.user
        super().save_model(request, obj, form, change)


# ---------------------------------------------------------------------------
# Dataset
# ---------------------------------------------------------------------------
@admin.register(models.Dataset)
class DatasetAdmin(AddLinkMixin, ModelAdmin):
    """数据集：列表展示、搜索、筛选；创建时自动设置 owner；内嵌图片管理；每行有修改/删除按钮"""
    list_display = ('id', 'name', 'owner', 'created_at', '_actions')
    list_display_links = ('id', 'name')

    def _actions(self, obj):
        return _admin_actions(obj, self.request)
    _actions.short_description = '操作'

    search_fields = ('name', 'owner__username', 'owner__email')
    list_filter = ('created_at',)
    date_hierarchy = 'created_at'
    readonly_fields = ('created_at',)
    inlines = (ImageInline,)

    fieldsets = (
        (None, {
            'fields': ('name', 'description', 'owner'),
        }),
        ('时间', {
            'fields': ('created_at',),
        }),
    )

    def get_queryset(self, request):
        self.request = request
        qs = super().get_queryset(request)
        if request.user.is_superuser:
            return qs
        return qs.filter(owner=request.user)

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if db_field.name == 'owner' and not request.user.is_superuser:
            kwargs['queryset'] = kwargs.get('queryset') or db_field.related_model.objects.filter(pk=request.user.pk)
        return super().formfield_for_foreignkey(db_field, request, **kwargs)

    def save_model(self, request, obj, form, change):
        if not change and not obj.owner_id:
            obj.owner = request.user
        super().save_model(request, obj, form, change)


# ---------------------------------------------------------------------------
# Image
# ---------------------------------------------------------------------------
@admin.register(models.Image)
class ImageAdmin(AddLinkMixin, ModelAdmin):
    """图片：列表展示、搜索、筛选；dataset 下拉仅显示当前用户的数据集；每行有修改/删除按钮"""
    list_display = ('id', 'file', 'dataset', 'uploaded_at', '_actions')
    list_display_links = ('id', 'file')

    def _actions(self, obj):
        return _admin_actions(obj, self.request)
    _actions.short_description = '操作'
    search_fields = ('file', 'dataset__name', 'dataset__owner__username', 'dataset__owner__email')
    list_filter = ('uploaded_at', 'dataset')
    date_hierarchy = 'uploaded_at'
    readonly_fields = ('uploaded_at',)
    autocomplete_fields = ('dataset',)

    fieldsets = (
        (None, {
            'fields': ('dataset', 'file', 'caption'),
        }),
        ('尺寸（可选）', {
            'fields': ('width', 'height'),
            'classes': ('collapse',),
        }),
        ('时间', {
            'fields': ('uploaded_at',),
        }),
    )

    def get_queryset(self, request):
        self.request = request
        qs = super().get_queryset(request).select_related('dataset')
        if request.user.is_superuser:
            return qs
        return qs.filter(dataset__owner=request.user)

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if db_field.name == 'dataset' and not request.user.is_superuser:
            kwargs['queryset'] = models.Dataset.objects.filter(owner=request.user)
        return super().formfield_for_foreignkey(db_field, request, **kwargs)


# ---------------------------------------------------------------------------
# Task
# ---------------------------------------------------------------------------
@admin.register(models.Task)
class TaskAdmin(AddLinkMixin, ModelAdmin):
    """任务：列表展示、搜索、筛选；project/image 下拉仅显示当前用户可访问的；内嵌标注列表；每行有修改/删除按钮"""
    list_display = ('id', 'project', 'image', 'owner', 'assigned_to', 'status', 'created_at', '_actions')
    list_display_links = ('id', 'project')

    def _actions(self, obj):
        return _admin_actions(obj, self.request)
    _actions.short_description = '操作'
    list_filter = ('status', 'created_at', 'project')
    search_fields = ('project__name', 'image__file', 'owner__username', 'assigned_to__username')
    date_hierarchy = 'created_at'
    readonly_fields = ('created_at',)
    autocomplete_fields = ('project', 'image', 'owner', 'assigned_to')
    inlines = (AnnotationInline,)

    fieldsets = (
        (None, {
            'fields': ('project', 'image', 'owner', 'assigned_to', 'status'),
        }),
        ('时间', {
            'fields': ('created_at',),
        }),
    )

    list_per_page = 25
    actions = ('mark_as_done', 'mark_as_new')

    def get_queryset(self, request):
        self.request = request
        qs = super().get_queryset(request).select_related('project', 'image', 'owner', 'assigned_to')
        if request.user.is_superuser:
            return qs
        return qs.filter(owner=request.user)

    @admin.action(description='标记为已完成')
    def mark_as_done(self, request, queryset):
        queryset.update(status='done')

    @admin.action(description='标记为新任务')
    def mark_as_new(self, request, queryset):
        queryset.update(status='new')

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if not request.user.is_superuser:
            if db_field.name == 'project':
                kwargs['queryset'] = models.Project.objects.filter(owner=request.user)
            elif db_field.name == 'image':
                kwargs['queryset'] = models.Image.objects.filter(dataset__owner=request.user).select_related('dataset')
            elif db_field.name == 'owner':
                kwargs['queryset'] = db_field.related_model.objects.filter(pk=request.user.pk)
        return super().formfield_for_foreignkey(db_field, request, **kwargs)

    def save_model(self, request, obj, form, change):
        if not change and not obj.owner_id:
            obj.owner = request.user
        super().save_model(request, obj, form, change)


# ---------------------------------------------------------------------------
# Annotation
# ---------------------------------------------------------------------------
@admin.register(models.Annotation)
class AnnotationAdmin(AddLinkMixin, ModelAdmin):
    """标注：列表展示、搜索、筛选；task 下拉仅显示当前用户可访问的任务；每行有修改/删除按钮"""
    list_display = ('id', 'task', 'owner', 'user', 'label', 'created_at', '_actions')
    list_display_links = ('id', 'task')

    def _actions(self, obj):
        return _admin_actions(obj, self.request)
    _actions.short_description = '操作'
    list_filter = ('created_at',)
    search_fields = ('task__id', 'owner__username', 'user__username', 'label')
    date_hierarchy = 'created_at'
    readonly_fields = ('created_at',)
    autocomplete_fields = ('task', 'owner', 'user')

    fieldsets = (
        (None, {
            'fields': ('task', 'owner', 'user', 'label'),
        }),
        ('遮罩数据', {
            'fields': ('mask_file', 'mask_rle'),
            'classes': ('collapse',),
        }),
        ('时间', {
            'fields': ('created_at',),
        }),
    )

    def get_queryset(self, request):
        self.request = request
        qs = super().get_queryset(request).select_related('task', 'owner', 'user')
        if request.user.is_superuser:
            return qs
        return qs.filter(owner=request.user)

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if not request.user.is_superuser:
            if db_field.name == 'task':
                kwargs['queryset'] = models.Task.objects.filter(owner=request.user).select_related('project', 'image')
            elif db_field.name in ('owner', 'user'):
                kwargs['queryset'] = db_field.related_model.objects.all()  # 标注时可选任意用户
        return super().formfield_for_foreignkey(db_field, request, **kwargs)

    def save_model(self, request, obj, form, change):
        if not change and not obj.owner_id:
            obj.owner = request.user
        if not change and not obj.user_id:
            obj.user = request.user
        super().save_model(request, obj, form, change)


# ---------------------------------------------------------------------------
# User（覆盖默认，增加 UserProfile 内嵌与操作按钮）
# ---------------------------------------------------------------------------
admin.site.unregister(User)


@admin.register(User)
class CustomUserAdmin(AddLinkMixin, BaseUserAdmin, ModelAdmin):
    """用户管理：可编辑用户名、邮箱、密码等；内嵌 UserProfile（头像）"""
    form = UserChangeForm
    add_form = UserCreationForm
    change_password_form = AdminPasswordChangeForm

    list_display = ('username', 'email', 'first_name', 'is_staff', 'date_joined', '_actions')
    list_display_links = ('username',)

    def get_queryset(self, request):
        self.request = request
        return super().get_queryset(request)

    def _actions(self, obj):
        return _admin_actions(obj, self.request)
    _actions.short_description = '操作'

    inlines = (UserProfileInline,)

    # 保持 BaseUserAdmin 的 fieldsets，仅增加 inline
    fieldsets = BaseUserAdmin.fieldsets


# Product 模型未注册到 admin，仅供 DYNAMIC_API 使用
