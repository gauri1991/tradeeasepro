# zerodhatrader/views.py
import logging
import traceback
import datetime
import csv
import io
from django.shortcuts import render, redirect
from django.http import HttpRequest
from django.http import JsonResponse, HttpResponse
from django.views import View
from django.utils import timezone
from kiteconnect import KiteConnect
from django.views.decorators.csrf import csrf_exempt, ensure_csrf_cookie
import json
from django.utils.decorators import method_decorator
from .models import ApiCredential, Instrument
from django.views.decorators.http import require_http_methods
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.contrib import messages
from django.views.decorators.csrf import csrf_protect
from django.contrib.auth.decorators import login_required
from django.views.decorators.cache import never_cache
import re
from django.contrib.auth.views import PasswordResetView, PasswordResetDoneView
from django.urls import reverse_lazy
from django.core.mail import send_mail
from django.conf import settings
from django.shortcuts import render, redirect
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.contrib.auth.models import User
from .models import UserSubscription, UserAPIKeys
from django.utils import timezone
from datetime import timedelta
from django.contrib.sessions.models import Session
from rest_framework.decorators import api_view
from rest_framework.response import Response
from .calculations import OptionsStrategyManager
from decimal import Decimal
import logging

logger = logging.getLogger(__name__)

# Initialize the strategy manager (add after existing imports)
strategy_manager = OptionsStrategyManager()


def get_kite_client(with_token=True):
    """Get an initialized KiteConnect client"""
    try:
        # Get active API credentials
        cred = ApiCredential.objects.filter(is_active=True).first()
        if not cred:
            return None
            
        kite = KiteConnect(api_key=cred.api_key)
        
        if with_token and cred.access_token:
            kite.set_access_token(cred.access_token)
            
        return kite
    except Exception as e:
        logger.error(f"Error initializing Kite client: {e}")
        return None

class LoginView(View):
    """View to handle login flow"""
    
    def get(self, request):
        # If we have a request token in the URL, process it
        request_token = request.GET.get('request_token')
        
        if request_token:
            try:
                # Get API credentials
                cred = ApiCredential.objects.filter(is_active=True).first()
                if not cred:
                    return JsonResponse({'status': 'error', 'message': 'No API credentials found'})
                
                # Initialize Kite client
                kite = KiteConnect(api_key=cred.api_key)
                
                # Exchange request token for access token
                data = kite.generate_session(request_token, api_secret=cred.api_secret)
                
                # Save access token
                cred.access_token = data['access_token']
                cred.token_generated_at = timezone.now()
                cred.save()
                
                return JsonResponse({'status': 'success', 'message': 'Login successful'})
            except Exception as e:
                return JsonResponse({'status': 'error', 'message': str(e)})
        else:
            # Generate login URL and redirect user
            kite = get_kite_client(with_token=False)
            if not kite:
                return JsonResponse({'status': 'error', 'message': 'No API credentials found'})
                
            login_url = kite.login_url()
            return redirect(login_url)
    
    
class InstrumentsView(View):
    """View to manage instruments"""
    
    def get(self, request):
        """Get instruments - either all or filtered"""
        try:
            filter_type = request.GET.get('filter', None)
            
            if filter_type == 'nifty':
                instruments = Instrument.objects.filter(tradingsymbol__contains='NIFTY', segment='NFO-OPT')
            elif filter_type == 'banknifty':
                instruments = Instrument.objects.filter(tradingsymbol__contains='BANKNIFTY', segment='NFO-OPT')
            else:
                instruments = Instrument.objects.all()
                
            # Convert to list of dicts for JSON response
            instruments_list = []
            for instr in instruments:
                instruments_list.append({
                    'instrument_token': instr.instrument_token,
                    'exchange_token': instr.exchange_token,
                    'tradingsymbol': instr.tradingsymbol,
                    'name': instr.name,
                    'last_price': float(instr.last_price) if instr.last_price else None,
                    'expiry': instr.expiry.isoformat() if instr.expiry else None,
                    'strike': float(instr.strike) if instr.strike else None,
                    'tick_size': float(instr.tick_size) if instr.tick_size else None,
                    'lot_size': instr.lot_size,
                    'instrument_type': instr.instrument_type,
                    'segment': instr.segment,
                    'exchange': instr.exchange
                })
            
            # Debug log the count
            print(f"Found {len(instruments_list)} instruments")
            
            return JsonResponse({
                'status': 'success',
                'instruments': instruments_list
            })
        except Exception as e:
            import traceback
            traceback.print_exc()
            return JsonResponse({
                'status': 'error',
                'message': str(e)
            })
    
    def post(self, request):
        """Download instruments from Kite and save to database"""
        try:
            kite = get_kite_client()
            if not kite:
                return JsonResponse({'status': 'error', 'message': 'Not authenticated'})
                
            # Download all instruments
            all_instruments = kite.instruments()
            
            # Clear existing instruments
            Instrument.objects.all().delete()
            
            # Bulk create new instruments
            instruments_to_create = []
            for instr in all_instruments:
                # Handle None values for expiry
                expiry = None
                if instr.get('expiry') and instr['expiry'] != '':
                    expiry = instr['expiry']
                    
                instruments_to_create.append(Instrument(
                    instrument_token=instr['instrument_token'],
                    exchange_token=instr['exchange_token'],
                    tradingsymbol=instr['tradingsymbol'],
                    name=instr.get('name', ''),
                    last_price=instr.get('last_price', 0),
                    expiry=expiry,
                    strike=instr.get('strike', 0),
                    tick_size=instr.get('tick_size', 0),
                    lot_size=instr.get('lot_size', 0),
                    instrument_type=instr.get('instrument_type', ''),
                    segment=instr.get('segment', ''),
                    exchange=instr.get('exchange', '')
                ))
            
            # Bulk create
            Instrument.objects.bulk_create(instruments_to_create)
            
            return JsonResponse({
                'status': 'success', 
                'message': f'Successfully imported {len(instruments_to_create)} instruments'
            })
        except Exception as e:
            logger.error(f"Error downloading instruments: {e}")
            return JsonResponse({'status': 'error', 'message': str(e)})
    
    def get_csv(self, request):
        """Export instruments as CSV"""
        try:
            filter_type = request.GET.get('filter', None)
            
            if filter_type == 'nifty':
                instruments = Instrument.objects.filter(tradingsymbol__contains='NIFTY', segment='NFO-OPT')
            elif filter_type == 'banknifty':
                instruments = Instrument.objects.filter(tradingsymbol__contains='BANKNIFTY', segment='NFO-OPT')
            else:
                instruments = Instrument.objects.all()
                
            # Create CSV file
            response = HttpResponse(content_type='text/csv')
            response['Content-Disposition'] = 'attachment; filename="instruments.csv"'
            
            writer = csv.writer(response)
            # Write header
            writer.writerow(['instrument_token', 'exchange_token', 'tradingsymbol', 
                           'name', 'last_price', 'expiry', 'strike', 
                           'tick_size', 'lot_size', 'instrument_type', 'segment', 
                           'exchange'])
            
            # Write data
            for instr in instruments:
                writer.writerow([
                    instr.instrument_token,
                    instr.exchange_token,
                    instr.tradingsymbol,
                    instr.name,
                    instr.last_price,
                    instr.expiry,
                    instr.strike,
                    instr.tick_size,
                    instr.lot_size,
                    instr.instrument_type,
                    instr.segment,
                    instr.exchange
                ])
                
            return response
        except Exception as e:
            logger.error(f"Error exporting instruments: {e}")
            return JsonResponse({'status': 'error', 'message': str(e)})
    
    
        """Download instruments from Kite Connect API"""
        try:
            kite = get_kite_client()
            if not kite:
                return JsonResponse({'status': 'error', 'message': 'Not authenticated'})
                
            # Download all instruments
            all_instruments = kite.instruments()
            
            # Clear existing instruments
            Instrument.objects.all().delete()
            
            # Process and save instruments in batches
            batch_size = 1000
            total_count = 0
            
            for i in range(0, len(all_instruments), batch_size):
                batch = all_instruments[i:i+batch_size]
                instruments_to_create = []
                
                for instr in batch:
                    # Handle None values for expiry
                    expiry = None
                    if instr.get('expiry') and instr['expiry'] != '':
                        expiry = instr['expiry']
                        
                    instruments_to_create.append(Instrument(
                        instrument_token=instr['instrument_token'],
                        exchange_token=instr.get('exchange_token', 0),
                        tradingsymbol=instr['tradingsymbol'],
                        name=instr.get('name', ''),
                        last_price=instr.get('last_price', 0),
                        expiry=expiry,
                        strike=instr.get('strike', 0),
                        tick_size=instr.get('tick_size', 0),
                        lot_size=instr.get('lot_size', 0),
                        instrument_type=instr.get('instrument_type', ''),
                        segment=instr.get('segment', ''),
                        exchange=instr.get('exchange', '')
                    ))
                
                Instrument.objects.bulk_create(instruments_to_create)
                total_count += len(instruments_to_create)
            
            return JsonResponse({
                'status': 'success', 
                'message': f'Successfully imported {total_count} instruments',
                'count': total_count
            })
        except Exception as e:
            return JsonResponse({'status': 'error', 'message': str(e)})


