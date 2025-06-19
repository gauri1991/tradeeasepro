from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required, user_passes_test
from django.contrib import messages
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone
from django.conf import settings
from decimal import Decimal  # Add this import
import razorpay
import json
import hmac
import hashlib
from datetime import timedelta
import requests
from kiteconnect import KiteConnect
from django.contrib.auth.models import User
from django.db import models
from .models import (
    SubscriptionPlan, UserSubscription, Payment, 
    UserAPIKeys, FeatureAccess, AdminActivityLog
)

# Initialize Razorpay client
razorpay_client = razorpay.Client(auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET))

# Decorator to check subscription status
def subscription_required(view_func):
    @login_required
    def wrapped_view(request, *args, **kwargs):
        user_sub = UserSubscription.objects.filter(user=request.user).first()
        if not user_sub or not user_sub.is_active():
            return redirect('subscription_plans')
        return view_func(request, *args, **kwargs)
    return wrapped_view

# Check if user is admin
def is_admin(user):
    return user.is_authenticated and user.is_staff

# Public views
def subscription_plans(request):
    """Enhanced subscription plans with better flow"""
    plans = SubscriptionPlan.objects.filter(is_active=True).order_by('duration_days')
    user_subscription = None
    
    # Add monthly price calculation and other enhancements to each plan
    for plan in plans:
        # Calculate monthly equivalent price using Decimal arithmetic
        if plan.duration_days > 30:
            # Convert to Decimal for proper calculation
            monthly_price = (plan.price / Decimal(str(plan.duration_days))) * Decimal('30')
            plan.monthly_price = round(float(monthly_price), 0)
        else:
            plan.monthly_price = float(plan.price)
        
        # Calculate discount amount if applicable
        if plan.discount_percentage > 0:
            # Use Decimal arithmetic for discount calculation
            discount_multiplier = Decimal('1') - (Decimal(str(plan.discount_percentage)) / Decimal('100'))
            original_price = plan.price / discount_multiplier
            plan.discount_amount = round(float(original_price - plan.price), 2)
        else:
            plan.discount_amount = 0
        
        # Add plan-specific descriptions and features
        if plan.plan_type == 'MONTHLY':
            plan.description = 'Perfect for getting started'
            plan.icon_class = 'fas fa-rocket'
        elif plan.plan_type == 'QUARTERLY':
            plan.description = 'Best value for regular traders'
            plan.icon_class = 'fas fa-crown'
        elif plan.plan_type == 'YEARLY':
            plan.description = 'Maximum savings for professionals'
            plan.icon_class = 'fas fa-gem'
        else:
            plan.description = 'Professional trading solution'
            plan.icon_class = 'fas fa-chart-line'
    
    if request.user.is_authenticated:
        user_subscription = UserSubscription.objects.filter(user=request.user).first()
        
        # If user has active paid subscription, redirect to dashboard
        if user_subscription and user_subscription.status == 'ACTIVE' and user_subscription.plan:
            messages.info(request, 'You already have an active subscription.')
            return redirect('index')
    
    context = {
        'plans': plans,
        'user_subscription': user_subscription,
        'show_trial_info': user_subscription and user_subscription.status == 'TRIAL',
    }
    
    return render(request, 'subscription/plans.html', context)

@login_required
def checkout(request, plan_id):
    """Checkout page for subscription - Development version"""
    plan = get_object_or_404(SubscriptionPlan, id=plan_id, is_active=True)
    
    # Check if user already has an active subscription
    user_sub = UserSubscription.objects.filter(user=request.user).first()
    if user_sub and user_sub.is_active() and user_sub.status == 'ACTIVE':
        messages.warning(request, "You already have an active subscription.")
        return redirect('subscription_plans')
    
    # DEVELOPMENT MODE - Skip Razorpay integration
    if settings.DEBUG:
        # Create a mock payment record for development
        payment = Payment.objects.create(
            user=request.user,
            subscription_plan=plan,
            amount=plan.price,
            razorpay_order_id=f'dev_order_{timezone.now().timestamp()}',
            status='PENDING'
        )
        
        context = {
            'plan': plan,
            'payment': payment,
            'razorpay_order_id': 'dev_order_123',
            'razorpay_key_id': 'dev_key',
            'amount': int(plan.price * 100),
            'user': request.user,
            'development_mode': True,
        }
        
        return render(request, 'subscription/checkout.html', context)
    
    # PRODUCTION MODE - Use Razorpay
    try:
        # Create Razorpay order
        amount_in_paise = int(plan.price * 100)
        razorpay_order = razorpay_client.order.create({
            'amount': amount_in_paise,
            'currency': 'INR',
            'payment_capture': 1,
            'notes': {
                'user_id': request.user.id,
                'plan_id': plan.id,
            }
        })
        
        # Create payment record
        payment = Payment.objects.create(
            user=request.user,
            subscription_plan=plan,
            amount=plan.price,
            razorpay_order_id=razorpay_order['id'],
            status='PENDING'
        )
        
        context = {
            'plan': plan,
            'payment': payment,
            'razorpay_order_id': razorpay_order['id'],
            'razorpay_key_id': settings.RAZORPAY_KEY_ID,
            'amount': amount_in_paise,
            'user': request.user,
            'development_mode': False,
        }
        
        return render(request, 'subscription/checkout.html', context)
        
    except Exception as e:
        messages.error(request, f'Payment setup failed: {str(e)}')
        return redirect('subscription_plans')

