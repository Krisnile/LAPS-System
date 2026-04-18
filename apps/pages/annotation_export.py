"""
标注结果多格式导出：从已保存的 Annotation（掩码文件 + 元数据）生成 COCO / 简单 JSON / Pascal VOC / YOLO 框 txt 等。
含项目级合并导出（多图、多实例）。
"""
from __future__ import annotations

import os
import zipfile
from collections import defaultdict
from io import BytesIO
from typing import Any, Iterable
from xml.etree import ElementTree as ET

from PIL import Image as PILImage

from .coco_mask import (
    binary_mask_bbox_and_area,
    binary_mask_to_coco_rle,
    build_coco_document,
    resize_mask_bytes_to_size,
)

EXPORT_FORMATS = frozenset({'coco', 'simple', 'voc', 'yolo_bbox', 'mask_png'})


def _image_dimensions(image) -> tuple[int, int]:
    iw, ih = image.width, image.height
    if iw and ih:
        return int(iw), int(ih)
    image.file.seek(0)
    with PILImage.open(image.file) as im:
        return im.size


def load_annotation_binary_mask(ann) -> tuple[Any, int, int] | None:
    """读取标注掩码并对齐到原图尺寸，返回 (binary HxW uint8, width, height)。无掩码返回 None。"""
    if not ann.mask_file:
        return None
    task = ann.task
    image = task.image
    if not image or not image.file:
        return None
    iw, ih = _image_dimensions(image)
    with ann.mask_file.open('rb') as f:
        data = f.read()
    binary = resize_mask_bytes_to_size(data, iw, ih)
    return binary, iw, ih


def build_simple_export_dict(ann, binary, iw: int, ih: int) -> dict[str, Any]:
    bbox, area = binary_mask_bbox_and_area(binary)
    rle = binary_mask_to_coco_rle(binary)
    image = ann.task.image
    try:
        img_base = os.path.basename(image.file.name)
    except Exception:
        img_base = f'image_{ann.task.image_id}.png'
    return {
        'format': 'laps_simple_v1',
        'annotation_id': ann.id,
        'task_id': ann.task_id,
        'image': {
            'id': image.id,
            'file_name': img_base,
            'width': iw,
            'height': ih,
        },
        'instance': {
            'category_name': ann.label,
            'segment_role': ann.segment_role or '',
            'bbox_xywh': bbox,
            'area_pixels': area,
            'mask_storage_path': ann.mask_file.name if ann.mask_file else '',
        },
        'segmentation_rle': rle,
    }


def build_voc_xml_string(ann, bbox: list[float], iw: int, ih: int) -> str:
    """Pascal VOC 风格单目标 XML（检测框；分割多边形需另行工具链）。"""
    image = ann.task.image
    try:
        img_base = os.path.basename(image.file.name)
    except Exception:
        img_base = f'image_{image.id}.png'
    x, y, w, h = bbox
    xi0 = int(round(x))
    yi0 = int(round(y))
    wi = max(1, int(round(w)))
    hi = max(1, int(round(h)))
    xmax = min(iw - 1, xi0 + wi - 1)
    ymax = min(ih - 1, yi0 + hi - 1)

    root = ET.Element('annotation')
    ET.SubElement(root, 'folder').text = 'images'
    ET.SubElement(root, 'filename').text = img_base
    size = ET.SubElement(root, 'size')
    ET.SubElement(size, 'width').text = str(iw)
    ET.SubElement(size, 'height').text = str(ih)
    ET.SubElement(size, 'depth').text = '3'
    obj = ET.SubElement(root, 'object')
    ET.SubElement(obj, 'name').text = ann.label or 'object'
    ET.SubElement(obj, 'pose').text = 'Unspecified'
    ET.SubElement(obj, 'truncated').text = '0'
    ET.SubElement(obj, 'difficult').text = '0'
    bnd = ET.SubElement(obj, 'bndbox')
    ET.SubElement(bnd, 'xmin').text = str(xi0)
    ET.SubElement(bnd, 'ymin').text = str(yi0)
    ET.SubElement(bnd, 'xmax').text = str(xmax)
    ET.SubElement(bnd, 'ymax').text = str(ymax)

    buf = BytesIO()
    ET.ElementTree(root).write(buf, encoding='utf-8', xml_declaration=True)
    return buf.getvalue().decode('utf-8')


