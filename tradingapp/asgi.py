# tradingapp/asgi.py
import os
import django
from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack
from django.urls import path

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'tradingapp.settings')
django.setup()

# Import after Django setup
from zerodhatrader.consumers import TickerConsumer

application = ProtocolTypeRouter({
    "http": get_asgi_application(),
    "websocket": AuthMiddlewareStack(
        URLRouter([
            path('ws/ticker/', TickerConsumer.as_asgi()),
        ])
    ),
})