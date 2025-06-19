# tradingapp/settings.py - Dokploy Production Ready

import os
from pathlib import Path
import platform
from django.core.management.utils import get_random_secret_key

# Build paths
BASE_DIR = Path(__file__).resolve().parent.parent

# Auto-detect environment
ENVIRONMENT = os.environ.get('ENVIRONMENT', 'development')

# Auto-switch based on domain/server or platform
if any(domain in os.environ.get('HTTP_HOST', '') for domain in ['tradeeasepro.com', 'production']):
    ENVIRONMENT = 'production'
elif 'staging' in os.environ.get('HTTP_HOST', ''):
    ENVIRONMENT = 'staging'
elif platform.system() == 'Linux' and os.path.exists('/etc/hostname'):
    # If running on Linux server, assume production
    ENVIRONMENT = 'production'

# Environment-based settings
DEBUG = ENVIRONMENT == 'development'
PRODUCTION = ENVIRONMENT == 'production'

print(f"🚀 TradeEasePro starting in {ENVIRONMENT.upper()} mode (DEBUG={DEBUG})")

# Dynamic SECRET_KEY


# At the top of settings.py, replace your SECRET_KEY section with:
if os.environ.get('ENVIRONMENT') == 'production':
    SECRET_KEY = os.environ.get('SECRET_KEY', get_random_secret_key())
    if not os.environ.get('SECRET_KEY') and 'collectstatic' not in sys.argv:
        raise ValueError("SECRET_KEY environment variable is required in production")
else:
    SECRET_KEY = os.environ.get('SECRET_KEY', 'django-insecure-dev-key-only')

# Dynamic ALLOWED_HOSTS - ADD DOKPLOY INTERNAL NETWORK
if PRODUCTION:
    ALLOWED_HOSTS = [
        'tradeeasepro.com',
        'www.tradeeasepro.com',
        'api.tradeeasepro.com',
        '168.231.102.6',  # Your server IP
        'localhost',      # For Dokploy internal communication
        '127.0.0.1',      # For Dokploy internal communication
                          #os.environ.get('SERVER_IP', ''),
    ]
elif ENVIRONMENT == 'staging':
    ALLOWED_HOSTS = ['staging.tradeeasepro.com', '127.0.0.1', 'localhost']
else:
    ALLOWED_HOSTS = ['127.0.0.1', 'localhost', '192.168.29.168', '10.0.0.*', '172.19.*']

# Application definition
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'channels',
    'zerodhatrader',
    'cryptography',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'zerodhatrader.middleware.SubscriptionMiddleware',
]

# Add WhiteNoise in production
if PRODUCTION:
    MIDDLEWARE.insert(1, 'whitenoise.middleware.WhiteNoiseMiddleware')

ROOT_URLCONF = 'tradingapp.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [os.path.join(BASE_DIR, 'zerodhatrader', 'templates')],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

# Channels settings with Redis backend
ASGI_APPLICATION = 'tradingapp.asgi.application'

# Redis Configuration - UPDATED FOR DOKPLOY SERVICES
if PRODUCTION:
    # Dokploy service names for internal communication
    REDIS_HOST = os.environ.get('REDIS_HOST', 'redis-service')
    REDIS_PORT = os.environ.get('REDIS_PORT', '6379')
    REDIS_PASSWORD = os.environ.get('REDIS_PASSWORD', '')
    
    if REDIS_PASSWORD:
        REDIS_URL = f"redis://:{REDIS_PASSWORD}@{REDIS_HOST}:{REDIS_PORT}/0"
    else:
        REDIS_URL = f"redis://{REDIS_HOST}:{REDIS_PORT}/0"
else:
    REDIS_URL = 'redis://localhost:6379/0'

CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels_redis.core.RedisChannelLayer',
        'CONFIG': {
            "hosts": [REDIS_URL],
            "capacity": 2000 if PRODUCTION else 1500,
            "expiry": 60,
        },
    },
}

WSGI_APPLICATION = 'tradingapp.wsgi.application'

# Database - UPDATED FOR DOKPLOY SERVICES
if PRODUCTION:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': os.environ.get('DB_NAME', 'tradeeasepro'),
            'USER': os.environ.get('DB_USER', 'postgres'),
            'PASSWORD': os.environ.get('DB_PASSWORD'),
            'HOST': os.environ.get('DB_HOST', 'postgres-service'),  # Dokploy service name
            'PORT': os.environ.get('DB_PORT', '5432'),
            'CONN_MAX_AGE': 60,
        }
    }
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
        }
    }

# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]

# Internationalization
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'Asia/Kolkata' if PRODUCTION else 'UTC'
USE_I18N = True
USE_L10N = True
USE_TZ = True

# Static files
STATIC_URL = '/static/'
STATICFILES_DIRS = [
    os.path.join(BASE_DIR, 'zerodhatrader', 'static'),
]
STATIC_ROOT = os.path.join(BASE_DIR, 'staticfiles')

# Static files storage for production
if PRODUCTION:
    STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'

    
# Also add this to handle missing files gracefully
STATICFILES_FINDERS = [
    'django.contrib.staticfiles.finders.FileSystemFinder',
    'django.contrib.staticfiles.finders.AppDirectoriesFinder',
]

# Default primary key field type
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# Cross-Platform Logging Configuration
def get_log_file_path():
    """Get appropriate log file path based on OS and environment"""
    if PRODUCTION:
        if platform.system() == 'Windows':
            log_dir = BASE_DIR / 'logs'
        else:
            log_dir = Path('/var/log/tradeeasepro')
    else:
        log_dir = BASE_DIR / 'logs'
    
    # Create log directory if it doesn't exist
    log_dir.mkdir(parents=True, exist_ok=True)
    return str(log_dir / 'app.log')