def build_yolo_bbox_line(ann, bbox: list[float], iw: int, ih: int) -> str:
    """YOLO 检测常用单行：class_id + 归一化中心与宽高；单类导出固定 class_id=0，首行注释类别名。"""
    x, y, w, h = bbox
    if iw <= 0 or ih <= 0:
        return '# LAPS invalid image size\n0 0.5 0.5 0 0\n'
    xc = (x + w / 2.0) / float(iw)
    yc = (y + h / 2.0) / float(ih)
    nw = w / float(iw)
    nh = h / float(ih)
    xc = max(0.0, min(1.0, xc))
    yc = max(0.0, min(1.0, yc))
    nw = max(0.0, min(1.0, nw))
    nh = max(0.0, min(1.0, nh))
    name = (ann.label or 'object').replace('\n', ' ').strip()
    return f'# laps_category_name={name}\n0 {xc:.6f} {yc:.6f} {nw:.6f} {nh:.6f}\n'


def yolo_bbox_numbers_line(bbox: list[float], iw: int, ih: int) -> str:
    """单行 YOLO：class_id=0 + 归一化 xc yc w h（无注释）。"""
    x, y, w, h = bbox
    if iw <= 0 or ih <= 0:
        return '0 0.5 0.5 0 0'
    xc = (x + w / 2.0) / float(iw)
    yc = (y + h / 2.0) / float(ih)
    nw = w / float(iw)
    nh = h / float(ih)
    xc = max(0.0, min(1.0, xc))
    yc = max(0.0, min(1.0, yc))
    nw = max(0.0, min(1.0, nw))
    nh = max(0.0, min(1.0, nh))
    return f'0 {xc:.6f} {yc:.6f} {nw:.6f} {nh:.6f}'


def build_merged_coco_project(annotations: Iterable[Any]) -> dict[str, Any]:
    """将项目下多条 Annotation 合并为单一 COCO 风格 JSON（多图、多实例、多类别）。"""
    images_by_id: dict[int, dict[str, Any]] = {}
    annotations_out: list[dict[str, Any]] = []
    cat_key_to_id: dict[tuple[str, str], int] = {}
    categories_out: list[dict[str, Any]] = []
    next_cat_id = 1

    for ann in annotations:
        loaded = load_annotation_binary_mask(ann)
        if loaded is None:
            continue
        binary, iw, ih = loaded
        task = ann.task
        image = task.image
        if not image:
            continue
        img_id = int(image.id)
        if img_id not in images_by_id:
            try:
                img_fn = os.path.basename(image.file.name)
            except Exception:
                img_fn = f'image_{img_id}.png'
            images_by_id[img_id] = {
                'id': img_id,
                'file_name': img_fn,
                'width': int(iw),
                'height': int(ih),
                'laps_task_id': int(task.id),
            }
        label = ann.label or 'object'
        role = (ann.segment_role or '').strip() or 'foreground'
        ckey = (str(label), str(role))
        if ckey not in cat_key_to_id:
            cat_key_to_id[ckey] = next_cat_id
            categories_out.append({
                'id': next_cat_id,
                'name': label,
                'supercategory': 'laps_segmentation',
                'laps_segment_role': role,
            })
            next_cat_id += 1
        cid = cat_key_to_id[ckey]
        bbox, area = binary_mask_bbox_and_area(binary)
        rle = binary_mask_to_coco_rle(binary)
        rel_path = ann.mask_file.name if ann.mask_file else ''
        annotations_out.append({
            'id': int(ann.id),
            'image_id': img_id,
            'category_id': cid,
            'bbox': bbox,
            'area': area,
            'iscrowd': 0,
            'segmentation': rle,
            'laps_segment_role': role,
            'laps_task_id': int(task.id),
            'laps_mask_file': rel_path,
        })

    return {
        'info': {
            'description': 'LAPS-System project annotation export',
            'version': '1.0',
        },
        'licenses': [],
        'images': sorted(images_by_id.values(), key=lambda x: x['id']),
        'annotations': annotations_out,
        'categories': categories_out,
    }


def build_project_simple_export_dict(annotations: Iterable[Any]) -> dict[str, Any]:
    parts: list[dict[str, Any]] = []
    for ann in annotations:
        loaded = load_annotation_binary_mask(ann)
        if loaded is None:
            continue
        binary, iw, ih = loaded
        parts.append(build_simple_export_dict(ann, binary, iw, ih))
    return {
        'format': 'laps_simple_project_v1',
        'annotation_count': len(parts),
        'annotations': parts,
    }


