"""Interactive segmentation (SAM) and instance segmentation (YOLO11-seg).

- **SAM**：``model/sam/``（兼容 ``./sam/``）→ ``run_segmentation_on_bytes`` 返回灰度掩码 PNG。
- **YOLO**：``model/yolo/*.pt``（YOLO11-seg）→ ``run_yolo_segmentation_on_bytes`` 返回灰度掩码 PNG（需 ``ultralytics``）。

两个入口函数签名一致，均返回与原图同尺寸的灰度掩码 PNG bytes（0=背景 255=前景）。

Usage:
  from apps.pages.sam_inference import run_segmentation_on_bytes, run_yolo_segmentation_on_bytes
"""
from __future__ import annotations

from io import BytesIO
import os
from PIL import Image


def _repo_root() -> str:
    return os.path.normpath(os.path.join(os.path.dirname(__file__), '..', '..'))


MODEL_ROOT = os.path.join(_repo_root(), 'model')
SAM_DIR = os.path.join(MODEL_ROOT, 'sam')
YOLO_DIR = os.path.join(MODEL_ROOT, 'yolo')
_LEGACY_SAM_DIR = os.path.join(_repo_root(), 'sam')


def _effective_sam_dir() -> str:
    """Prefer ``model/sam``; fall back to legacy root ``sam/`` if present."""
    if os.path.isdir(SAM_DIR):
        return SAM_DIR
    if os.path.isdir(_LEGACY_SAM_DIR):
        return _LEGACY_SAM_DIR
    return SAM_DIR


_PREDICTOR = None
_SAM_AVAILABLE = False

_YOLO_MODEL = None
_YOLO_CKPT: str = ''

# 用户给出提示框时：在点/负点等粗筛之后，对剩余实例按与提示框的 IoU 相对最优值过滤——
# 仅保留 IoU ≥ (max IoU × 该比例) 的检测框对应实例，再合并掩码（与论文描述一致）。
YOLO_PROMPT_BOX_IOU_FRACTION = 0.45


def _find_checkpoint_in_dir(directory: str) -> str:
    if not directory or not os.path.isdir(directory):
        return ''
    exts = ('.pth', '.pt', '.ckpt', '.safetensors')
    files = [f for f in os.listdir(directory) if f.lower().endswith(exts)]
    if not files:
        return ''
    files_full = [os.path.join(directory, f) for f in files]
    files_full.sort(key=lambda p: os.path.getsize(p), reverse=True)
    return files_full[0]


def _find_checkpoint():
    """SAM checkpoint path under ``model/sam`` or legacy ``./sam``."""
    return _find_checkpoint_in_dir(_effective_sam_dir())


def _find_yolo_checkpoint():
    """YOLO weights under ``model/yolo``."""
    return _find_checkpoint_in_dir(YOLO_DIR)


def _try_imports_sam():
    try:
        import torch
        from segment_anything import sam_model_registry, SamPredictor
        return torch, sam_model_registry, SamPredictor
    except Exception:
        return None, None, None


def load_predictor():
    """Lazy-load SAM predictor from ``model/sam`` (or legacy ``./sam``)."""
    global _PREDICTOR, _SAM_AVAILABLE
    if _PREDICTOR is not None or _SAM_AVAILABLE:
        return _PREDICTOR

    torch, sam_model_registry, SamPredictor = _try_imports_sam()
    if torch is None:
        _SAM_AVAILABLE = False
        return None

    checkpoint = _find_checkpoint()
    if not checkpoint:
        _SAM_AVAILABLE = False
        return None

    try:
        if getattr(torch.backends, 'mps', None) and torch.backends.mps.is_available():
            device = 'mps'
        elif torch.cuda.is_available():
            device = 'cuda'
        else:
            device = 'cpu'
    except Exception:
        device = 'cpu'

    model_type = 'vit_h'
    name = os.path.basename(checkpoint).lower()
    if 'vit_l' in name:
        model_type = 'vit_l'
    elif 'vit_b' in name:
        model_type = 'vit_b'

    try:
        sam = sam_model_registry[model_type](checkpoint=checkpoint)
        sam.to(device=device)
        predictor = SamPredictor(sam)
        _PREDICTOR = predictor
        _SAM_AVAILABLE = True
        return _PREDICTOR
    except Exception:
        _SAM_AVAILABLE = False
        return None


def _fallback_mask_png(image: Image.Image) -> bytes:
    """与图像同尺寸的灰度掩码 PNG（失败示意：白框线），供前端上色叠层。"""
    from PIL import ImageDraw
    m = Image.new('L', image.size, 0)
    draw = ImageDraw.Draw(m)
    draw.rectangle([10, 10, image.width - 10, image.height - 10], outline=255, width=5)
    out = BytesIO()
    m.save(out, format='PNG')
    return out.getvalue()


