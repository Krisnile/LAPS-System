from django.apps import AppConfig


class PagesConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.pages"
    
    def ready(self):
        # Warm-up: try to load SAM predictor at startup so first request is faster.
        try:
            from . import sam_inference
            # call load_predictor but ignore failures
            sam_inference.load_predictor()
        except Exception:
            pass