def build_voc_xml_string_multi(image, rows: list[tuple[Any, Any, int, int]]) -> str:
    """
    同一原图下多实例：一张 Pascal VOC 风格 XML。
    rows: (ann, binary ndarray, iw, ih)，iw/ih 须一致。
    """
    if not rows:
        return '<?xml version="1.0" encoding="utf-8"?><annotation></annotation>'
    _, _, iw, ih = rows[0]
    try:
        img_base = os.path.basename(image.file.name)
    except Exception:
        img_base = f'image_{image.id}.png'
    root = ET.Element('annotation')
    ET.SubElement(root, 'folder').text = 'images'
    ET.SubElement(root, 'filename').text = img_base
    size = ET.SubElement(root, 'size')
    ET.SubElement(size, 'width').text = str(iw)
    ET.SubElement(size, 'height').text = str(ih)
    ET.SubElement(size, 'depth').text = '3'
    for ann, binary, riw, rih in rows:
        if riw != iw or rih != ih:
            continue
        bbox, _ = binary_mask_bbox_and_area(binary)
        x, y, w, h = bbox
        xi0 = int(round(x))
        yi0 = int(round(y))
        wi = max(1, int(round(w)))
        hi = max(1, int(round(h)))
        xmax = min(iw - 1, xi0 + wi - 1)
        ymax = min(ih - 1, yi0 + hi - 1)
        obj = ET.SubElement(root, 'object')
        ET.SubElement(obj, 'name').text = ann.label or 'object'
        ET.SubElement(obj, 'pose').text = 'Unspecified'
        ET.SubElement(obj, 'truncated').text = '0'
        ET.SubElement(obj, 'difficult').text = '0'
        bnd = ET.SubElement(obj, 'bndbox')
        ET.SubElement(bnd, 'xmin').text = str(xi0)
        ET.SubElement(bnd, 'ymin').text = str(yi0)
        ET.SubElement(bnd, 'xmax').text = str(xmax)
        ET.SubElement(bnd, 'ymax').text = str(ymax)
    buf = BytesIO()
    ET.ElementTree(root).write(buf, encoding='utf-8', xml_declaration=True)
    return buf.getvalue().decode('utf-8')


def build_project_export_zip_bytes(fmt: str, annotations: list[Any]) -> bytes:
    """项目级 voc / yolo_bbox / mask_png → ZIP 字节。"""
    buf = BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        if fmt == 'mask_png':
            n = 0
            for ann in annotations:
                if not ann.mask_file:
                    continue
                try:
                    data = ann.mask_file.open('rb').read()
                except Exception:
                    continue
                zf.writestr(f'masks/task_{ann.task_id}_ann_{ann.id}_mask.png', data)
                n += 1
            if n == 0:
                zf.writestr('README.txt', 'No mask files in this project.')
        elif fmt == 'voc':
            groups: dict[int, list[tuple[Any, Any, int, int]]] = defaultdict(list)
            for ann in annotations:
                loaded = load_annotation_binary_mask(ann)
                if loaded is None:
                    continue
                binary, iw, ih = loaded
                groups[ann.task.image_id].append((ann, binary, iw, ih))
            if not groups:
                zf.writestr('README.txt', 'No annotations with masks in this project.')
            for image_id, rows in sorted(groups.items(), key=lambda x: x[0]):
                image = rows[0][0].task.image
                try:
                    stem = os.path.splitext(os.path.basename(image.file.name))[0]
                except Exception:
                    stem = f'image_{image_id}'
                xml = build_voc_xml_string_multi(image, rows)
                zf.writestr(f'voc/{stem}.xml', xml.encode('utf-8'))
        elif fmt == 'yolo_bbox':
            groups: dict[tuple[int, str], list[tuple[Any, list[float], int, int]]] = defaultdict(list)
            for ann in annotations:
                loaded = load_annotation_binary_mask(ann)
                if loaded is None:
                    continue
                binary, iw, ih = loaded
                bbox, _ = binary_mask_bbox_and_area(binary)
                img = ann.task.image
                try:
                    fn = os.path.basename(img.file.name)
                except Exception:
                    fn = f'image_{img.id}.png'
                stem = os.path.splitext(fn)[0]
                groups[(img.id, stem)].append((ann, bbox, iw, ih))
            if not groups:
                zf.writestr('README.txt', 'No annotations with masks in this project.')
            for (_img_id, stem), rows in sorted(groups.items(), key=lambda x: (x[0][0], x[0][1])):
                lines = ['# LAPS project export — one row per instance']
                for ann, bbox, iw, ih in rows:
                    name = (ann.label or 'object').replace('\n', ' ').strip()
                    lines.append(f'# laps_category_name={name}')
                    lines.append(yolo_bbox_numbers_line(bbox, iw, ih))
                zf.writestr(f'yolo/{stem}.txt', '\n'.join(lines) + '\n')
        else:
            zf.writestr('README.txt', f'Unsupported format in zip builder: {fmt}')
    return buf.getvalue()