@csrf_exempt
@login_required
def payment_success(request):
    """Handle successful payment"""
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            razorpay_order_id = data.get('razorpay_order_id')
            razorpay_payment_id = data.get('razorpay_payment_id')
            razorpay_signature = data.get('razorpay_signature')
            
            # Verify payment signature
            params_dict = {
                'razorpay_order_id': razorpay_order_id,
                'razorpay_payment_id': razorpay_payment_id,
                'razorpay_signature': razorpay_signature
            }
            
            try:
                razorpay_client.utility.verify_payment_signature(params_dict)
            except:
                return JsonResponse({'status': 'error', 'message': 'Invalid signature'})
            
            # Update payment record
            payment = Payment.objects.get(razorpay_order_id=razorpay_order_id)
            payment.status = 'SUCCESS'
            payment.razorpay_payment_id = razorpay_payment_id
            payment.razorpay_signature = razorpay_signature
            payment.save()
            
            # Update or create user subscription
            user_sub, created = UserSubscription.objects.get_or_create(user=request.user)
            user_sub.plan = payment.subscription_plan
            user_sub.status = 'ACTIVE'
            user_sub.subscription_start_date = timezone.now()
            user_sub.subscription_end_date = timezone.now() + timedelta(days=payment.subscription_plan.duration_days)
            user_sub.save()
            
            # Log activity
            AdminActivityLog.objects.create(
                admin_user=request.user,
                action='SUBSCRIPTION_PURCHASED',
                target_model='UserSubscription',
                target_id=user_sub.id,
                details={
                    'plan': payment.subscription_plan.name,
                    'amount': str(payment.amount)
                }
            )
            
            return JsonResponse({
                'status': 'success',
                'redirect_url': '/api-keys-setup/'
            })
            
        except Exception as e:
            return JsonResponse({'status': 'error', 'message': str(e)})
    
    return JsonResponse({'status': 'error', 'message': 'Invalid request'})

@login_required
def api_keys_setup(request):
    """Enhanced API keys setup with validation"""
    user_sub = UserSubscription.objects.filter(user=request.user).first()
    if not user_sub or not user_sub.is_active():
        messages.warning(request, 'Please subscribe to a plan to continue.')
        return redirect('subscription_plans')
    
    # Check if user already has API keys
    existing_keys = UserAPIKeys.objects.filter(user=request.user).first()
    
    if request.method == 'POST':
        action = request.POST.get('action')
        
        if action == 'skip':
            # User wants to skip for now
            messages.info(request, 'You can set up API keys later from your profile.')
            return redirect('index')
        
        api_key = request.POST.get('api_key', '').strip()
        api_secret = request.POST.get('api_secret', '').strip()
        
        if api_key and api_secret:
            # Validate API keys format
            if len(api_key) < 10 or len(api_secret) < 10:
                messages.error(request, "Invalid API key format. Please check your credentials.")
            else:
                # Save or update API keys
                if existing_keys:
                    existing_keys.set_api_key(api_key)
                    existing_keys.set_api_secret(api_secret)
                    existing_keys.is_active = True
                    existing_keys.save()
                    messages.success(request, "API keys updated successfully!")
                else:
                    user_keys = UserAPIKeys.objects.create(user=request.user)
                    user_keys.set_api_key(api_key)
                    user_keys.set_api_secret(api_secret)
                    user_keys.save()
                    messages.success(request, "API keys saved successfully!")
                
                # Log activity
                AdminActivityLog.objects.create(
                    admin_user=request.user,
                    action='API_KEYS_SETUP',
                    details={'status': 'success'}
                )
                
                return redirect('index')
        else:
            messages.error(request, "Please provide both API key and secret.")
    
    context = {
        'existing_keys': existing_keys,
        'user_subscription': user_sub,
        'show_skip': not existing_keys,  # Show skip button only for new setup
    }
    
    return render(request, 'subscription/api_keys_setup.html', context)

