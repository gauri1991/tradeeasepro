# zerodhatrader/ticker.py
import logging
import threading
import json
import redis
from datetime import datetime
from django.utils import timezone
from django.conf import settings
from kiteconnect import KiteTicker
from .models import ApiCredential

logger = logging.getLogger(__name__)

# Custom JSON encoder for datetime objects
class DateTimeEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, datetime):
            return obj.strftime('%Y-%m-%d %H:%M:%S')
        return super().default(obj)

class KiteTickerManager:
    """Singleton manager for KiteTicker instance with Redis pub-sub"""
    _instance = None
    _lock = threading.Lock()
    
    # Ticker instance and status
    ticker = None
    is_connected = False
    last_connected = None
    
    # Subscriber management (now tracks channels instead of queues)
    subscribers = {}
    
    # Redis client for pub-sub
    redis_client = None
    
    @classmethod
    def get_instance(cls):
        """Get or create the singleton instance"""
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance
    
    def __init__(self):
        """Initialize Redis connection"""
        if self.redis_client is None:
            try:
                # Get Redis configuration from Django settings
                redis_url = getattr(settings, 'REDIS_URL', 'redis://localhost:6379/0')
                self.redis_client = redis.from_url(redis_url, decode_responses=True)
                # Test connection
                self.redis_client.ping()
                logger.info("Redis connection established for ticker manager")
            except Exception as e:
                logger.error(f"Failed to connect to Redis: {e}")
                # Fallback to localhost
                try:
                    self.redis_client = redis.Redis(host='localhost', port=6379, db=0, decode_responses=True)
                    self.redis_client.ping()
                    logger.info("Redis connection established on localhost fallback")
                except Exception as fallback_error:
                    logger.error(f"Redis fallback also failed: {fallback_error}")
                    raise Exception("Could not establish Redis connection for pub-sub")
    
    def initialize_ticker(self):
        """Initialize KiteTicker with credentials"""
        try:
            # Get credentials
            cred = ApiCredential.objects.filter(is_active=True).first()
            if not cred or not cred.access_token:
                logger.error("No API credentials with access token found")
                return False
            
            # Close existing ticker if it exists
            if self.ticker:
                self.disconnect_ticker()
            
            # Initialize ticker
            self.ticker = KiteTicker(cred.api_key, cred.access_token)
            
            # Set callbacks
            self.ticker.on_ticks = self.on_ticks
            self.ticker.on_connect = self.on_connect
            self.ticker.on_close = self.on_close
            self.ticker.on_error = self.on_error
            self.ticker.on_reconnect = self.on_reconnect
            self.ticker.on_noreconnect = self.on_noreconnect
            
            # Connect in threaded mode
            self.ticker.connect(threaded=True)
            
            logger.info("KiteTicker initialized successfully")
            return True
        
        except Exception as e:
            logger.error(f"Error initializing ticker: {e}")
            return False
    
    def disconnect_ticker(self):
        """Disconnect the ticker"""
        if self.ticker:
            try:
                self.ticker.close()
                self.ticker = None
                self.is_connected = False
                logger.info("KiteTicker disconnected")
                return True
            except Exception as e:
                logger.error(f"Error disconnecting ticker: {e}")
                return False
        return True
    
    def subscribe(self, consumer_id, instrument_tokens):
        """Subscribe a consumer to instrument tokens using Redis pub-sub"""
        if not instrument_tokens:
            logger.warning(f"No tokens provided for subscription by consumer {consumer_id}")
            return False
            
        logger.info(f"Subscribe request: consumer_id={consumer_id}, tokens={instrument_tokens}")
        
        if not self.ticker or not self.is_connected:
            success = self.initialize_ticker()
            if not success:
                logger.error("Failed to initialize ticker for subscription")
                return False
        
        try:
            # Convert tokens to integers
            tokens = [int(token) for token in instrument_tokens]
            
            # Register consumer for each token (for tracking purposes)
            for token in tokens:
                if token not in self.subscribers:
                    self.subscribers[token] = set()
                self.subscribers[token].add(consumer_id)
            
            logger.info(f"Subscribing to tokens: {tokens}, mode: FULL")
            
            # Subscribe to tokens in KiteTicker
            self.ticker.subscribe(tokens)
            self.ticker.set_mode(self.ticker.MODE_FULL, tokens)
            
            logger.info(f"Subscribed to {len(tokens)} tokens for consumer {consumer_id}")
            return True
        
        except Exception as e:
            logger.error(f"Error subscribing to tokens: {e}")
            return False
    
    def unsubscribe(self, consumer_id, instrument_tokens=None):
        """Unsubscribe a consumer from instrument tokens"""
        try:
            if instrument_tokens is None:
                # Unsubscribe from all tokens
                tokens_to_check = list(self.subscribers.keys())
                logger.info(f"Unsubscribing consumer {consumer_id} from all tokens")
                
                for token in tokens_to_check:
                    if consumer_id in self.subscribers[token]:
                        self.subscribers[token].remove(consumer_id)
                        
                        # If no more subscribers, unsubscribe from the token
                        if not self.subscribers[token] and self.ticker and self.is_connected:
                            logger.info(f"No more subscribers for token {token}, unsubscribing")
                            self.ticker.unsubscribe([token])
                            del self.subscribers[token]
            else:
                # Unsubscribe from specific tokens
                tokens = [int(token) for token in instrument_tokens]
                logger.info(f"Unsubscribing consumer {consumer_id} from tokens: {tokens}")
                
                for token in tokens:
                    if token in self.subscribers and consumer_id in self.subscribers[token]:
                        self.subscribers[token].remove(consumer_id)
                        
                        # If no more subscribers, unsubscribe from the token
                        if not self.subscribers[token] and self.ticker and self.is_connected:
                            logger.info(f"No more subscribers for token {token}, unsubscribing")
                            self.ticker.unsubscribe([token])
                            del self.subscribers[token]
            
            return True
        
        except Exception as e:
            logger.error(f"Error unsubscribing from tokens: {e}")
            return False
    
    def _process_datetime_in_tick(self, tick):
        """Convert datetime objects to string format in tick data"""
        if 'timestamp' in tick and isinstance(tick['timestamp'], datetime):
            tick['timestamp'] = tick['timestamp'].strftime('%Y-%m-%d %H:%M:%S')
        
        if 'last_trade_time' in tick and isinstance(tick['last_trade_time'], datetime):
            tick['last_trade_time'] = tick['last_trade_time'].strftime('%Y-%m-%d %H:%M:%S')
        
        # Process any other datetime fields that might be in the tick data
        for key, value in tick.items():
            if isinstance(value, datetime):
                tick[key] = value.strftime('%Y-%m-%d %H:%M:%S')
    
    def _get_channel_name(self, instrument_token):
        """Get Redis channel name for an instrument token"""
        return f"tick:{instrument_token}"
    
    # KiteTicker callbacks
    def on_ticks(self, ws, ticks):
        """Callback for ticks - now uses Redis pub-sub for distribution"""
        if not ticks:
            logger.warning("Received empty ticks")
            return
            
        logger.info(f"Received {len(ticks)} ticks")
        
        # Process ticks and publish to Redis channels
        for tick in ticks:
            token = tick["instrument_token"]
            
            # Skip if no subscribers for this token
            if token not in self.subscribers:
                continue
                
            # Get subscribers for this token
            subscriber_ids = list(self.subscribers[token])
            if not subscriber_ids:
                continue
            
            # Convert any datetime objects to strings
            self._process_datetime_in_tick(tick)
            
            # Publish tick to Redis channel - this is the key optimization!
            # Instead of putting tick in multiple queues, we publish once to a channel
            try:
                channel_name = self._get_channel_name(token)
                tick_json = json.dumps(tick, cls=DateTimeEncoder)
                
                # Single publish operation instead of multiple queue puts
                self.redis_client.publish(channel_name, tick_json)
                
                logger.debug(f"Published tick for token {token} to channel {channel_name}")
                
            except Exception as e:
                logger.error(f"Error publishing tick for token {token}: {e}")
    
    def on_connect(self, ws, response):
        """Callback when connection is established"""
        self.is_connected = True
        self.last_connected = timezone.now()
        logger.info(f"KiteTicker connected: {response}")
        
        # Resubscribe to all tokens
        if self.subscribers:
            all_tokens = list(self.subscribers.keys())
            logger.info(f"Resubscribing to {len(all_tokens)} tokens")
            self.ticker.subscribe(all_tokens)
            self.ticker.set_mode(self.ticker.MODE_FULL, all_tokens)
    
    def on_close(self, ws, code, reason):
        """Callback when connection is closed"""
        self.is_connected = False
        logger.warning(f"KiteTicker disconnected: {code} - {reason}")
    
    def on_error(self, ws, code, reason):
        """Callback when error occurs"""
        logger.error(f"KiteTicker error: {code} - {reason}")
    
    def on_reconnect(self, ws, attempts_count):
        """Callback on reconnection attempt"""
        logger.info(f"KiteTicker reconnecting: attempt {attempts_count}")
    
    def on_noreconnect(self, ws):
        """Callback when reconnection fails"""
        self.is_connected = False
        logger.error("KiteTicker failed to reconnect")