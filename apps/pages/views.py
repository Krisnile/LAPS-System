from django.shortcuts import render, get_object_or_404
from django.http import JsonResponse, HttpResponse
from django.core.files.storage import FileSystemStorage
from django.views.decorators.csrf import csrf_exempt
from PIL import Image as PILImage, ImageDraw
from django.conf import settings
import os
import uuid
import base64
from . import models
from django.utils import timezone

# Try to use SAM inference helper in apps/pages/sam_inference.py
try:
    from .sam_inference import run_segmentation_on_bytes
except Exception:
    run_segmentation_on_bytes = None


def index(request):
    # Dashboard as the home page for data management
    context = {'segment': 'dashboard'}
    # Simple metrics for dashboard (counts)
    try:
        projects_count = models.Project.objects.count()
        datasets_count = models.Dataset.objects.count()
        tasks_count = models.Task.objects.count()
        pending_tasks = models.Task.objects.filter(status='new').count()
    except Exception:
        projects_count = datasets_count = tasks_count = pending_tasks = 0
    context.update({
        'projects_count': projects_count,
        'datasets_count': datasets_count,
        'tasks_count': tasks_count,
        'pending_tasks': pending_tasks,
    })
    return render(request, 'pages/dashboard.html', context)


def image_processing(request):
    context = {'segment': 'image_processing'}

    if request.method == 'POST' and request.FILES.get('image'):
        uploaded_file = request.FILES['image']
        fs = FileSystemStorage()

        filename = fs.save(uploaded_file.name, uploaded_file)
        context['uploaded_image'] = fs.url(filename)

        # PIL 灰度处理
        image_path = fs.path(filename)
        img = Image.open(image_path).convert('L')

        processed_filename = f"processed_{filename}"
        processed_path = os.path.join(fs.location, processed_filename)
        img.save(processed_path)

        context['processed_image'] = fs.url(processed_filename)

    return render(request, 'pages/image_processing.html', context)


def projects(request):
    """Projects management listing."""
    context = {'segment': 'projects'}
    if request.method == 'POST':
        name = request.POST.get('name') or 'Untitled'
        description = request.POST.get('description', '')
        owner = request.user if request.user.is_authenticated else None
        proj = models.Project.objects.create(name=name, description=description, owner=owner)
        context['created'] = proj
    context['projects'] = models.Project.objects.all().order_by('-created_at')[:200]
    return render(request, 'pages/projects.html', context)


def datasets(request):
    """Datasets listing and upload."""
    context = {'segment': 'datasets'}
    if request.method == 'POST':
        name = request.POST.get('name') or f"dataset_{uuid.uuid4().hex[:6]}"
        description = request.POST.get('description', '')
        owner = request.user if request.user.is_authenticated else None
        ds = models.Dataset.objects.create(name=name, description=description, owner=owner)
        files = request.FILES.getlist('files')
        fs = FileSystemStorage()
        created = []
        for f in files:
            filename = fs.save(f.name, f)
            # Create Image record
            img_path = fs.path(filename)
            try:
                pil = PILImage.open(img_path)
                width, height = pil.size
            except Exception:
                width = None
                height = None
            img = models.Image.objects.create(dataset=ds, file=filename, width=width, height=height)
            created.append(img)
        context['created_images'] = created

    context['datasets'] = models.Dataset.objects.all().order_by('-created_at')[:200]
    return render(request, 'pages/datasets.html', context)


def tasks(request):
    """Tasks list and assignment page."""
    context = {'segment': 'tasks'}
    # Support creating tasks from dataset -> project
    if request.method == 'POST':
        project_id = request.POST.get('project')
        dataset_id = request.POST.get('dataset')
        project = get_object_or_404(models.Project, id=project_id)
        dataset = get_object_or_404(models.Dataset, id=dataset_id)
        created = []
        for img in dataset.images.all():
            # avoid duplicate task for same project+image
            if not models.Task.objects.filter(project=project, image=img).exists():
                t = models.Task.objects.create(project=project, image=img)
                created.append(t)
        context['created_tasks'] = created

    context['projects'] = models.Project.objects.all()[:200]
    context['datasets'] = models.Dataset.objects.all()[:200]
    context['tasks'] = models.Task.objects.select_related('image', 'project').order_by('-created_at')[:500]
    return render(request, 'pages/tasks.html', context)