# zerodhatrader/views.py (additional views)

class ProfileView(View):
    """View to get user profile"""
    
    def get(self, request):
        """Get user profile"""
        try:
            kite = get_kite_client()
            if not kite:
                return JsonResponse({'status': 'error', 'message': 'Not authenticated'})
                
            profile = kite.profile()
            return JsonResponse(profile)
        
        except Exception as e:
            logger.error(f"Error fetching profile: {e}")
            return JsonResponse({'status': 'error', 'message': str(e)})


@login_required(login_url='signin')
def index(request):
    """Main trading interface view"""
    return render(request, 'zerodhatrader/index.html')

# Add this decorator to ensure CSRF cookie is set
@method_decorator(ensure_csrf_cookie, name='dispatch')
class OrderView(View):
    """View to handle orders"""
    
    def get(self, request):
        """Get all orders"""
        try:
            kite = get_kite_client()
            if not kite:
                return JsonResponse({'status': 'error', 'message': 'Not authenticated'})
                
            orders = kite.orders()
            return JsonResponse({'status': 'success', 'data': orders})
        except Exception as e:
            logger.error(f"Error fetching orders: {e}")
            return JsonResponse({'status': 'error', 'message': str(e)})
    
    def post(self, request):
        """Place an order"""
        try:
            
            # Print to console directly for immediate feedback
            print("Order placement request received")
            data = json.loads(request.body)
            
            # Log and print the incoming data
            print(f"Order data: {data}")
            logger.info(f"Order placement request: {data}")
            
            # Validate required fields
            required_fields = ['tradingsymbol', 'exchange', 'transaction_type', 'quantity', 'product', 'order_type']
            for field in required_fields:
                if field not in data:
                    return JsonResponse({'status': 'error', 'message': f'Missing required field: {field}'})
            
            # Validate order_type
            valid_order_types = ['MARKET', 'LIMIT', 'SL', 'SL-M']
            if data['order_type'] not in valid_order_types:
                return JsonResponse({
                    'status': 'error', 
                    'message': f'Invalid order type: {data["order_type"]}. Valid types are: {", ".join(valid_order_types)}'
                })
            
            # Validate additional parameters based on order type
            if data['order_type'] in ['LIMIT', 'SL'] and 'price' not in data:
                logger.warning(f"Price not provided for {data['order_type']} order, defaulting to last price")
                # You could return an error here instead if you want to enforce this
            
            if data['order_type'] in ['SL', 'SL-M'] and 'trigger_price' not in data:
                logger.warning(f"Trigger price not provided for {data['order_type']} order, defaulting to last price")
                # You could return an error here instead if you want to enforce this
            
            kite = get_kite_client()
            if not kite:
                return JsonResponse({'status': 'error', 'message': 'Not authenticated'})
            
            # Prepare order parameters
            order_params = {
                'tradingsymbol': data['tradingsymbol'],
                'exchange': data['exchange'],
                'transaction_type': data['transaction_type'],
                'quantity': data['quantity'],
                'product': data['product'],
                'order_type': data['order_type'],
                'variety': data.get('variety', 'regular'),
                'validity': data.get('validity', 'DAY'),
                'tag': data.get('tag', 'TradeEase')
            }
            
            # Add price only if needed for this order type
            if data['order_type'] in ['LIMIT', 'SL'] and 'price' in data and data['price'] is not None:
                order_params['price'] = data['price']
            
            # Add trigger_price only if needed for this order type
            if data['order_type'] in ['SL', 'SL-M'] and 'trigger_price' in data and data['trigger_price'] is not None:
                order_params['trigger_price'] = data['trigger_price']
            
            # Add disclosed_quantity if provided
            if 'disclosed_quantity' in data and data['disclosed_quantity'] is not None:
                order_params['disclosed_quantity'] = data['disclosed_quantity']
            
            logger.info(f"Placing order with parameters: {order_params}")
            
            # Place the order with the prepared parameters
            order_id = kite.place_order(**order_params)
            
            logger.info(f"Order placed successfully: {order_id}")
            return JsonResponse({'status': 'success', 'order_id': order_id})
        
        except Exception as e:
            # Get full traceback for better debugging
            error_traceback = traceback.format_exc()
            print(f"Error placing order: {e}")
            print(f"Traceback: {error_traceback}")
            logger.error(f"Error placing order: {e}")
            logger.error(f"Traceback: {error_traceback}")
            return JsonResponse({'status': 'error', 'message': str(e), 'traceback': error_traceback})
    
    def get(self, request, order_id=None):
        """Get orders or a specific order if order_id is provided"""
        try:
            # If an order_id is provided, get that specific order
            if order_id:
                return self.get_specific_order(request, order_id)
            
            # Otherwise, get all orders
            kite = get_kite_client()
            if not kite:
                return JsonResponse({'status': 'error', 'message': 'Not authenticated'})
                    
            orders = kite.orders()
            return JsonResponse({'status': 'success', 'data': orders})
        except Exception as e:
            logger.error(f"Error fetching orders: {e}")
            return JsonResponse({'status': 'error', 'message': str(e)})
        
    def get_specific_order(self, request, order_id):
        """Get a specific order by ID"""
        try:
            kite = get_kite_client()
            if not kite:
                return JsonResponse({'status': 'error', 'message': 'Not authenticated'})
                
            # Get all orders
            orders = kite.orders()
            
            # Find the specific order
            order = next((o for o in orders if o['order_id'] == order_id), None)
            
            if not order:
                return JsonResponse({
                    'status': 'error', 
                    'message': f'Order with ID {order_id} not found'
                })
                
            return JsonResponse({
                'status': 'success',
                'data': order
            })
        except Exception as e:
            logger.error(f"Error fetching order status: {e}")
            return JsonResponse({
                'status': 'error', 
                'message': str(e)
            })
            
    # Add to OrderView class in views.py

    def modify_order(self, request, order_id):
        """Modify an existing order"""
        try:
            data = json.loads(request.body)
            
            # Validate required fields
            required_fields = ['quantity']
            for field in required_fields:
                if field not in data:
                    return JsonResponse({'status': 'error', 'message': f'Missing required field: {field}'})
            
            kite = get_kite_client()
            if not kite:
                return JsonResponse({'status': 'error', 'message': 'Not authenticated'})
            
            # Get order details
            try:
                # Find the order
                orders = kite.orders()
                order = next((o for o in orders if o['order_id'] == order_id), None)
                
                if not order:
                    return JsonResponse({
                        'status': 'error', 
                        'message': f'Order with ID {order_id} not found'
                    })
                    
                # Check if order can be modified
                if order['status'] not in ['OPEN', 'TRIGGER PENDING']:
                    return JsonResponse({
                        'status': 'error', 
                        'message': f'Order with status {order["status"]} cannot be modified'
                    })
            except Exception as e:
                logger.error(f"Error getting order details: {e}")
                return JsonResponse({'status': 'error', 'message': str(e)})
            
            # Build modification parameters
            params = {
                'order_id': order_id,
                'quantity': data['quantity']
            }
            
            # Add price if provided for LIMIT order
            if 'price' in data and data['price'] is not None and order['order_type'] in ['LIMIT', 'SL']:
                params['price'] = data['price']
                
            # Add trigger_price if provided for SL or SL-M order
            if 'trigger_price' in data and data['trigger_price'] is not None and order['order_type'] in ['SL', 'SL-M']:
                params['trigger_price'] = data['trigger_price']
            
            # Modify the order
            modified_order_id = kite.modify_order(
                variety=order['variety'],
                **params
            )
            
            # Get updated order details
            orders = kite.orders()
            updated_order = next((o for o in orders if o['order_id'] == modified_order_id), None)
            
            return JsonResponse({
                'status': 'success',
                'message': 'Order modified successfully',
                'data': updated_order
            })
            
        except Exception as e:
            logger.error(f"Error modifying order: {e}")
            return JsonResponse({'status': 'error', 'message': str(e)})

    def cancel_order(self, request, order_id):
        """Cancel an order"""
        try:
            kite = get_kite_client()
            if not kite:
                return JsonResponse({'status': 'error', 'message': 'Not authenticated'})
            
            # Find the order to get its variety
            orders = kite.orders()
            order = next((o for o in orders if o['order_id'] == order_id), None)
            
            if not order:
                return JsonResponse({
                    'status': 'error', 
                    'message': f'Order with ID {order_id} not found'
                })
            
            # Cancel the order
            cancelled_order_id = kite.cancel_order(
                variety=order['variety'],
                order_id=order_id
            )
            
            return JsonResponse({
                'status': 'success',
                'message': 'Order cancelled successfully',
                'data': {'order_id': cancelled_order_id}
            })
            
        except Exception as e:
            logger.error(f"Error cancelling order: {e}")
            return JsonResponse({'status': 'error', 'message': str(e)})

