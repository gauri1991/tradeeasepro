# zerodhatrader/models.py
from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone
from datetime import timedelta
import uuid
from cryptography.fernet import Fernet
from django.conf import settings

class Instrument(models.Model):
    instrument_token = models.BigIntegerField(primary_key=True)
    exchange_token = models.IntegerField()
    tradingsymbol = models.CharField(max_length=64)
    name = models.CharField(max_length=128)
    last_price = models.DecimalField(max_digits=20, decimal_places=4, null=True)
    expiry = models.DateField(null=True, blank=True)
    strike = models.DecimalField(max_digits=20, decimal_places=4, null=True)
    tick_size = models.DecimalField(max_digits=10, decimal_places=4)
    lot_size = models.IntegerField()
    instrument_type = models.CharField(max_length=32)
    segment = models.CharField(max_length=32)
    exchange = models.CharField(max_length=16)
    
    def __str__(self):
        return self.tradingsymbol

class ApiCredential(models.Model):
    api_key = models.CharField(max_length=64)
    api_secret = models.CharField(max_length=64)
    access_token = models.CharField(max_length=256, blank=True, null=True)
    token_generated_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    
    def __str__(self):
        return self.api_key
    
# Subscription Plans
class SubscriptionPlan(models.Model):
    PLAN_TYPES = [
        ('MONTHLY', 'Monthly'),
        ('QUARTERLY', 'Quarterly'),
        ('YEARLY', 'Yearly'),
    ]
    
    name = models.CharField(max_length=100)
    plan_type = models.CharField(max_length=20, choices=PLAN_TYPES, unique=True)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    duration_days = models.IntegerField()
    discount_percentage = models.IntegerField(default=0)
    features = models.JSONField(default=dict)  # Store feature flags
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def __str__(self):
        return f"{self.name} - ₹{self.price}"
    
    class Meta:
        ordering = ['duration_days']

# User Subscription
class UserSubscription(models.Model):
    STATUS_CHOICES = [
        ('TRIAL', 'Trial'),
        ('ACTIVE', 'Active'),
        ('EXPIRED', 'Expired'),
        ('CANCELLED', 'Cancelled'),
    ]
    
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='subscription')
    plan = models.ForeignKey(SubscriptionPlan, on_delete=models.SET_NULL, null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='TRIAL')
    trial_start_date = models.DateTimeField(default=timezone.now)
    trial_end_date = models.DateTimeField(null=True, blank=True)
    subscription_start_date = models.DateTimeField(null=True, blank=True)
    subscription_end_date = models.DateTimeField(null=True, blank=True)
    auto_renew = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def save(self, *args, **kwargs):
        if not self.trial_end_date and self.status == 'TRIAL':
            self.trial_end_date = self.trial_start_date + timedelta(days=15)
        super().save(*args, **kwargs)
    
    def is_active(self):
        now = timezone.now()
        if self.status == 'TRIAL':
            return now <= self.trial_end_date
        elif self.status == 'ACTIVE':
            return now <= self.subscription_end_date
        return False
    
    def days_remaining(self):
        if not self.is_active():
            return 0
        
        now = timezone.now()
        if self.status == 'TRIAL':
            delta = self.trial_end_date - now
        else:
            delta = self.subscription_end_date - now
        
        return max(0, delta.days)
    
    def __str__(self):
        return f"{self.user.username} - {self.status}"

# Payment Records
class Payment(models.Model):
    PAYMENT_STATUS = [
        ('PENDING', 'Pending'),
        ('SUCCESS', 'Success'),
        ('FAILED', 'Failed'),
        ('REFUNDED', 'Refunded'),
    ]
    
    payment_id = models.CharField(max_length=100, unique=True, default=uuid.uuid4)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='payments')
    subscription_plan = models.ForeignKey(SubscriptionPlan, on_delete=models.SET_NULL, null=True)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    status = models.CharField(max_length=20, choices=PAYMENT_STATUS, default='PENDING')
    razorpay_order_id = models.CharField(max_length=100, blank=True, null=True)
    razorpay_payment_id = models.CharField(max_length=100, blank=True, null=True)
    razorpay_signature = models.CharField(max_length=255, blank=True, null=True)
    payment_date = models.DateTimeField(auto_now_add=True)
    refund_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    refund_date = models.DateTimeField(null=True, blank=True)
    refund_reason = models.TextField(blank=True)
    metadata = models.JSONField(default=dict)
    
    def __str__(self):
        return f"{self.user.username} - ₹{self.amount} - {self.status}"
    
    class Meta:
        ordering = ['-payment_date']

# User API Keys (Enhanced with encryption)
class UserAPIKeys(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='api_keys')
    encrypted_api_key = models.TextField()
    encrypted_api_secret = models.TextField()
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    last_verified = models.DateTimeField(null=True, blank=True)
    
    def set_api_key(self, api_key):
        f = Fernet(settings.ENCRYPTION_KEY.encode())
        self.encrypted_api_key = f.encrypt(api_key.encode()).decode()
    
    def get_api_key(self):
        f = Fernet(settings.ENCRYPTION_KEY.encode())
        return f.decrypt(self.encrypted_api_key.encode()).decode()
    
    def set_api_secret(self, api_secret):
        f = Fernet(settings.ENCRYPTION_KEY.encode())
        self.encrypted_api_secret = f.encrypt(api_secret.encode()).decode()
    
    def get_api_secret(self):
        f = Fernet(settings.ENCRYPTION_KEY.encode())
        return f.decrypt(self.encrypted_api_secret.encode()).decode()
    
    def __str__(self):
        return f"API Keys for {self.user.username}"

# Feature Access Control
class FeatureAccess(models.Model):
    name = models.CharField(max_length=100, unique=True)
    code = models.CharField(max_length=50, unique=True)  # e.g., 'view_options', 'place_orders'
    description = models.TextField()
    default_for_trial = models.BooleanField(default=False)
    default_for_paid = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)
    
    def __str__(self):
        return self.name
    
    class Meta:
        verbose_name_plural = "Feature Access"

# Admin Activity Log
class AdminActivityLog(models.Model):
    admin_user = models.ForeignKey(User, on_delete=models.CASCADE)
    action = models.CharField(max_length=100)
    target_model = models.CharField(max_length=50, blank=True)
    target_id = models.IntegerField(null=True, blank=True)
    details = models.JSONField(default=dict)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)
    
    def __str__(self):
        return f"{self.admin_user.username} - {self.action} - {self.timestamp}"
    
    class Meta:
        ordering = ['-timestamp']