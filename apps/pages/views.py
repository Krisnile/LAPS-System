from django.shortcuts import render
from django.http import JsonResponse, HttpResponse
from django.core.files.storage import FileSystemStorage
from django.views.decorators.csrf import csrf_exempt
from PIL import Image, ImageDraw
import os
import uuid


def index(request):
    return render(request, 'pages/image_processing.html') # 初始页面


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
def segment_image(request):
    if request.method == 'POST' and request.FILES.get('image'):
        uploaded_file = request.FILES['image']
        prompt = request.POST.get('prompt', '')
        # Simulate segmentation: add a red border
        img = Image.open(uploaded_file)
        draw = ImageDraw.Draw(img)
        draw.rectangle([10, 10, img.width-10, img.height-10], outline="red", width=5)
        # In real implementation, use AI model for segmentation based on prompt
        from io import BytesIO
        output = BytesIO()
        img.save(output, format='PNG')
        output.seek(0)
        return HttpResponse(output.getvalue(), content_type='image/png')
    return HttpResponse('Error', status=400)