@login_required
def update_api_keys(request):
    """Allow users to update their API keys"""
    if request.method == 'POST':
        user_keys = UserAPIKeys.objects.filter(user=request.user).first()
        
        if user_keys:
            api_key = request.POST.get('api_key', '').strip()
            api_secret = request.POST.get('api_secret', '').strip()
            
            if api_key:
                user_keys.set_api_key(api_key)
            if api_secret:
                user_keys.set_api_secret(api_secret)
            
            user_keys.save()
            messages.success(request, 'API keys updated successfully!')
        else:
            messages.error(request, 'No API keys found to update.')
        
        return redirect('profile')
    
    return redirect('profile')


# Admin views
@user_passes_test(is_admin)
def admin_dashboard(request):
    """Admin dashboard overview"""
    context = {
        'total_users': User.objects.count(),
        'active_subscriptions': UserSubscription.objects.filter(status='ACTIVE').count(),
        'trial_users': UserSubscription.objects.filter(status='TRIAL').count(),
        'total_revenue': Payment.objects.filter(status='SUCCESS').aggregate(
            total=models.Sum('amount'))['total'] or 0,
        'recent_payments': Payment.objects.filter(status='SUCCESS').order_by('-payment_date')[:10],
        'recent_activities': AdminActivityLog.objects.all()[:20],
    }
    return render(request, 'admin/dashboard.html', context)

@user_passes_test(is_admin)
def manage_users(request):
    """User management page"""
    users = User.objects.all().select_related('subscription').order_by('-date_joined')
    return render(request, 'admin/users.html', {'users': users})

@user_passes_test(is_admin)
def manage_plans(request):
    """Subscription plans management"""
    if request.method == 'POST':
        action = request.POST.get('action')
        
        if action == 'create':
            plan = SubscriptionPlan.objects.create(
                name=request.POST.get('name'),
                plan_type=request.POST.get('plan_type'),
                price=Decimal(request.POST.get('price')),
                duration_days=int(request.POST.get('duration_days')),
                discount_percentage=int(request.POST.get('discount', 0))
            )
            messages.success(request, f"Plan '{plan.name}' created successfully!")
            
            # Log activity
            AdminActivityLog.objects.create(
                admin_user=request.user,
                action='PLAN_CREATED',
                target_model='SubscriptionPlan',
                target_id=plan.id,
                details={'plan_name': plan.name}
            )
            
        elif action == 'update':
            plan_id = request.POST.get('plan_id')
            plan = get_object_or_404(SubscriptionPlan, id=plan_id)
            plan.price = Decimal(request.POST.get('price'))
            plan.is_active = request.POST.get('is_active') == 'true'
            plan.save()
            messages.success(request, f"Plan '{plan.name}' updated!")
            
    plans = SubscriptionPlan.objects.all()
    return render(request, 'admin/plans.html', {'plans': plans})

@user_passes_test(is_admin)
def manage_payments(request):
    """Payment management and refunds"""
    payments = Payment.objects.all().select_related('user', 'subscription_plan')
    
    if request.method == 'POST' and request.POST.get('action') == 'refund':
        payment_id = request.POST.get('payment_id')
        payment = get_object_or_404(Payment, id=payment_id)
        
        if payment.status == 'SUCCESS' and not payment.refund_amount:
            # Process refund through Razorpay
            try:
                refund = razorpay_client.payment.refund(payment.razorpay_payment_id, {
                    'amount': int(payment.amount * 100)
                })
                
                payment.status = 'REFUNDED'
                payment.refund_amount = payment.amount
                payment.refund_date = timezone.now()
                payment.refund_reason = request.POST.get('reason', '')
                payment.save()
                
                # Update user subscription
                user_sub = payment.user.subscription
                if user_sub:
                    user_sub.status = 'CANCELLED'
                    user_sub.save()
                
                messages.success(request, f"Refund processed for {payment.user.username}")
                
                # Log activity
                AdminActivityLog.objects.create(
                    admin_user=request.user,
                    action='PAYMENT_REFUNDED',
                    target_model='Payment',
                    target_id=payment.id,
                    details={
                        'amount': str(payment.amount),
                        'reason': payment.refund_reason
                    }
                )
                
            except Exception as e:
                messages.error(request, f"Refund failed: {str(e)}")
    
    return render(request, 'admin/payments.html', {'payments': payments})

@user_passes_test(is_admin)
def feature_access_control(request):
    """Manage feature access for different subscription levels"""
    if request.method == 'POST':
        # Update feature access settings
        features = FeatureAccess.objects.all()
        for feature in features:
            trial_access = request.POST.get(f'trial_{feature.id}') == 'on'
            paid_access = request.POST.get(f'paid_{feature.id}') == 'on'
            
            feature.default_for_trial = trial_access
            feature.default_for_paid = paid_access
            feature.save()
        
        messages.success(request, "Feature access settings updated!")
    
    features = FeatureAccess.objects.filter(is_active=True)
    return render(request, 'admin/features.html', {'features': features})