def _mask_grayscale_png_bytes(mask_hw, size_wh: tuple[int, int]) -> bytes:
    """mask_hw: 2D float/bool 0–1；输出与 size_wh (W,H) 一致的 L 模式 PNG。"""
    import numpy as _np
    m = _np.asarray(mask_hw, dtype=_np.float32)
    m = _np.clip(m, 0.0, 1.0)
    mask_uint8 = (m * 255).astype(_np.uint8)
    mask_pil = Image.fromarray(mask_uint8, mode='L')
    if mask_pil.size != size_wh:
        mask_pil = mask_pil.resize(size_wh, Image.BILINEAR)
    out = BytesIO()
    mask_pil.save(out, format='PNG')
    return out.getvalue()


def _normalize_xyxy_box(box, iw: int, ih: int):
    if not box or len(box) != 4:
        return None
    x0, y0, x1, y1 = (float(box[0]), float(box[1]), float(box[2]), float(box[3]))
    if x1 < x0:
        x0, x1 = x1, x0
    if y1 < y0:
        y0, y1 = y1, y0
    x0 = max(0.0, min(float(iw - 1), x0))
    x1 = max(0.0, min(float(iw - 1), x1))
    y0 = max(0.0, min(float(ih - 1), y0))
    y1 = max(0.0, min(float(ih - 1), y1))
    return [x0, y0, x1, y1]


def _iou_xyxy(a: list[float], b: list[float]) -> float:
    ax0, ay0, ax1, ay1 = a
    bx0, by0, bx1, by1 = b
    ix0 = max(ax0, bx0)
    iy0 = max(ay0, by0)
    ix1 = min(ax1, bx1)
    iy1 = min(ay1, by1)
    iw = max(0.0, ix1 - ix0)
    ih = max(0.0, iy1 - iy0)
    inter = iw * ih
    if inter <= 0:
        return 0.0
    area_a = max(0.0, ax1 - ax0) * max(0.0, ay1 - ay0)
    area_b = max(0.0, bx1 - bx0) * max(0.0, by1 - by0)
    union = area_a + area_b - inter
    if union <= 0:
        return 0.0
    return inter / union


def _point_in_xyxy(px: float, py: float, x0: float, y0: float, x1: float, y1: float) -> bool:
    return x0 <= px <= x1 and y0 <= py <= y1


