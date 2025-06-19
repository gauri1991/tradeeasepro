from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from zerodhatrader.models import UserSubscription, UserAPIKeys, SubscriptionPlan
from django.utils import timezone
from datetime import timedelta

class Command(BaseCommand):
    help = 'Create demo account for testing'

    def handle(self, *args, **kwargs):
        # Create demo user
        demo_user, created = User.objects.get_or_create(
            username='demo',
            defaults={
                'email': 'demo@tradeease.com',
                'first_name': 'Demo',
                'last_name': 'User',
            }
        )
        
        if created:
            demo_user.set_password('demo123')
            demo_user.save()
        
        # Create active subscription
        yearly_plan = SubscriptionPlan.objects.filter(plan_type='YEARLY').first()
        if yearly_plan:
            demo_sub, _ = UserSubscription.objects.get_or_create(
                user=demo_user,
                defaults={
                    'plan': yearly_plan,
                    'status': 'ACTIVE',
                    'subscription_start_date': timezone.now(),
                    'subscription_end_date': timezone.now() + timedelta(days=365),
                }
            )
        
        # Create demo API keys
        demo_keys, _ = UserAPIKeys.objects.get_or_create(
            user=demo_user
        )
        demo_keys.set_api_key('DEMO_API_KEY_12345')
        demo_keys.set_api_secret('DEMO_API_SECRET_67890')
        demo_keys.save()
        
        self.stdout.write(self.style.SUCCESS('Demo account created/updated successfully'))
        self.stdout.write('Email: demo@tradeease.com')
        self.stdout.write('Password: demo123')