class QuoteView(View):
    """View to get quotes"""
    
    def get(self, request):
        """Get quotes for instruments"""
        try:
            # Get instrument tokens from query params
            instruments = request.GET.get('i', '').split(',')
            
            if not instruments or instruments[0] == '':
                return JsonResponse({'status': 'error', 'message': 'No instruments provided'})
            
            kite = get_kite_client()
            if not kite:
                return JsonResponse({'status': 'error', 'message': 'Not authenticated'})
                
            # Get quotes
            quotes = kite.quote(instruments)
            
            return JsonResponse({'status': 'success', 'quotes': quotes})
        
        except Exception as e:
            logger.error(f"Error fetching quotes: {e}")
            return JsonResponse({'status': 'error', 'message': str(e)})
        
def get_nifty_options(request):
    """Get Nifty options filtered by expiry dates"""
    try:
        # Get optional expiry date filter
        expiry_date = request.GET.get('expiry', None)
        
        # Base query for Nifty options
        query = {
            'tradingsymbol__startswith': 'NIFTY',
            'segment': 'NFO-OPT'
        }
        
        # Add expiry filter if provided
        if expiry_date:
            query['expiry'] = expiry_date
        
        # Get instruments
        instruments = Instrument.objects.filter(**query)
        
        # Get unique expiry dates for dropdown
        expiry_dates = Instrument.objects.filter(
            tradingsymbol__startswith='NIFTY',
            segment='NFO-OPT'
        ).values_list('expiry', flat=True).distinct().order_by('expiry')
        
        return JsonResponse({
            'status': 'success',
            'instruments': list(instruments.values()),
            'expiry_dates': list(expiry_dates)
        })
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)})

def get_banknifty_options(request):
    """Get Bank Nifty options filtered by expiry dates"""
    try:
        # Get optional expiry date filter
        expiry_date = request.GET.get('expiry', None)
        
        # Base query for Bank Nifty options
        query = {
            'tradingsymbol__startswith': 'BANKNIFTY',
            'segment': 'NFO-OPT'
        }
        
        # Add expiry filter if provided
        if expiry_date:
            query['expiry'] = expiry_date
        
        # Get instruments
        instruments = Instrument.objects.filter(**query)
        
        # Get unique expiry dates for dropdown
        expiry_dates = Instrument.objects.filter(
            tradingsymbol__startswith='BANKNIFTY',
            segment='NFO-OPT'
        ).values_list('expiry', flat=True).distinct().order_by('expiry')
        
        return JsonResponse({
            'status': 'success',
            'instruments': list(instruments.values()),
            'expiry_dates': list(expiry_dates)
        })
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)})
    


def check_auth_status(request):
    """Check if there's a valid authentication token saved in the database"""
    try:
        # Get active API credential
        cred = ApiCredential.objects.filter(is_active=True).first()
        
        if cred and cred.access_token:
            # Try to validate the token by making a simple API call
            try:
                kite = KiteConnect(api_key=cred.api_key)
                kite.set_access_token(cred.access_token)
                # Try a simple API call to check if token is valid
                kite.margins()
                
                # If we get here, token is valid
                return JsonResponse({
                    'status': 'authenticated',
                    'access_token': cred.access_token,
                    'message': 'Authentication token is valid'
                })
            except Exception as e:
                # Token is invalid or expired
                logger.error(f"Invalid token: {e}")
                # Clear the invalid token
                cred.access_token = None
                cred.save()
                
                return JsonResponse({
                    'status': 'unauthenticated',
                    'message': 'Authentication token is invalid or expired'
                })
        else:
            return JsonResponse({
                'status': 'unauthenticated',
                'message': 'No authentication token found'
            })
    except Exception as e:
        return JsonResponse({
            'status': 'error',
            'message': str(e)
        }, status=500)

@csrf_exempt
def save_session(request):
    """Save session token to database"""
    if request.method != 'POST':
        return JsonResponse({
            'status': 'error',
            'message': 'Only POST method is allowed'
        }, status=405)
    
    try:
        # Log incoming request for debugging
        print("Received save-session request")
        
        # Parse request data
        data = json.loads(request.body)
        request_token = data.get('request_token')
        
        print(f"Request token received: {request_token}")
        
        if not request_token:
            return JsonResponse({
                'status': 'error',
                'message': 'No request token provided'
            }, status=400)
        
        # Get active API credential
        cred = ApiCredential.objects.filter(is_active=True).first()
        
        if not cred:
            return JsonResponse({
                'status': 'error',
                'message': 'No API credentials found'
            }, status=400)
        
        # Exchange request token for access token using KiteConnect
        kite = KiteConnect(api_key=cred.api_key)
        try:
            session_data = kite.generate_session(request_token, api_secret=cred.api_secret)
            print(f"Session data: {session_data}")
        except Exception as e:
            print(f"Error generating session: {e}")
            return JsonResponse({
                'status': 'error',
                'message': f'Error generating session: {str(e)}'
            }, status=500)
        
        # Save access token to database
        cred.access_token = session_data['access_token']
        cred.token_generated_at = timezone.now()
        cred.save()
        
        return JsonResponse({
            'status': 'success',
            'message': 'Session token saved successfully',
            'access_token': session_data['access_token']
        })
    except Exception as e:
        # Log the full exception for debugging
        import traceback
        traceback.print_exc()
        return JsonResponse({
            'status': 'error',
            'message': str(e)
        }, status=500)

