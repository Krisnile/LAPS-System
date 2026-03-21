"""
Django settings for LAPS-System.

核心配置：项目路径、数据库、静态文件、国际化、django-unfold 后台等。
环境变量通过 .env 加载（dotenv、str2bool）。
"""

import getpass
import os, random, string
from pathlib import Path
from dotenv import load_dotenv
from str2bool import str2bool

load_dotenv()  # take environment variables from .env.

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

# Quick-start development settings - unsuitable for production
# See https://docs.djangoproject.com/en/4.1/howto/deployment/checklist/

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = os.environ.get('SECRET_KEY')
if not SECRET_KEY:
    SECRET_KEY = ''.join(random.choice( string.ascii_lowercase  ) for i in range( 32 ))

# Enable/Disable DEBUG Mode
DEBUG = str2bool(os.environ.get('DEBUG'))

# Docker HOST
ALLOWED_HOSTS = ['*']

# Add here your deployment HOSTS
CSRF_TRUSTED_ORIGINS = ['http://localhost:8000', 'http://localhost:5085', 'http://127.0.0.1:8000', 'http://127.0.0.1:5085']

RENDER_EXTERNAL_HOSTNAME = os.environ.get('RENDER_EXTERNAL_HOSTNAME')
if RENDER_EXTERNAL_HOSTNAME:    
    ALLOWED_HOSTS.append(RENDER_EXTERNAL_HOSTNAME)

# Application definition

INSTALLED_APPS = [
    "unfold",  # modern admin skin, must come before django.contrib.admin
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",

    # 主站：仪表盘、项目/数据集/任务、标注、账户
    "apps.pages",

    # 动态 API：DYNAMIC_API 配置的模型 REST 接口
    "apps.dyn_api",

    # 图表：/charts/
    "apps.charts",

    # REST Framework
    'rest_framework',
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.locale.LocaleMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

HOME_TEMPLATES = os.path.join(BASE_DIR, 'templates')

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [HOME_TEMPLATES],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
                "django.template.context_processors.i18n",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"


# Database
# https://docs.djangoproject.com/en/4.1/ref/settings/#databases
#
# PostgreSQL：连接参数由环境变量提供，未设置时使用本地开发常见默认值。

DB_NAME = os.getenv("DB_NAME", "laps")
# 兼容 DB_USER（部分部署习惯）与 DB_USERNAME
_raw_db_user = (os.getenv("DB_USERNAME") or os.getenv("DB_USER") or "postgres").strip()
# 勿在 .env 里写字面量 whoami；若误写则回退为当前系统登录名（常见 Homebrew PostgreSQL 超级用户）
if _raw_db_user.lower() == "whoami":
    DB_USERNAME = getpass.getuser()
else:
    DB_USERNAME = _raw_db_user
DB_PASS = os.getenv("DB_PASS", "")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": DB_NAME,
        "USER": DB_USERNAME,
        "PASSWORD": DB_PASS,
        "HOST": DB_HOST,
        "PORT": DB_PORT or "5432",
    }
}

# Password validation
# https://docs.djangoproject.com/en/4.1/ref/settings/#auth-password-validators

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]


# Internationalization
# https://docs.djangoproject.com/en/4.1/topics/i18n/

LANGUAGE_CODE = "zh-hans"

LANGUAGES = [
    ("zh-hans", "简体中文"),
    ("en", "English"),
]

TIME_ZONE = "UTC"

USE_I18N = True

USE_TZ = True

LOCALE_PATHS = [BASE_DIR / "locale"]


# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/4.1/howto/static-files/

STATIC_URL = '/static/'
STATIC_ROOT = os.path.join(BASE_DIR, 'staticfiles')

STATICFILES_DIRS = (
    os.path.join(BASE_DIR, 'static'),
)

# 用户上传：须设置 MEDIA_URL，否则 ImageField.url 为相对路径，浏览器会从站点根错误解析导致 404
# 数据集图片等由 ImageField upload_to 写入 MEDIA_ROOT 下子目录（如 datasets/user_<id>/%Y/%m/%d），勿使用仓库根目录 datasets/
MEDIA_URL = "/media/"
MEDIA_ROOT = os.path.join(BASE_DIR, "media")

# WhiteNoise 静态资源缓存，减少页面切换时重复请求（生产/collectstatic 后生效）
WHITENOISE_MAX_AGE = 60 * 60 * 24 * 30  # 30 天
# 生产环境可启用带 hash 的存储以长期缓存：STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'

# Default primary key field type
# https://docs.djangoproject.com/en/4.1/ref/settings/#default-auto-field

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

LOGIN_REDIRECT_URL = '/'
LOGIN_URL = '/accounts/auth-signin/'
EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'

# Syntax: URI -> Import_PATH
DYNAMIC_API = {
    # SLUG -> Import_PATH 
    'product'  : "apps.pages.models.Product",
}

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework.authentication.SessionAuthentication',
    ],
}

# ---------------------------------------------------------------------------
# django-unfold 后台配置
# ---------------------------------------------------------------------------
# SITE_TITLE / SITE_HEADER: 后台页面标题
# SHOW_LANGUAGES: False 表示顶栏不显示语言切换，仅保留左下栏用户面板中的切换
UNFOLD = {
    "SITE_TITLE": "LAPS系统管理",
    "SITE_HEADER": "LAPS系统管理",
    "SHOW_LANGUAGES": False,
}