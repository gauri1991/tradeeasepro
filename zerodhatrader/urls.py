from django.urls import path
from . import views, subscription_views
from .views import LoginView, ProfileView, InstrumentsView, OrderView, QuoteView

urlpatterns = [
    # Landing page as home
    path('', views.landing, name='landing'),
    
    # Authentication
    path('signin/', views.signin_view, name='signin'),
    path('signup/', views.signup_view, name='signup'),
    path('signout/', views.signout_view, name='signout'),
    path('password-reset/', views.password_reset, name='password_reset'),
    path('password-reset-done/', views.password_reset_done, name='password_reset_done'),
    
    # User Profile
    path('profile/', views.profile, name='profile'),
    
    # Trading dashboard (protected)
    path('dashboard/', views.index, name='index'),
    
    # API endpoints for Kite integration - Make sure these come BEFORE the catch-all
    path('api/login/', LoginView.as_view(), name='kite_login'),
    path('api/save-session/', views.save_session, name='save_session'),
    path('api/profile/', ProfileView.as_view(), name='get_profile'),
    path('api/auth-status/', views.check_auth_status, name='auth_status'),
    
    # Instruments API
    path('api/instruments/', InstrumentsView.as_view(), name='get_instruments'),
    path('api/instruments/download/', views.download_instruments, name='download_instruments'),
    path('api/instruments/debug/', views.debug_instruments, name='debug_instruments'),
    path('api/instruments/csv/', views.instruments_csv, name='instruments_csv'),
    
    # Orders API
    path('api/orders/', OrderView.as_view(), name='get_orders'),
    path('api/orders/place/', OrderView.as_view(), name='place_order'),
    path('api/orders/<str:order_id>/status/', views.get_order_status, name='get_order_status'),
    path('api/orders/<str:order_id>/modify/', views.modify_order, name='modify_order'),
    path('api/orders/<str:order_id>/cancel/', views.cancel_order, name='cancel_order'),
    
    # Quotes and Options API
    path('api/quotes/', QuoteView.as_view(), name='get_quotes'),
    path('api/option-chain/', views.option_chain_analysis, name='option_chain'),
    path('api/nifty-options/', views.get_nifty_options, name='get_nifty_options'),
    path('api/banknifty-options/', views.get_banknifty_options, name='get_banknifty_options'),
    
    # Subscription URLs
    path('subscription/plans/', subscription_views.subscription_plans, name='subscription_plans'),
    path('subscription/checkout/<int:plan_id>/', subscription_views.checkout, name='checkout'),
    path('payment-success/', subscription_views.payment_success, name='payment_success'),
    path('api-keys-setup/', subscription_views.api_keys_setup, name='api_keys_setup'),
    path('update-api-keys/', subscription_views.update_api_keys, name='update_api_keys'),
    
    # Admin URLs
    path('admin/dashboard/', subscription_views.admin_dashboard, name='admin_dashboard'),
    path('admin/users/', subscription_views.manage_users, name='manage_users'),
    path('admin/plans/', subscription_views.manage_plans, name='manage_plans'),
    path('admin/payments/', subscription_views.manage_payments, name='manage_payments'),
    path('admin/features/', subscription_views.feature_access_control, name='feature_access_control'),
    
    # Strategy Calculation APIs
    path('api/strategies/vertical-spread/', views.calculate_vertical_spread, name='calculate_vertical_spread'),
    path('api/strategies/iron-condor/', views.calculate_iron_condor, name='calculate_iron_condor'),
    path('api/strategies/butterfly/', views.calculate_butterfly, name='calculate_butterfly'),
    path('api/strategies/calendar-spread/', views.calculate_calendar_spread, name='calculate_calendar_spread'),
    path('api/strategies/diagonal-spread/', views.calculate_diagonal_spread, name='calculate_diagonal_spread'),
    path('api/strategies/ratio-spread/', views.calculate_ratio_spread, name='calculate_ratio_spread'),
    path('api/strategies/recommendations/', views.get_strategy_recommendations, name='get_strategy_recommendations'),
]