# Logging Configuration
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{levelname} {asctime} {module} {process:d} {thread:d} {message}',
            'style': '{',
        },
        'simple': {
            'format': '{levelname} {asctime} {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'level': 'INFO',
            'class': 'logging.StreamHandler',
            'formatter': 'simple',
        },
    },
    'loggers': {
        'django': {
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': True,
        },
        'zerodhatrader': {
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': False,
        },
        'zerodhatrader.ticker': {
            'handlers': ['console'],
            'level': 'DEBUG' if DEBUG else 'INFO',
            'propagate': False,
        },
        'zerodhatrader.consumers': {
            'handlers': ['console'],
            'level': 'DEBUG' if DEBUG else 'INFO',
            'propagate': False,
        },
    },
}

# Add file logging in production
if PRODUCTION:
    LOGGING['handlers']['file'] = {
        'level': 'INFO',
        'class': 'logging.handlers.RotatingFileHandler',
        'filename': get_log_file_path(),
        'maxBytes': 15728640,  # 15MB
        'backupCount': 10,
        'formatter': 'verbose',
    }
    # Add file handler to all loggers
    for logger_name in LOGGING['loggers']:
        LOGGING['loggers'][logger_name]['handlers'].append('file')

# Security Settings for Production
if PRODUCTION:
    SECURE_BROWSER_XSS_FILTER = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    X_FRAME_OPTIONS = 'DENY'
    
    # HTTPS Settings (enable when SSL is configured)
    if os.environ.get('ENABLE_HTTPS', 'False').lower() == 'true':
        SECURE_SSL_REDIRECT = True
        SECURE_HSTS_SECONDS = 31536000
        SECURE_HSTS_INCLUDE_SUBDOMAINS = True
        SECURE_HSTS_PRELOAD = True
        SESSION_COOKIE_SECURE = True
        CSRF_COOKIE_SECURE = True

# CSRF settings - UPDATED FOR DOKPLOY
if PRODUCTION:
    CSRF_TRUSTED_ORIGINS = [
        'https://tradeeasepro.com',
        'https://www.tradeeasepro.com',
        'http://168.231.102.6',   # During SSL setup
        'https://168.231.102.6',  # After SSL setup
    ]
else:
    CSRF_COOKIE_SECURE = False
    CSRF_COOKIE_HTTPONLY = False
    CSRF_COOKIE_SAMESITE = 'Lax'
    CSRF_TRUSTED_ORIGINS = ['http://localhost:8000', 'http://127.0.0.1:8000']

CSRF_COOKIE_NAME = 'csrftoken'
CSRF_HEADER_NAME = 'HTTP_X_CSRFTOKEN'

# Email Configuration
if PRODUCTION:
    EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
    EMAIL_HOST = 'smtp.gmail.com'
    EMAIL_PORT = 587
    EMAIL_USE_TLS = True
    EMAIL_HOST_USER = os.environ.get('EMAIL_HOST_USER')
    EMAIL_HOST_PASSWORD = os.environ.get('EMAIL_HOST_PASSWORD')
    DEFAULT_FROM_EMAIL = 'noreply@tradeeasepro.com'
else:
    EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'

# Razorpay Configuration
if PRODUCTION:
    RAZORPAY_KEY_ID = os.environ.get('RAZORPAY_KEY_ID')
    RAZORPAY_KEY_SECRET = os.environ.get('RAZORPAY_KEY_SECRET')
else:
    RAZORPAY_KEY_ID = 'your_razorpay_key_id'
    RAZORPAY_KEY_SECRET = 'your_razorpay_key_secret'

# Encryption key for API keys
if PRODUCTION:
    ENCRYPTION_KEY = os.environ.get('ENCRYPTION_KEY')
    if not ENCRYPTION_KEY:
        from cryptography.fernet import Fernet
        print("⚠️  WARNING: Generating new encryption key. This will invalidate existing encrypted data!")
        ENCRYPTION_KEY = Fernet.generate_key().decode()
else:
    from cryptography.fernet import Fernet
    ENCRYPTION_KEY = Fernet.generate_key().decode()

# Redis Connection Settings for Pub-Sub - UPDATED
REDIS_SETTINGS = {
    'HOST': os.environ.get('REDIS_HOST', 'redis-service'),  # Dokploy service name
    'PORT': int(os.environ.get('REDIS_PORT', 6379)),
    'DB': int(os.environ.get('REDIS_DB', 0)),
    'PASSWORD': os.environ.get('REDIS_PASSWORD'),
    'CONNECTION_POOL_KWARGS': {
        'max_connections': 50,
        'retry_on_timeout': True,
    },
}

# Pub-Sub specific settings
PUBSUB_SETTINGS = {
    'TICK_CHANNEL_PREFIX': 'tick:',
    'MESSAGE_EXPIRY': 60,
    'MAX_RETRIES': 3,
    'RETRY_DELAY': 1,
}

# Print startup info
print(f"📊 Database: {'PostgreSQL' if PRODUCTION else 'SQLite'}")
print(f"🔗 Redis: {REDIS_URL}")
print(f"📝 Logging: {'File + Console' if PRODUCTION else 'Console only'}")
print(f"🔒 HTTPS: {'Enabled' if PRODUCTION and os.environ.get('ENABLE_HTTPS') else 'Disabled'}")