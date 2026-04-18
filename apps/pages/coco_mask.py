"""
从二值分割掩码生成 COCO 实例分割常用的 RLE（与 pycocotools 的 Fortran 展平一致，counts 为整数列表）。
依赖 numpy；不引入 pycocotools。
"""
from __future__ import annotations

from io import BytesIO
from typing import Any

import numpy as np
from PIL import Image


def pil_mask_to_binary_u8(mask_img: Image.Image, threshold: int = 127) -> np.ndarray:
    """L 模式或 RGB 掩码 → uint8 {0,1}，形状 (H, W)。"""
    gray = mask_img.convert("L")
    arr = np.asarray(gray, dtype=np.uint8)
    return (arr > threshold).astype(np.uint8)


def resize_mask_bytes_to_size(mask_bytes: bytes, target_w: int, target_h: int) -> np.ndarray:
    """将上传的 PNG 掩码缩放到与源图一致的尺寸，返回二值 uint8 (H,W)。"""
    img = Image.open(BytesIO(mask_bytes)).convert("L")
    if img.size != (target_w, target_h):
        try:
            resample = Image.Resampling.NEAREST
        except AttributeError:
            resample = Image.NEAREST
        img = img.resize((target_w, target_h), resample)
    return pil_mask_to_binary_u8(img)


def binary_mask_bbox_and_area(binary: np.ndarray) -> tuple[list[float], float]:
    """紧密 bbox [x, y, w, h]（COCO 约定）与前景像素面积。"""
    ys, xs = np.where(binary > 0)
    if len(xs) == 0:
        return [0.0, 0.0, 0.0, 0.0], 0.0
    x0, x1 = float(xs.min()), float(xs.max())
    y0, y1 = float(ys.min()), float(ys.max())
    w = x1 - x0 + 1.0
    h = y1 - y0 + 1.0
    area = float(int(binary.sum()))
    return [x0, y0, w, h], area


def binary_mask_to_coco_rle(binary: np.ndarray) -> dict[str, Any]:
    """
    二值 mask (H,W) uint8 0/1 → COCO RLE dict: {"size": [h,w], "counts": [...]}。
    使用列优先（Fortran）展平，与官方 PythonAPI 行为一致。
    """
    if binary.dtype != np.uint8:
        binary = binary.astype(np.uint8)
    h, w = binary.shape
    if h == 0 or w == 0:
        return {"size": [h, w], "counts": []}
    pixels = binary.T.flatten()
    pixels = np.concatenate((np.array([0], dtype=pixels.dtype), pixels, np.array([0], dtype=pixels.dtype)))
    runs = np.where(pixels[1:] != pixels[:-1])[0] + 1
    runs[1::2] -= runs[::2]
    return {"size": [int(h), int(w)], "counts": runs.tolist()}


def build_coco_document(
    *,
    image_id: int,
    image_file_name: str,
    image_width: int,
    image_height: int,
    annotation_id: int,
    category_name: str,
    segment_role: str,
    binary_mask: np.ndarray,
    mask_relative_path: str,
) -> dict[str, Any]:
    """单图单实例的 COCO 风格 JSON：仅一个分割类别（category_id 恒为 1）。"""
    bbox, area = binary_mask_bbox_and_area(binary_mask)
    rle = binary_mask_to_coco_rle(binary_mask)
    category_id = 1
    categories = [
        {"id": category_id, "name": str(category_name), "supercategory": "laps_segmentation"},
    ]
    return {
        "info": {
            "description": "LAPS-System annotation export",
            "version": "1.0",
        },
        "licenses": [],
        "laps": {
            "segment_role": segment_role,
            "category_name": category_name,
            "mask_file": mask_relative_path,
        },
        "images": [
            {
                "id": int(image_id),
                "file_name": image_file_name,
                "width": int(image_width),
                "height": int(image_height),
            }
        ],
        "annotations": [
            {
                "id": int(annotation_id),
                "image_id": int(image_id),
                "category_id": int(category_id),
                "bbox": bbox,
                "area": area,
                "iscrowd": 0,
                "segmentation": rle,
            }
        ],
        "categories": categories,
    }
