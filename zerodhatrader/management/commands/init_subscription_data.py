from django.core.management.base import BaseCommand
from zerodhatrader.models import SubscriptionPlan, FeatureAccess

class Command(BaseCommand):
    help = 'Initialize subscription plans and features'

    def handle(self, *args, **kwargs):
        # Create subscription plans
        plans = [
            {
                'name': 'Monthly Plan',
                'plan_type': 'MONTHLY',
                'price': 1000,
                'duration_days': 30,
                'discount_percentage': 0,
            },
            {
                'name': 'Quarterly Plan',
                'plan_type': 'QUARTERLY',
                'price': 2700,
                'duration_days': 90,
                'discount_percentage': 10,
            },
            {
                'name': 'Yearly Plan',
                'plan_type': 'YEARLY',
                'price': 9000,
                'duration_days': 365,
                'discount_percentage': 25,
            },
        ]
        
        for plan_data in plans:
            SubscriptionPlan.objects.get_or_create(
                plan_type=plan_data['plan_type'],
                defaults=plan_data
            )
        
        # Create feature access controls
        features = [
            {
                'name': 'View Market Data',
                'code': 'view_market_data',
                'description': 'Access to real-time market data',
                'default_for_trial': True,
                'default_for_paid': True,
            },
            {
                'name': 'Place Orders',
                'code': 'place_orders',
                'description': 'Ability to place buy/sell orders',
                'default_for_trial': False,
                'default_for_paid': True,
            },
            {
                'name': 'Options Trading',
                'code': 'options_trading',
                'description': 'Access to options chain and trading',
                'default_for_trial': False,
                'default_for_paid': True,
            },
            {
                'name': 'Advanced Analytics',
                'code': 'advanced_analytics',
                'description': 'Access to advanced charts and analytics',
                'default_for_trial': False,
                'default_for_paid': True,
            },
            {
                'name': 'API Access',
                'code': 'api_access',
                'description': 'Programmatic API access',
                'default_for_trial': False,
                'default_for_paid': True,
            },
        ]
        
        for feature_data in features:
            FeatureAccess.objects.get_or_create(
                code=feature_data['code'],
                defaults=feature_data
            )
        
        self.stdout.write(self.style.SUCCESS('Successfully initialized subscription data'))