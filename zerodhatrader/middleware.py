from django.shortcuts import redirect
from django.urls import reverse
from .models import UserSubscription, UserAPIKeys

class SubscriptionMiddleware:
    """Enhanced middleware for subscription and setup flow"""
    
    def __init__(self, get_response):
        self.get_response = get_response
        
        # URLs that don't require subscription
        self.public_urls = [
            '/',  # Landing page
            reverse('landing'),
            reverse('signin'),
            reverse('signup'),
            reverse('signout'),
            reverse('password_reset'),
            reverse('password_reset_done'),
        ]
        
        # URLs that require login but not subscription
        self.auth_only_urls = [
            reverse('subscription_plans'),
            reverse('payment_success'),
            reverse('api_keys_setup'),
        ]
        
        # Patterns that don't require checks
        self.exempt_patterns = [
            '/admin/',
            '/static/',
            '/media/',
            '/api/auth-status/',
            '/payment-success/',
            '/subscription/checkout/',
        ]
    
    def __call__(self, request):
        path = request.path
        
        # Always allow static files, media files, admin, and API endpoints
        if any(path.startswith(pattern) for pattern in ['/static/', '/media/', '/admin/', '/api/']):
            return self.get_response(request)
        
        # Skip checks for exempt patterns
        if any(path.startswith(pattern) for pattern in self.exempt_patterns):
            return self.get_response(request)
        
        # Skip checks for public URLs
        if path in self.public_urls:
            return self.get_response(request)
        
        # Check authentication
        if not request.user.is_authenticated:
            # Allow auth-only URLs without redirect
            if path not in self.auth_only_urls:
                return redirect(f"{reverse('signin')}?next={path}")
        else:
            # User is authenticated
            # Skip checks for admin users
            if request.user.is_staff:
                return self.get_response(request)
            
            # Skip checks for auth-only URLs
            if path in self.auth_only_urls:
                return self.get_response(request)
            
            # Check subscription status
            user_sub = UserSubscription.objects.filter(user=request.user).first()
            
            # If no subscription, redirect to plans
            if not user_sub:
                return redirect('subscription_plans')
            
            # If subscription expired, redirect to plans
            if not user_sub.is_active():
                return redirect('subscription_plans')
            
            # Check API keys for trading pages
            if path == reverse('index') or 'trading' in path:
                user_keys = UserAPIKeys.objects.filter(
                    user=request.user, 
                    is_active=True
                ).first()
                
                if not user_keys:
                    return redirect('api_keys_setup')
        
        response = self.get_response(request)
        return response