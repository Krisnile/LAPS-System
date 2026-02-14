"""SAM inference helper.

Looks for a checkpoint inside the project's ./sam directory and attempts to
load it using the `segment_anything` API. If dependencies or checkpoint are
missing the functions fall back to a safe simulated segmentation (red border).

Usage:
  from apps.pages.sam_inference import run_segmentation_on_bytes
  png_bytes = run_segmentation_on_bytes(image_bytes, points=None, box=None)
"""
from io import BytesIO
import os
from PIL import Image

SAM_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), '..', 'sam')
SAM_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', '..', 'sam'))

_PREDICTOR = None
_SAM_AVAILABLE = False


def _find_checkpoint():
    """Return a path to a checkpoint file inside ./sam or empty string."""
    if not os.path.exists(SAM_DIR):
        return ''
    exts = ('.pth', '.pt', '.ckpt', '.safetensors')
    files = [f for f in os.listdir(SAM_DIR) if f.lower().endswith(exts)]
    if not files:
        return ''
    # Prefer largest file (heuristic for full checkpoint)
    files_full = [os.path.join(SAM_DIR, f) for f in files]
    files_full.sort(key=lambda p: os.path.getsize(p), reverse=True)
    return files_full[0]


def _try_imports():
    try:
        import torch
        from segment_anything import sam_model_registry, SamPredictor
        return torch, sam_model_registry, SamPredictor
    except Exception:
        return None, None, None


def load_predictor():
    """Lazy-load predictor from checkpoint in ./sam. Returns predictor or None."""
    global _PREDICTOR, _SAM_AVAILABLE
    if _PREDICTOR is not None or _SAM_AVAILABLE:
        return _PREDICTOR

    torch, sam_model_registry, SamPredictor = _try_imports()
    if torch is None:
        _SAM_AVAILABLE = False
        return None

    checkpoint = _find_checkpoint()
    if not checkpoint:
        _SAM_AVAILABLE = False
        return None

    # pick device: prefer mps when available
    try:
        if getattr(torch.backends, 'mps', None) and torch.backends.mps.is_available():
            device = 'mps'
        elif torch.cuda.is_available():
            device = 'cuda'
        else:
            device = 'cpu'
    except Exception:
        device = 'cpu'

    # try to infer model type from file name or default to vit_h
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


def run_segmentation_on_bytes(image_bytes, points=None, box=None):
    """Run segmentation on image bytes. Returns PNG bytes.

    If SAM isn't available returns a fallback image (red border).
    - points: list of (x,y) in pixel coords
    - box: [x0,y0,x1,y1]
    """
    try:
        image = Image.open(BytesIO(image_bytes)).convert('RGB')
    except Exception:
        # Not an image
        return b''

    predictor = load_predictor()
    if predictor is None:
        # fallback: red rectangle like original
        img = image.copy()
        from PIL import ImageDraw
        draw = ImageDraw.Draw(img)
        draw.rectangle([10, 10, img.width - 10, img.height - 10], outline='red', width=5)
        out = BytesIO()
        img.save(out, format='PNG')
        return out.getvalue()

    try:
        import numpy as np
        predictor.set_image(np.array(image))

        input_points = None
        input_labels = None
        if points:
            input_points = np.array(points)
            input_labels = np.ones((input_points.shape[0],), dtype=int)

        # predictor.predict returns masks, scores, logits/or similar depending on SA version
        result = predictor.predict(
            point_coords=input_points,
            point_labels=input_labels,
            box=box,
            multimask_output=False,
        )

        masks = result[0]
        if masks is None or len(masks) == 0:
            out = BytesIO()
            image.save(out, format='PNG')
            return out.getvalue()

        mask = masks[0]
        # create overlay
        overlay = Image.new('RGBA', image.size, (255, 0, 0, 90))
        import numpy as _np
        mask_full = (_np.array(mask, dtype=_np.uint8) * 255)
        mask_pil = Image.fromarray(mask_full, mode='L').resize(image.size)
        result_img = Image.composite(overlay, image.convert('RGBA'), mask_pil)

        out = BytesIO()
        result_img.save(out, format='PNG')
        return out.getvalue()
    except Exception:
        img = image.copy()
        from PIL import ImageDraw
        draw = ImageDraw.Draw(img)
        draw.rectangle([10, 10, img.width - 10, img.height - 10], outline='red', width=5)
        out = BytesIO()
        img.save(out, format='PNG')
        return out.getvalue()