def annotation(request):
    """Annotation workspace page. This is a skeleton UI that will call into
    the existing `segment_image` endpoint for SAM or the fallback.
    """
    context = {'segment': 'annotation'}
    # Pass simple lists for project/task selection
    context['projects'] = models.Project.objects.all()[:200]
    return render(request, 'pages/annotation.html', context)


def examples_index(request):
    """List archived/example templates available for preview.

    This reads files from templates/archived_templates and builds a safe
    whitelist of names that can be rendered via `examples_view`.
    """
    archived_dir = os.path.join(settings.BASE_DIR, 'templates', 'archived_templates')
    files = []
    try:
        for f in sorted(os.listdir(archived_dir)):
            if f.endswith('.html'):
                name = os.path.splitext(f)[0]
                files.append({'name': name, 'filename': f})
    except Exception:
        files = []

    context = {'segment': 'examples', 'examples': files}
    return render(request, 'pages/examples.html', context)


def examples_view(request, name):
    """Render a specific archived template by name.

    Only templates present in templates/archived_templates are allowed.
    """
    archived_dir = os.path.join(settings.BASE_DIR, 'templates', 'archived_templates')
    safe_name = os.path.basename(name)  # prevent path traversal
    template_file = f'archived_templates/{safe_name}.html'

    # verify exists on disk
    if not os.path.exists(os.path.join(archived_dir, f'{safe_name}.html')):
        return HttpResponse('示例页面未找到', status=404)

    context = {'segment': 'examples', 'example_name': safe_name}
    return render(request, template_file, context)


@csrf_exempt
def save_processed_image(request):
    if request.method == 'POST' and request.FILES.get('image'):
        image = request.FILES['image']
        fs = FileSystemStorage()

        filename = f"canvas_{uuid.uuid4().hex}.png"
        fs.save(filename, image)

        return JsonResponse({
            "code": 1,
            "msg": "保存成功",
            "url": fs.url(filename)
        })

    return JsonResponse({"code": 0, "msg": "失败"})


@csrf_exempt
def save_annotation(request):
    """Save annotation for a task. Accepts multipart/form-data with task_id and mask file or mask_base64."""
    if request.method != 'POST':
        return JsonResponse({'code': 0, 'msg': 'only POST'})

    task_id = request.POST.get('task_id')
    label = request.POST.get('label', '')
    task = None
    try:
        task = models.Task.objects.get(id=int(task_id))
    except Exception:
        return JsonResponse({'code': 0, 'msg': 'task not found'})

    ann = models.Annotation(task=task, user=request.user if request.user.is_authenticated else None, label=label)
    # handle file
    if request.FILES.get('mask'):
        mask = request.FILES['mask']
        fname = f"annotation_{uuid.uuid4().hex}.png"
        fs = FileSystemStorage()
        saved = fs.save(fname, mask)
        ann.mask_file = saved
    else:
        mask_b64 = request.POST.get('mask_base64', '')
        if mask_b64:
            try:
                header, data = mask_b64.split(',', 1) if ',' in mask_b64 else ('', mask_b64)
                b = base64.b64decode(data)
                fs = FileSystemStorage()
                fname = f"annotation_{uuid.uuid4().hex}.png"
                path = fs.path(fname)
                with open(path, 'wb') as f:
                    f.write(b)
                ann.mask_file = fname
            except Exception:
                pass

    ann.created_at = timezone.now()
    ann.save()
    # mark task as done
    task.status = 'done'
    task.save()

    return JsonResponse({'code': 1, 'msg': 'saved', 'annotation_id': ann.id})


def next_task(request):
    """Return the next available task for the current user (simple FIFO). Assign it to the user."""
    user = request.user if request.user.is_authenticated else None
    # Prefer tasks that are new and unassigned
    task = models.Task.objects.filter(status='new').exclude(assigned_to__isnull=False).first()
    if not task:
        # fallback: any unassigned
        task = models.Task.objects.filter(assigned_to__isnull=True).first()
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


@csrf_exempt
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

        img = Image.open(uploaded_file)
        draw = ImageDraw.Draw(img)
        draw.rectangle([10, 10, img.width-10, img.height-10], outline="red", width=5)
        output = BytesIO()
        img.save(output, format='PNG')
        output.seek(0)
        return HttpResponse(output.getvalue(), content_type='image/png')
    return HttpResponse('Error', status=400)