def run_yolo_segmentation_on_bytes(image_bytes, points=None, point_labels=None, box=None):
    """YOLO11-seg 实例分割：返回与原图同尺寸的灰度掩码 PNG（0=背景 255=前景）。

    工作流程：
    1. YOLO-seg 模型对全图做推理，得到每个实例的分割掩码。
    2. 如果用户提供了前景点，只保留掩码覆盖到前景点的实例；
       如果用户提供了背景点，排除掩码覆盖到背景点的实例；
       如果用户提供了框，按 IoU 筛选实例。
    3. 无任何提示时，保留置信度最高的前 5 个实例。
    4. 将选中实例的掩码合并为单一二值掩码，编码为灰度 PNG 返回。
    """
    try:
        image = Image.open(BytesIO(image_bytes)).convert('RGB')
    except Exception:
        return b''

    iw, ih = image.size
    ckpt = _find_yolo_checkpoint()
    if not ckpt:
        return _fallback_mask_png(image)

    try:
        from ultralytics import YOLO
    except Exception:
        return _fallback_mask_png(image)

    global _YOLO_MODEL, _YOLO_CKPT
    try:
        if _YOLO_MODEL is None or _YOLO_CKPT != ckpt:
            _YOLO_MODEL = YOLO(ckpt)
            _YOLO_CKPT = ckpt
    except Exception:
        return _fallback_mask_png(image)

    import numpy as np

    arr = np.array(image)
    try:
        results = _YOLO_MODEL.predict(source=arr, verbose=False, retina_masks=True)
    except Exception:
        return _fallback_mask_png(image)

    if not results:
        return _mask_grayscale_png_bytes(np.zeros((ih, iw), dtype=np.float32), (iw, ih))

    r = results[0]
    if r.masks is None or len(r.masks) == 0:
        return _mask_grayscale_png_bytes(np.zeros((ih, iw), dtype=np.float32), (iw, ih))

    masks_data = r.masks.data.cpu().numpy()
    xyxy = r.boxes.xyxy.cpu().numpy() if r.boxes is not None else None
    confs = r.boxes.conf.cpu().numpy() if r.boxes is not None else None

    n_inst = masks_data.shape[0]

    pos_pts: list[tuple[float, float]] = []
    neg_pts: list[tuple[float, float]] = []
    if points:
        for idx_pt, (px, py) in enumerate(points):
            pl = 1
            if point_labels is not None and idx_pt < len(point_labels):
                pl = int(point_labels[idx_pt]) if point_labels[idx_pt] else 0
            if pl:
                pos_pts.append((float(px), float(py)))
            else:
                neg_pts.append((float(px), float(py)))

    box_n = _normalize_xyxy_box(box, iw, ih) if box else None

    def _resize_mask(mask_hw: np.ndarray) -> np.ndarray:
        mh, mw = mask_hw.shape
        if mh == ih and mw == iw:
            return mask_hw
        m_pil = Image.fromarray((mask_hw * 255).astype(np.uint8), mode='L')
        m_pil = m_pil.resize((iw, ih), Image.BILINEAR)
        return np.array(m_pil, dtype=np.float32) / 255.0

    def _point_on_mask(px: float, py: float, mask: np.ndarray) -> bool:
        ix, iy = int(round(px)), int(round(py))
        if 0 <= iy < mask.shape[0] and 0 <= ix < mask.shape[1]:
            return mask[iy, ix] > 0.5
        return False

    keep = [True] * n_inst
    resized = [_resize_mask(masks_data[i]) for i in range(n_inst)]

    if pos_pts:
        for i in range(n_inst):
            if not any(_point_on_mask(px, py, resized[i]) for px, py in pos_pts):
                keep[i] = False

    if neg_pts:
        for i in range(n_inst):
            if keep[i] and any(_point_on_mask(px, py, resized[i]) for px, py in neg_pts):
                if not any(_point_on_mask(px, py, resized[i]) for px, py in pos_pts):
                    keep[i] = False

    if box_n is not None and xyxy is not None:
        cand = [i for i in range(n_inst) if keep[i]]
        if cand:
            ious = [_iou_xyxy(box_n, xyxy[i].tolist()) for i in cand]
            best = max(ious)
            if best < 1e-6:
                for i in cand:
                    keep[i] = False
            else:
                thr = best * YOLO_PROMPT_BOX_IOU_FRACTION
                for j, i in enumerate(cand):
                    if ious[j] < thr:
                        keep[i] = False

    kept_indices = [i for i in range(n_inst) if keep[i]]

    if not kept_indices and not pos_pts and not neg_pts and not box_n:
        if confs is not None:
            ranked = sorted(range(n_inst), key=lambda i: -confs[i])
            kept_indices = ranked[:5]
        else:
            kept_indices = list(range(min(5, n_inst)))
    elif not kept_indices:
        return _mask_grayscale_png_bytes(np.zeros((ih, iw), dtype=np.float32), (iw, ih))

    merged = np.zeros((ih, iw), dtype=np.float32)
    for i in kept_indices:
        merged = np.maximum(merged, resized[i])

    return _mask_grayscale_png_bytes(merged, (iw, ih))


def run_segmentation_on_bytes(image_bytes, points=None, point_labels=None, box=None, model='sam'):
    """SAM 分割：返回与图像同尺寸的 **灰度掩码 PNG**（0=背景 255=前景）。

    ``point_labels`` 与 ``points`` 等长时：1=前景点、0=背景点；缺省则全为前景点。
    """
    try:
        image = Image.open(BytesIO(image_bytes)).convert('RGB')
    except Exception:
        return b''

    iw, ih = image.size
    box_n = _normalize_xyxy_box(box, iw, ih) if box else None

    predictor = load_predictor()
    if predictor is None:
        return _fallback_mask_png(image)

    try:
        import numpy as np
        predictor.set_image(np.array(image))

        input_points = None
        input_labels = None
        if points:
            input_points = np.array(points)
            n = input_points.shape[0]
            if point_labels is not None and len(point_labels) == n:
                input_labels = np.array([1 if int(x) else 0 for x in point_labels], dtype=np.int64)
            else:
                input_labels = np.ones((n,), dtype=np.int64)

        result = predictor.predict(
            point_coords=input_points,
            point_labels=input_labels,
            box=np.array(box_n, dtype=np.float64) if box_n is not None else None,
            multimask_output=False,
        )

        masks = result[0]
        if masks is None or len(masks) == 0:
            return _mask_grayscale_png_bytes(np.zeros((ih, iw), dtype=np.float32), image.size)

        mask = masks[0]
        mask_full = (np.array(mask, dtype=np.uint8) * 255)
        mask_pil = Image.fromarray(mask_full, mode='L').resize(image.size)
        mask_f = np.array(mask_pil, dtype=np.float32) / 255.0
        return _mask_grayscale_png_bytes(mask_f, image.size)
    except Exception:
        return _fallback_mask_png(image)