# Add this as a standalone function
def download_instruments(request):
    """Download instruments from Kite Connect API"""
    try:
        kite = get_kite_client()
        if not kite:
            return JsonResponse({'status': 'error', 'message': 'Not authenticated'})
            
        # Download all instruments
        all_instruments = kite.instruments()
        print(f"Downloaded {len(all_instruments)} instruments from Kite API")
        
        # Clear existing instruments
        Instrument.objects.all().delete()
        print("Cleared existing instruments")
        
        # Process and save instruments
        instruments_to_create = []
        for instr in all_instruments:
            # Handle expiry
            expiry = None
            if instr.get('expiry') and instr['expiry'] != '':
                expiry = instr['expiry']
                
            instruments_to_create.append(Instrument(
                instrument_token=instr['instrument_token'],
                exchange_token=instr.get('exchange_token', 0),
                tradingsymbol=instr['tradingsymbol'],
                name=instr.get('name', ''),
                last_price=instr.get('last_price', 0),
                expiry=expiry,
                strike=instr.get('strike', 0),
                tick_size=instr.get('tick_size', 0),
                lot_size=instr.get('lot_size', 0),
                instrument_type=instr.get('instrument_type', ''),
                segment=instr.get('segment', ''),
                exchange=instr.get('exchange', '')
            ))
        
        # Save to database in batches
        batch_size = 1000
        for i in range(0, len(instruments_to_create), batch_size):
            batch = instruments_to_create[i:i+batch_size]
            Instrument.objects.bulk_create(batch)
            print(f"Saved batch {i//batch_size + 1}/{(len(instruments_to_create)-1)//batch_size + 1}")
        
        # Final count check
        final_count = Instrument.objects.count()
        print(f"Final count in database: {final_count}")
        
        return JsonResponse({
            'status': 'success',
            'message': f'Successfully imported {final_count} instruments',
            'count': final_count
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({'status': 'error', 'message': str(e)})

# zerodhatrader/views.py

def instruments_csv(request):
    """Export instruments as CSV - standalone function"""
    try:
        filter_type = request.GET.get('filter', None)
        
        if filter_type == 'nifty':
            instruments = Instrument.objects.filter(tradingsymbol__contains='NIFTY', segment='NFO-OPT')
        elif filter_type == 'banknifty':
            instruments = Instrument.objects.filter(tradingsymbol__contains='BANKNIFTY', segment='NFO-OPT')
        else:
            instruments = Instrument.objects.all()
            
        # Create CSV file
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="instruments.csv"'
        
        writer = csv.writer(response)
        # Write header
        writer.writerow(['instrument_token', 'exchange_token', 'tradingsymbol', 
                        'name', 'last_price', 'expiry', 'strike', 
                        'tick_size', 'lot_size', 'instrument_type', 'segment', 
                        'exchange'])
        
        # Write data
        for instr in instruments:
            writer.writerow([
                instr.instrument_token,
                instr.exchange_token,
                instr.tradingsymbol,
                instr.name,
                instr.last_price,
                instr.expiry,
                instr.strike,
                instr.tick_size,
                instr.lot_size,
                instr.instrument_type,
                instr.segment,
                instr.exchange
            ])
            
        return response
    except Exception as e:
        logger.error(f"Error exporting instruments: {e}")
        return JsonResponse({'status': 'error', 'message': str(e)})

def debug_instruments(request):
    """Debug view to check instrument count"""
    count = Instrument.objects.count()
    return JsonResponse({
        'status': 'success',
        'count': count,
        'message': f'Found {count} instruments in database'
    })
    
# And for option chain
@ensure_csrf_cookie
def option_chain_analysis(request):
    """View for the Option Chain Analysis page"""
    return render(request, 'zerodhatrader/option_chain.html')

def get_order_status(request, order_id):
    """Get status of a specific order"""
    print(f"Getting status for order: {order_id}")  # Add this
    try:
        kite = get_kite_client()
        if not kite:
            return JsonResponse({'status': 'error', 'message': 'Not authenticated'})
            
        # Get all orders
        orders = kite.orders()
        print(f"Found {len(orders)} orders")  # Add this
        # Find the specific order
        order = next((o for o in orders if o['order_id'] == order_id), None)
        
        if not order:
            return JsonResponse({
                'status': 'error', 
                'message': f'Order with ID {order_id} not found'
            })
            
        return JsonResponse({
            'status': 'success',
            'data': order  # Ensure data key for proper response format
        })
    except Exception as e:
        logger.error(f"Error fetching order status: {e}")
        return JsonResponse({
            'status': 'error', 
            'message': str(e)
        })

@csrf_exempt
def modify_order(request, order_id):
    """Modify an existing order - real-time exchange update"""
    if request.method != 'POST':
        return JsonResponse({'status': 'error', 'message': 'Only POST method allowed'})
        
    try:
        data = json.loads(request.body)
        
        kite = get_kite_client()
        if not kite:
            return JsonResponse({'status': 'error', 'message': 'Not authenticated'})
        
        # Get current order details
        orders = kite.orders()
        order = next((o for o in orders if o['order_id'] == order_id), None)
        
        if not order:
            return JsonResponse({
                'status': 'error', 
                'message': f'Order with ID {order_id} not found'
            })
            
        # Check if order can be modified
        if order['status'] not in ['OPEN', 'TRIGGER PENDING']:
            return JsonResponse({
                'status': 'error', 
                'message': f'Order with status {order["status"]} cannot be modified'
            })
        
        # Build modification parameters
        modify_params = {
            'order_id': order_id,
            'quantity': data.get('quantity', order['quantity'])
        }
        
        # Handle different modification types
        if 'price' in data and data['price'] is not None:
            modify_params['price'] = data['price']
            
        if 'order_type' in data:
            modify_params['order_type'] = data['order_type']
            
        if 'trigger_price' in data and data['trigger_price'] is not None:
            modify_params['trigger_price'] = data['trigger_price']
        
        # Modify at exchange level
        modified_order_id = kite.modify_order(
            variety=order['variety'],
            **modify_params
        )
        
        # Get updated order details from exchange
        updated_orders = kite.orders()
        updated_order = next((o for o in updated_orders if o['order_id'] == modified_order_id), None)
        
        return JsonResponse({
            'status': 'success',
            'message': 'Order modified successfully at exchange',
            'data': updated_order
        })
        
    except Exception as e:
        logger.error(f"Error modifying order: {e}")
        return JsonResponse({'status': 'error', 'message': str(e)})

@csrf_exempt  
def cancel_order(request, order_id):
    """Cancel an order"""
    if request.method != 'POST':
        return JsonResponse({'status': 'error', 'message': 'Only POST method allowed'})
        
    try:
        kite = get_kite_client()
        if not kite:
            return JsonResponse({'status': 'error', 'message': 'Not authenticated'})
        
        # Find the order to get its variety
        orders = kite.orders()
        order = next((o for o in orders if o['order_id'] == order_id), None)
        
        if not order:
            return JsonResponse({
                'status': 'error', 
                'message': f'Order with ID {order_id} not found'
            })
        
        # Cancel the order at exchange
        cancelled_order_id = kite.cancel_order(
            variety=order['variety'],
            order_id=order_id
        )
        
        # Get updated order status
        updated_orders = kite.orders()
        updated_order = next((o for o in updated_orders if o['order_id'] == cancelled_order_id), None)
        
        return JsonResponse({
            'status': 'success',
            'message': 'Order cancelled successfully',
            'data': updated_order
        })
        
    except Exception as e:
        logger.error(f"Error cancelling order: {e}")
        return JsonResponse({'status': 'error', 'message': str(e)})


@csrf_protect
@never_cache
def signin_view(request):
    """Enhanced signin with proper flow redirection"""
    
    # Clear unwanted messages
    storage = messages.get_messages(request)
    if storage:
        # Remove logout/welcome messages that shouldn't appear on signin
        for message in storage:
            pass  # This consumes the messages
        storage.used = True
        
    if request.user.is_authenticated:
        return redirect_after_login(request.user)
    
    if request.method == 'POST':
        email = request.POST.get('email', '').strip()
        password = request.POST.get('password', '')
        remember = request.POST.get('remember')
        
        # Validate inputs
        if not email or not password:
            messages.error(request, 'Please enter both email and password.')
            return render(request, 'zerodhatrader/signin.html')
        
        # Email validation
        email_regex = r'^[^\s@]+@[^\s@]+\.[^\s@]+$'
        if not re.match(email_regex, email):
            messages.error(request, 'Please enter a valid email address.')
            return render(request, 'zerodhatrader/signin.html')
        
        try:
            # Try to authenticate with email
            user = User.objects.get(email=email)
            auth_user = authenticate(request, username=user.username, password=password)
        except User.DoesNotExist:
            # Try username authentication
            auth_user = authenticate(request, username=email, password=password)
        
        if auth_user is not None:
            login(request, auth_user)
            
            # Set session expiry
            if remember:
                request.session.set_expiry(60 * 60 * 24 * 30)  # 30 days
            else:
                request.session.set_expiry(0)  # Browser session
            
            messages.success(request, f'Welcome back, {auth_user.first_name or auth_user.username}!')
            
            # Check for 'next' parameter
            next_url = request.GET.get('next')
            if next_url:
                return redirect(next_url)
            
            # Redirect based on user status
            return redirect_after_login(auth_user, request)
        else:
            messages.error(request, 'Invalid email or password.')
    
    # Check if it's a demo login request
    if request.GET.get('demo') == 'true':
        messages.info(request, 'Use demo@tradeease.com / demo123 to try the platform')
    
    return render(request, 'zerodhatrader/signin.html')

@csrf_protect
@never_cache
def signup_view(request):
    """Enhanced signup with immediate subscription flow"""
    
    # Clear unwanted messages
    storage = messages.get_messages(request)
    if storage:
        for message in storage:
            pass  # This consumes the messages
        storage.used = True
    
    if request.user.is_authenticated:
        return redirect_after_login(request.user)
    
    if request.method == 'POST':
        first_name = request.POST.get('first_name', '').strip()
        last_name = request.POST.get('last_name', '').strip()
        email = request.POST.get('email', '').strip().lower()
        username = request.POST.get('username', '').strip()
        password1 = request.POST.get('password1', '')
        password2 = request.POST.get('password2', '')
        terms = request.POST.get('terms')
        
        # Validation
        errors = []
        
        # Name validation
        if len(first_name) < 2:
            errors.append('First name must be at least 2 characters.')
        if len(last_name) < 2:
            errors.append('Last name must be at least 2 characters.')
        
        # Email validation
        email_regex = r'^[^\s@]+@[^\s@]+\.[^\s@]+$'
        if not re.match(email_regex, email):
            errors.append('Please enter a valid email address.')
        elif User.objects.filter(email=email).exists():
            errors.append('An account with this email already exists.')
        
        # Username validation
        username_regex = r'^[a-zA-Z0-9_]{3,20}$'
        if not re.match(username_regex, username):
            errors.append('Username must be 3-20 characters (letters, numbers, underscore only).')
        elif User.objects.filter(username=username).exists():
            errors.append('This username is already taken.')
        
        # Password validation
        if password1 != password2:
            errors.append('Passwords do not match.')
        if len(password1) < 8:
            errors.append('Password must be at least 8 characters.')
        
        # Terms validation
        if not terms:
            errors.append('You must agree to the Terms of Service and Privacy Policy.')
        
        if errors:
            for error in errors:
                messages.error(request, error)
            return render(request, 'zerodhatrader/signup.html')
        
        try:
            # Create user
            user = User.objects.create_user(
                username=username,
                email=email,
                password=password1,
                first_name=first_name,
                last_name=last_name
            )
            
            # Create trial subscription
            UserSubscription.objects.create(
                user=user,
                status='TRIAL',
                trial_start_date=timezone.now(),
                trial_end_date=timezone.now() + timedelta(days=15)
            )
            
            # Auto login after signup
            login(request, user)

            # Clear any existing messages before adding new one
            storage = messages.get_messages(request)
            storage.used = True

            messages.success(request, 'Account created successfully! Welcome to TradeEase.')

            # Redirect to subscription plans
            return redirect('subscription_plans')
            
        except Exception as e:
            messages.error(request, 'An error occurred while creating your account. Please try again.')
            logger.error(f"Signup error: {e}")
    
    return render(request, 'zerodhatrader/signup.html')

def redirect_after_login(user, request=None):
    """Determine where to redirect user after login based on their status"""
    # Check if user is admin
    if user.is_staff:
        return redirect('admin_dashboard')
    
    # Check subscription status
    user_sub = UserSubscription.objects.filter(user=user).first()
    
    if not user_sub:
        # No subscription record, create trial
        UserSubscription.objects.create(
            user=user,
            status='TRIAL',
            trial_start_date=timezone.now(),
            trial_end_date=timezone.now() + timedelta(days=15)
        )
        return redirect('subscription_plans')
    
    # Check if subscription is active
    if not user_sub.is_active():
        if request:
            messages.warning(request, 'Your subscription has expired. Please choose a plan to continue.')
        return redirect('subscription_plans')
    
    # Check if API keys are set up
    user_keys = UserAPIKeys.objects.filter(user=user, is_active=True).first()
    if not user_keys:
        if request:
            messages.info(request, 'Please set up your Zerodha API keys to start trading.')
        return redirect('api_keys_setup')
    
    # Everything is set up, go to trading dashboard
    return redirect('index')

@login_required
def signout_view(request):
    """Enhanced signout"""
    user_name = request.user.first_name or request.user.username
    logout(request)
    messages.success(request, f'You have been successfully logged out.')
    return redirect('landing')

class CustomPasswordResetView(PasswordResetView):
    template_name = 'zerodhatrader/password_reset.html'
    email_template_name = 'zerodhatrader/password_reset_email.html'
    success_url = reverse_lazy('password_reset_done')
    
    def form_valid(self, form):
        # Add custom logic here if needed
        return super().form_valid(form)

class CustomPasswordResetDoneView(PasswordResetDoneView):
    template_name = 'zerodhatrader/password_reset_done.html'

# Simple password reset view (alternative)
@csrf_protect
def password_reset(request):
    """Simple password reset view"""
    if request.method == 'POST':
        email = request.POST.get('email', '').strip().lower()
        
        if not email:
            messages.error(request, 'Please enter your email address.')
            return render(request, 'zerodhatrader/password_reset.html')
        
        try:
            user = User.objects.get(email=email)
            
            # For now, just show a success message
            # In production, you'd generate a reset token and send email
            messages.success(request, f'Password reset instructions have been sent to {email}')
            return render(request, 'zerodhatrader/password_reset_done.html')
            
        except User.DoesNotExist:
            # Don't reveal if email exists or not (security)
            messages.success(request, f'If an account with {email} exists, password reset instructions have been sent.')
            return render(request, 'zerodhatrader/password_reset_done.html')
    
    return render(request, 'zerodhatrader/password_reset.html')


def password_reset_done(request):
    """Password reset done view"""
    return render(request, 'zerodhatrader/password_reset_done.html')


def landing(request):
    """Landing page view"""
    # If user is already authenticated, redirect to appropriate page
    if request.user.is_authenticated:
        return redirect_after_login(request.user, request)
    
    return render(request, 'landing.html')

@login_required
def profile(request):
    """User profile page"""
    user_subscription = UserSubscription.objects.filter(user=request.user).first()
    user_keys = UserAPIKeys.objects.filter(user=request.user).first()
    
    context = {
        'user_subscription': user_subscription,
        'user_keys': user_keys,
    }
    
    return render(request, 'profile.html', context) 

# Initialize the strategy manager
strategy_manager = OptionsStrategyManager()

@api_view(['POST'])
@login_required
def calculate_vertical_spread(request):
    """Calculate vertical spread strategy metrics."""
    try:
        data = request.data
        
        # Validate required fields
        required_fields = ['spread_type', 'spot', 'long_strike', 'short_strike', 
                          'expiry', 'long_premium', 'short_premium', 'quantity', 'symbol']
        
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            return Response({
                'status': 'error',
                'message': f'Missing required fields: {", ".join(missing_fields)}'
            }, status=400)
        
        # Determine strategy type based on spread_type
        spread_type = data['spread_type'].lower()
        
        if spread_type in ['bull_call', 'bull_call_spread']:
            strategy_type = 'bull_call_spread'
        elif spread_type in ['bear_put', 'bear_put_spread']:
            strategy_type = 'bear_put_spread'
        elif spread_type in ['bear_call', 'bear_call_spread']:
            strategy_type = 'bear_call_spread'
        elif spread_type in ['bull_put', 'bull_put_spread']:
            strategy_type = 'bull_put_spread'
        else:
            return Response({
                'status': 'error',
                'message': f'Invalid spread type: {spread_type}'
            }, status=400)
        
        # Prepare parameters for calculation
        params = {
            'spot': float(data['spot']),
            'long_strike': float(data['long_strike']),
            'short_strike': float(data['short_strike']),
            'expiry': data['expiry'],
            'long_premium': float(data['long_premium']),
            'short_premium': float(data['short_premium']),
            'quantity': int(data['quantity']),
            'symbol': data['symbol'].upper()
        }
        
        # Calculate strategy metrics
        result = strategy_manager.analyze_strategy(strategy_type, params)
        
        if result['status'] == 'success':
            # Add real-time market data if available
            try:
                # Fetch current prices for the options
                instruments = Instrument.objects.filter(
                    tradingsymbol__contains=params['symbol'],
                    strike__in=[params['long_strike'], params['short_strike']],
                    expiry=params['expiry']
                )
                
                current_prices = {}
                for instr in instruments:
                    current_prices[float(instr.strike)] = float(instr.last_price or 0)
                
                result['data']['current_prices'] = current_prices
            except Exception as e:
                logger.warning(f"Could not fetch current prices: {e}")
            
            return Response(result)
        else:
            return Response(result, status=400)
            
    except Exception as e:
        logger.error(f"Error calculating vertical spread: {e}")
        return Response({
            'status': 'error',
            'message': str(e)
        }, status=500)


@api_view(['POST'])
@login_required
def calculate_iron_condor(request):
    """Calculate iron condor strategy metrics."""
    try:
        data = request.data
        
        # Validate required fields
        required_fields = ['spot', 'put_long_strike', 'put_short_strike', 
                          'call_short_strike', 'call_long_strike', 'expiry',
                          'put_long_premium', 'put_short_premium',
                          'call_short_premium', 'call_long_premium',
                          'quantity', 'symbol']
        
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            return Response({
                'status': 'error',
                'message': f'Missing required fields: {", ".join(missing_fields)}'
            }, status=400)
        
        # Prepare parameters
        params = {
            'spot': float(data['spot']),
            'put_long_strike': float(data['put_long_strike']),
            'put_short_strike': float(data['put_short_strike']),
            'call_short_strike': float(data['call_short_strike']),
            'call_long_strike': float(data['call_long_strike']),
            'expiry': data['expiry'],
            'put_long_premium': float(data['put_long_premium']),
            'put_short_premium': float(data['put_short_premium']),
            'call_short_premium': float(data['call_short_premium']),
            'call_long_premium': float(data['call_long_premium']),
            'quantity': int(data['quantity']),
            'symbol': data['symbol'].upper()
        }
        
        # Calculate strategy metrics
        result = strategy_manager.analyze_strategy('iron_condor', params)
        
        if result['status'] == 'success':
            # Enhance with suggested adjustments
            result['data']['adjustments'] = calculate_iron_condor_adjustments(params, result['data'])
            
        return Response(result)
        
    except Exception as e:
        logger.error(f"Error calculating iron condor: {e}")
        return Response({
            'status': 'error',
            'message': str(e)
        }, status=500)


@api_view(['POST'])
@login_required
def calculate_butterfly(request):
    """Calculate butterfly spread strategy metrics."""
    try:
        data = request.data
        
        # Validate required fields
        required_fields = ['spot', 'lower_strike', 'middle_strike', 'upper_strike',
                          'expiry', 'lower_premium', 'middle_premium', 'upper_premium',
                          'quantity', 'option_type', 'symbol']
        
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            return Response({
                'status': 'error',
                'message': f'Missing required fields: {", ".join(missing_fields)}'
            }, status=400)
        
        # Validate strike spacing
        lower = float(data['lower_strike'])
        middle = float(data['middle_strike'])
        upper = float(data['upper_strike'])
        
        if (middle - lower) != (upper - middle):
            return Response({
                'status': 'error',
                'message': 'Strikes must be equidistant for butterfly spread'
            }, status=400)
        
        # Prepare parameters
        params = {
            'spot': float(data['spot']),
            'lower_strike': lower,
            'middle_strike': middle,
            'upper_strike': upper,
            'expiry': data['expiry'],
            'lower_premium': float(data['lower_premium']),
            'middle_premium': float(data['middle_premium']),
            'upper_premium': float(data['upper_premium']),
            'quantity': int(data['quantity']),
            'option_type': data['option_type'].upper(),
            'symbol': data['symbol'].upper()
        }
        
        # Calculate strategy metrics
        result = strategy_manager.analyze_strategy('butterfly', params)
        
        return Response(result)
        
    except Exception as e:
        logger.error(f"Error calculating butterfly spread: {e}")
        return Response({
            'status': 'error',
            'message': str(e)
        }, status=500)


@api_view(['POST'])
@login_required
def calculate_calendar_spread(request):
    """Calculate calendar spread strategy metrics with enhanced analysis."""
    try:
        data = request.data
        
        # Validate required fields
        required_fields = ['spot', 'strike', 'near_expiry', 'far_expiry',
                          'near_premium', 'far_premium', 'quantity', 
                          'option_type', 'symbol']
        
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            return Response({
                'status': 'error',
                'message': f'Missing required fields: {", ".join(missing_fields)}'
            }, status=400)
        
        # Prepare parameters
        params = {
            'spot': float(data['spot']),
            'strike': float(data['strike']),
            'near_expiry': data['near_expiry'],
            'far_expiry': data['far_expiry'],
            'near_premium': float(data['near_premium']),
            'far_premium': float(data['far_premium']),
            'quantity': int(data['quantity']),
            'option_type': data['option_type'].upper(),
            'symbol': data['symbol'].upper()
        }
        
        # Calculate strategy metrics
        result = strategy_manager.analyze_strategy('calendar_spread', params)
        
        if result['status'] == 'success':
            # Add historical volatility analysis if available
            result['data']['volatility_analysis'] = analyze_calendar_volatility(params)
            
            # Add optimal entry/exit recommendations
            result['data']['trade_recommendations'] = generate_calendar_recommendations(result['data'])
        
        return Response(result)
        
    except Exception as e:
        logger.error(f"Error calculating calendar spread: {e}")
        return Response({
            'status': 'error',
            'message': str(e)
        }, status=500)


@api_view(['POST'])
@login_required
def calculate_diagonal_spread(request):
    """Calculate diagonal spread strategy metrics."""
    try:
        data = request.data
        
        # Validate required fields
        required_fields = ['spot', 'near_strike', 'far_strike', 'near_expiry',
                          'far_expiry', 'near_premium', 'far_premium', 'quantity',
                          'option_type', 'spread_type', 'symbol']
        
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            return Response({
                'status': 'error',
                'message': f'Missing required fields: {", ".join(missing_fields)}'
            }, status=400)
        
        # Prepare parameters
        params = {
            'spot': float(data['spot']),
            'near_strike': float(data['near_strike']),
            'far_strike': float(data['far_strike']),
            'near_expiry': data['near_expiry'],
            'far_expiry': data['far_expiry'],
            'near_premium': float(data['near_premium']),
            'far_premium': float(data['far_premium']),
            'quantity': int(data['quantity']),
            'option_type': data['option_type'].upper(),
            'spread_type': data['spread_type'].lower(),
            'symbol': data['symbol'].upper()
        }
        
        # Calculate strategy metrics
        result = strategy_manager.analyze_strategy('diagonal_spread', params)
        
        return Response(result)
        
    except Exception as e:
        logger.error(f"Error calculating diagonal spread: {e}")
        return Response({
            'status': 'error',
            'message': str(e)
        }, status=500)


@api_view(['POST'])
@login_required
def calculate_ratio_spread(request):
    """Calculate ratio spread strategy metrics with risk warnings."""
    try:
        data = request.data
        
        # Validate required fields
        required_fields = ['spot', 'long_strike', 'short_strike', 'expiry',
                          'long_premium', 'short_premium', 'long_quantity',
                          'short_quantity', 'option_type', 'symbol']
        
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            return Response({
                'status': 'error',
                'message': f'Missing required fields: {", ".join(missing_fields)}'
            }, status=400)
        
        # Validate ratio
        long_qty = int(data['long_quantity'])
        short_qty = int(data['short_quantity'])
        
        if short_qty <= long_qty:
            return Response({
                'status': 'error',
                'message': 'Short quantity must exceed long quantity for ratio spread'
            }, status=400)
        
        # Check user's experience level for high-risk strategies
        user_subscription = UserSubscription.objects.filter(user=request.user).first()
        if user_subscription and user_subscription.status == 'TRIAL':
            if (short_qty / long_qty) > 2:
                return Response({
                    'status': 'error',
                    'message': 'High ratio spreads (>2:1) are not available during trial period'
                }, status=403)
        
        # Prepare parameters
        params = {
            'spot': float(data['spot']),
            'long_strike': float(data['long_strike']),
            'short_strike': float(data['short_strike']),
            'expiry': data['expiry'],
            'long_premium': float(data['long_premium']),
            'short_premium': float(data['short_premium']),
            'long_quantity': long_qty,
            'short_quantity': short_qty,
            'option_type': data['option_type'].upper(),
            'symbol': data['symbol'].upper()
        }
        
        # Calculate strategy metrics
        result = strategy_manager.analyze_strategy('ratio_spread', params)
        
        if result['status'] == 'success':
            # Add risk warnings
            result['data']['risk_warnings'] = generate_ratio_spread_warnings(params, result['data'])
        
        return Response(result)
        
    except Exception as e:
        logger.error(f"Error calculating ratio spread: {e}")
        return Response({
            'status': 'error',
            'message': str(e)
        }, status=500)


@api_view(['GET'])
@login_required
def get_strategy_recommendations(request):
    """Get personalized strategy recommendations based on market outlook."""
    try:
        market_outlook = request.GET.get('outlook', 'neutral')
        risk_tolerance = request.GET.get('risk', 'moderate')
        
        # Validate inputs
        valid_outlooks = ['bullish', 'bearish', 'neutral', 'volatile', 'range_bound']
        valid_risks = ['conservative', 'moderate', 'aggressive']
        
        if market_outlook.lower() not in valid_outlooks:
            market_outlook = 'neutral'
        
        if risk_tolerance.lower() not in valid_risks:
            risk_tolerance = 'moderate'
        
        # Get recommendations from strategy manager
        recommendations = strategy_manager.get_strategy_recommendations(
            market_outlook, risk_tolerance
        )
        
        # Enhance with current market data
        for rec in recommendations:
            rec['current_iv_percentile'] = get_current_iv_percentile()
            rec['market_trend'] = analyze_market_trend()
        
        return Response({
            'status': 'success',
            'data': {
                'market_outlook': market_outlook,
                'risk_tolerance': risk_tolerance,
                'recommendations': recommendations
            }
        })
        
    except Exception as e:
        logger.error(f"Error getting strategy recommendations: {e}")
        return Response({
            'status': 'error',
            'message': str(e)
        }, status=500)


# Helper functions for enhanced analysis

def calculate_iron_condor_adjustments(params, result):
    """Calculate suggested adjustments for iron condor."""
    adjustments = []
    
    # Check if either side is threatened
    spot = params['spot']
    if spot < result['lower_breakeven'] * 1.02:  # Within 2% of lower breakeven
        adjustments.append({
            'action': 'Roll down put spread',
            'reason': 'Spot approaching lower breakeven',
            'urgency': 'high'
        })
    elif spot > result['upper_breakeven'] * 0.98:  # Within 2% of upper breakeven
        adjustments.append({
            'action': 'Roll up call spread',
            'reason': 'Spot approaching upper breakeven',
            'urgency': 'high'
        })
    
    return adjustments


def analyze_calendar_volatility(params):
    """Analyze volatility conditions for calendar spread."""
    # This would connect to real volatility data in production
    return {
        'current_iv_rank': 45,  # Placeholder
        'iv_trend': 'increasing',
        'favorable_for_calendar': True,
        'volatility_forecast': 'Expected to remain elevated'
    }


def generate_calendar_recommendations(spread_data):
    """Generate trading recommendations for calendar spread."""
    recommendations = []
    
    if spread_data['iv_difference'] > 0:
        recommendations.append({
            'type': 'entry',
            'action': 'Consider entering position',
            'reason': 'Favorable IV difference between months'
        })
    
    if spread_data['theta_ratio'] > 2.5:
        recommendations.append({
            'type': 'management',
            'action': 'Monitor closely',
            'reason': 'High theta ratio indicates rapid time decay'
        })
    
    return recommendations


def generate_ratio_spread_warnings(params, result):
    """Generate risk warnings for ratio spreads."""
    warnings = []
    ratio = params['short_quantity'] / params['long_quantity']
    
    if ratio > 2:
        warnings.append({
            'level': 'high',
            'message': 'High ratio increases unlimited risk exposure'
        })
    
    if result['net_greeks']['gamma'] < -0.1:
        warnings.append({
            'level': 'medium',
            'message': 'Significant negative gamma risk'
        })
    
    return warnings


def get_current_iv_percentile():
    """Get current IV percentile for the market."""
    # Placeholder - would calculate from historical data
    return 65


def analyze_market_trend():
    """Analyze current market trend."""
    # Placeholder - would use technical indicators
    return {
        'direction': 'sideways',
        'strength': 'weak',
        'duration': '3 days'
    }
    
# Add these new API endpoints after your existing views

@require_http_methods(["POST"])
@login_required
@csrf_exempt
def calculate_vertical_spread(request):
    """Calculate vertical spread strategy metrics."""
    try:
        data = json.loads(request.body)
        
        required_fields = ['spread_type', 'spot', 'long_strike', 'short_strike', 
                          'expiry', 'long_premium', 'short_premium', 'quantity', 'symbol']
        
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            return JsonResponse({
                'status': 'error',
                'message': f'Missing required fields: {", ".join(missing_fields)}'
            }, status=400)
        
        spread_type = data['spread_type'].lower()
        
        if spread_type in ['bull_call', 'bull_call_spread']:
            strategy_type = 'bull_call_spread'
        elif spread_type in ['bear_put', 'bear_put_spread']:
            strategy_type = 'bear_put_spread'
        elif spread_type in ['bear_call', 'bear_call_spread']:
            strategy_type = 'bear_call_spread'
        elif spread_type in ['bull_put', 'bull_put_spread']:
            strategy_type = 'bull_put_spread'
        else:
            return JsonResponse({
                'status': 'error',
                'message': f'Invalid spread type: {spread_type}'
            }, status=400)
        
        params = {
            'spot': float(data['spot']),
            'long_strike': float(data['long_strike']),
            'short_strike': float(data['short_strike']),
            'expiry': data['expiry'],
            'long_premium': float(data['long_premium']),
            'short_premium': float(data['short_premium']),
            'quantity': int(data['quantity']),
            'symbol': data['symbol'].upper()
        }
        
        result = strategy_manager.analyze_strategy(strategy_type, params)
        
        if result['status'] == 'success':
            try:
                instruments = Instrument.objects.filter(
                    tradingsymbol__contains=params['symbol'],
                    strike__in=[params['long_strike'], params['short_strike']],
                    expiry=params['expiry']
                )
                
                current_prices = {}
                for instr in instruments:
                    current_prices[float(instr.strike)] = float(instr.last_price or 0)
                
                result['data']['current_prices'] = current_prices
            except Exception as e:
                logger.warning(f"Could not fetch current prices: {e}")
            
            return JsonResponse(result)
        else:
            return JsonResponse(result, status=400)
            
    except Exception as e:
        logger.error(f"Error calculating vertical spread: {e}")
        return JsonResponse({
            'status': 'error',
            'message': str(e)
        }, status=500)


@require_http_methods(["POST"])
@login_required
@csrf_exempt
def calculate_iron_condor(request):
    """Calculate iron condor strategy metrics."""
    try:
        data = json.loads(request.body)
        
        required_fields = ['spot', 'put_long_strike', 'put_short_strike', 
                          'call_short_strike', 'call_long_strike', 'expiry',
                          'put_long_premium', 'put_short_premium',
                          'call_short_premium', 'call_long_premium',
                          'quantity', 'symbol']
        
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            return JsonResponse({
                'status': 'error',
                'message': f'Missing required fields: {", ".join(missing_fields)}'
            }, status=400)
        
        params = {
            'spot': float(data['spot']),
            'put_long_strike': float(data['put_long_strike']),
            'put_short_strike': float(data['put_short_strike']),
            'call_short_strike': float(data['call_short_strike']),
            'call_long_strike': float(data['call_long_strike']),
            'expiry': data['expiry'],
            'put_long_premium': float(data['put_long_premium']),
            'put_short_premium': float(data['put_short_premium']),
            'call_short_premium': float(data['call_short_premium']),
            'call_long_premium': float(data['call_long_premium']),
            'quantity': int(data['quantity']),
            'symbol': data['symbol'].upper()
        }
        
        result = strategy_manager.analyze_strategy('iron_condor', params)
        
        if result['status'] == 'success':
            spot = params['spot']
            lower_breakeven = result['data']['lower_breakeven']
            upper_breakeven = result['data']['upper_breakeven']
            
            adjustments = []
            if spot < lower_breakeven * 1.02:
                adjustments.append({
                    'action': 'Roll down put spread',
                    'reason': 'Spot approaching lower breakeven',
                    'urgency': 'high'
                })
            elif spot > upper_breakeven * 0.98:
                adjustments.append({
                    'action': 'Roll up call spread',
                    'reason': 'Spot approaching upper breakeven',
                    'urgency': 'high'
                })
            
            result['data']['adjustments'] = adjustments
            
        return JsonResponse(result)
        
    except Exception as e:
        logger.error(f"Error calculating iron condor: {e}")
        return JsonResponse({
            'status': 'error',
            'message': str(e)
        }, status=500)


@require_http_methods(["POST"])
@login_required
@csrf_exempt
def calculate_butterfly(request):
    """Calculate butterfly spread strategy metrics."""
    try:
        data = json.loads(request.body)
        
        required_fields = ['spot', 'lower_strike', 'middle_strike', 'upper_strike',
                          'expiry', 'lower_premium', 'middle_premium', 'upper_premium',
                          'quantity', 'option_type', 'symbol']
        
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            return JsonResponse({
                'status': 'error',
                'message': f'Missing required fields: {", ".join(missing_fields)}'
            }, status=400)
        
        lower = float(data['lower_strike'])
        middle = float(data['middle_strike'])
        upper = float(data['upper_strike'])
        
        if (middle - lower) != (upper - middle):
            return JsonResponse({
                'status': 'error',
                'message': 'Strikes must be equidistant for butterfly spread'
            }, status=400)
        
        params = {
            'spot': float(data['spot']),
            'lower_strike': lower,
            'middle_strike': middle,
            'upper_strike': upper,
            'expiry': data['expiry'],
            'lower_premium': float(data['lower_premium']),
            'middle_premium': float(data['middle_premium']),
            'upper_premium': float(data['upper_premium']),
            'quantity': int(data['quantity']),
            'option_type': data['option_type'].upper(),
            'symbol': data['symbol'].upper()
        }
        
        result = strategy_manager.analyze_strategy('butterfly', params)
        
        return JsonResponse(result)
        
    except Exception as e:
        logger.error(f"Error calculating butterfly spread: {e}")
        return JsonResponse({
            'status': 'error',
            'message': str(e)
        }, status=500)


@require_http_methods(["POST"])
@login_required
@csrf_exempt
def calculate_calendar_spread(request):
    """Calculate calendar spread strategy metrics with enhanced analysis."""
    try:
        data = json.loads(request.body)
        
        required_fields = ['spot', 'strike', 'near_expiry', 'far_expiry',
                          'near_premium', 'far_premium', 'quantity', 
                          'option_type', 'symbol']
        
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            return JsonResponse({
                'status': 'error',
                'message': f'Missing required fields: {", ".join(missing_fields)}'
            }, status=400)
        
        params = {
            'spot': float(data['spot']),
            'strike': float(data['strike']),
            'near_expiry': data['near_expiry'],
            'far_expiry': data['far_expiry'],
            'near_premium': float(data['near_premium']),
            'far_premium': float(data['far_premium']),
            'quantity': int(data['quantity']),
            'option_type': data['option_type'].upper(),
            'symbol': data['symbol'].upper()
        }
        
        result = strategy_manager.analyze_strategy('calendar_spread', params)
        
        if result['status'] == 'success':
            result['data']['volatility_analysis'] = {
                'current_iv_rank': 45,
                'iv_trend': 'increasing',
                'favorable_for_calendar': True,
                'volatility_forecast': 'Expected to remain elevated'
            }
            
            recommendations = []
            if result['data']['iv_difference'] > 0:
                recommendations.append({
                    'type': 'entry',
                    'action': 'Consider entering position',
                    'reason': 'Favorable IV difference between months'
                })
            
            if result['data']['theta_ratio'] > 2.5:
                recommendations.append({
                    'type': 'management',
                    'action': 'Monitor closely',
                    'reason': 'High theta ratio indicates rapid time decay'
                })
            
            result['data']['trade_recommendations'] = recommendations
        
        return JsonResponse(result)
        
    except Exception as e:
        logger.error(f"Error calculating calendar spread: {e}")
        return JsonResponse({
            'status': 'error',
            'message': str(e)
        }, status=500)


@require_http_methods(["POST"])
@login_required
@csrf_exempt
def calculate_diagonal_spread(request):
    """Calculate diagonal spread strategy metrics."""
    try:
        data = json.loads(request.body)
        
        required_fields = ['spot', 'near_strike', 'far_strike', 'near_expiry',
                          'far_expiry', 'near_premium', 'far_premium', 'quantity',
                          'option_type', 'spread_type', 'symbol']
        
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            return JsonResponse({
                'status': 'error',
                'message': f'Missing required fields: {", ".join(missing_fields)}'
            }, status=400)
        
        params = {
            'spot': float(data['spot']),
            'near_strike': float(data['near_strike']),
            'far_strike': float(data['far_strike']),
            'near_expiry': data['near_expiry'],
            'far_expiry': data['far_expiry'],
            'near_premium': float(data['near_premium']),
            'far_premium': float(data['far_premium']),
            'quantity': int(data['quantity']),
            'option_type': data['option_type'].upper(),
            'spread_type': data['spread_type'].lower(),
            'symbol': data['symbol'].upper()
        }
        
        result = strategy_manager.analyze_strategy('diagonal_spread', params)
        
        return JsonResponse(result)
        
    except Exception as e:
        logger.error(f"Error calculating diagonal spread: {e}")
        return JsonResponse({
            'status': 'error',
            'message': str(e)
        }, status=500)


@require_http_methods(["POST"])
@login_required
@csrf_exempt
def calculate_ratio_spread(request):
    """Calculate ratio spread strategy metrics with risk warnings."""
    try:
        data = json.loads(request.body)
        
        required_fields = ['spot', 'long_strike', 'short_strike', 'expiry',
                          'long_premium', 'short_premium', 'long_quantity',
                          'short_quantity', 'option_type', 'symbol']
        
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            return JsonResponse({
                'status': 'error',
                'message': f'Missing required fields: {", ".join(missing_fields)}'
            }, status=400)
        
        long_qty = int(data['long_quantity'])
        short_qty = int(data['short_quantity'])
        
        if short_qty <= long_qty:
            return JsonResponse({
                'status': 'error',
                'message': 'Short quantity must exceed long quantity for ratio spread'
            }, status=400)
        
        user_subscription = UserSubscription.objects.filter(user=request.user).first()
        if user_subscription and user_subscription.status == 'TRIAL':
            if (short_qty / long_qty) > 2:
                return JsonResponse({
                    'status': 'error',
                    'message': 'High ratio spreads (>2:1) are not available during trial period'
                }, status=403)
        
        params = {
            'spot': float(data['spot']),
            'long_strike': float(data['long_strike']),
            'short_strike': float(data['short_strike']),
            'expiry': data['expiry'],
            'long_premium': float(data['long_premium']),
            'short_premium': float(data['short_premium']),
            'long_quantity': long_qty,
            'short_quantity': short_qty,
            'option_type': data['option_type'].upper(),
            'symbol': data['symbol'].upper()
        }
        
        result = strategy_manager.analyze_strategy('ratio_spread', params)
        
        if result['status'] == 'success':
            warnings = []
            ratio = short_qty / long_qty
            
            if ratio > 2:
                warnings.append({
                    'level': 'high',
                    'message': 'High ratio increases unlimited risk exposure'
                })
            
            if result['data']['net_greeks']['gamma'] < -0.1:
                warnings.append({
                    'level': 'medium',
                    'message': 'Significant negative gamma risk'
                })
            
            result['data']['risk_warnings'] = warnings
        
        return JsonResponse(result)
        
    except Exception as e:
        logger.error(f"Error calculating ratio spread: {e}")
        return JsonResponse({
            'status': 'error',
            'message': str(e)
        }, status=500)


@require_http_methods(["GET"])
@login_required
def get_strategy_recommendations(request):
    """Get personalized strategy recommendations based on market outlook."""
    try:
        market_outlook = request.GET.get('outlook', 'neutral')
        risk_tolerance = request.GET.get('risk', 'moderate')
        
        valid_outlooks = ['bullish', 'bearish', 'neutral', 'volatile', 'range_bound']
        valid_risks = ['conservative', 'moderate', 'aggressive']
        
        if market_outlook.lower() not in valid_outlooks:
            market_outlook = 'neutral'
        
        if risk_tolerance.lower() not in valid_risks:
            risk_tolerance = 'moderate'
        
        recommendations = strategy_manager.get_strategy_recommendations(
            market_outlook, risk_tolerance
        )
        
        for rec in recommendations:
            rec['current_iv_percentile'] = 65
            rec['market_trend'] = {
                'direction': 'sideways',
                'strength': 'weak',
                'duration': '3 days'
            }
        
        return JsonResponse({
            'status': 'success',
            'data': {
                'market_outlook': market_outlook,
                'risk_tolerance': risk_tolerance,
                'recommendations': recommendations
            }
        })
        
    except Exception as e:
        logger.error(f"Error getting strategy recommendations: {e}")
        return JsonResponse({
            'status': 'error',
            'message': str(e)
        }, status=500)