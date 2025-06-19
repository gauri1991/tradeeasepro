# zerodhatrader/consumers.py
import json
import logging
import asyncio
import redis
from channels.generic.websocket import AsyncWebsocketConsumer
from asgiref.sync import sync_to_async
from django.conf import settings
from .ticker import KiteTickerManager, DateTimeEncoder

logger = logging.getLogger(__name__)

class TickerConsumer(AsyncWebsocketConsumer):
    """WebSocket consumer for ticker data using Redis pub-sub"""
    
    # Class variable to track active consumers
    active_consumers = {}
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.consumer_id = None
        self.subscription_task = None
        self.is_running = False
        self.redis_client = None
        self.pubsub = None
        self.subscribed_channels = set()
        
    async def connect(self):
        """Handle WebSocket connection"""
        # Get consumer ID
        self.consumer_id = id(self)
        
        # Accept the connection
        await self.accept()
        
        # Initialize Redis connection for this consumer
        await self._initialize_redis()
        
        # Store consumer instance
        TickerConsumer.active_consumers[self.consumer_id] = self
        
        # Start Redis subscription task
        self.is_running = True
        self.subscription_task = asyncio.create_task(self._handle_redis_subscriptions())
        
        # Send connection success message
        await self.send(text_data=json.dumps({
            'type': 'connection_established',
            'message': 'Connected to ticker with Redis pub-sub',
            'consumer_id': self.consumer_id
        }))
        
        logger.info(f"WebSocket client connected with Redis pub-sub: {self.consumer_id}")
    
    async def disconnect(self, close_code):
        """Handle WebSocket disconnection"""
        logger.info(f"WebSocket client disconnecting: {self.consumer_id}, code: {close_code}")
        
        # Stop subscription processing
        self.is_running = False
        
        if self.subscription_task and not self.subscription_task.done():
            self.subscription_task.cancel()
            try:
                await self.subscription_task
            except asyncio.CancelledError:
                pass
        
        # Unsubscribe from all tokens
        await sync_to_async(self._unsubscribe_all)()
        
        # Clean up Redis connections
        await self._cleanup_redis()
        
        # Remove from active consumers
        if self.consumer_id in TickerConsumer.active_consumers:
            del TickerConsumer.active_consumers[self.consumer_id]
        
        logger.info(f"WebSocket client disconnected: {self.consumer_id}")
    
    async def receive(self, text_data):
        """Handle messages from WebSocket client"""
        try:
            data = json.loads(text_data)
            action = data.get('action', '')
            
            logger.info(f"WebSocket received: {action} from consumer {self.consumer_id}")
            
            if action == 'subscribe':
                # Process subscription request
                tokens = data.get('tokens', [])
                
                if not tokens:
                    await self.send(text_data=json.dumps({
                        'type': 'error',
                        'message': 'No tokens provided for subscription'
                    }))
                    return
                
                logger.info(f"Subscribe request for tokens: {tokens} from consumer {self.consumer_id}")
                
                # Subscribe to tokens both in ticker manager and Redis
                success = await sync_to_async(self._subscribe_to_tokens)(tokens)
                
                if success:
                    # Subscribe to Redis channels for these tokens
                    await self._subscribe_to_redis_channels(tokens)
                
                await self.send(text_data=json.dumps({
                    'type': 'subscription_status',
                    'success': success,
                    'tokens': tokens,
                    'message': 'Subscribed to tokens' if success else 'Failed to subscribe to tokens'
                }))
                
            elif action == 'unsubscribe':
                # Process unsubscription request
                tokens = data.get('tokens', [])
                
                logger.info(f"Unsubscribe request for tokens: {tokens} from consumer {self.consumer_id}")
                
                # Unsubscribe from Redis channels
                if tokens:
                    await self._unsubscribe_from_redis_channels(tokens)
                    success = await sync_to_async(self._unsubscribe_from_tokens)(tokens)
                else:
                    await self._unsubscribe_from_all_redis_channels()
                    success = await sync_to_async(self._unsubscribe_all)()
                
                await self.send(text_data=json.dumps({
                    'type': 'subscription_status',
                    'success': success,
                    'tokens': tokens,
                    'message': 'Unsubscribed from tokens' if success else 'Failed to unsubscribe from tokens'
                }))
            
            else:
                await self.send(text_data=json.dumps({
                    'type': 'error',
                    'message': f'Unknown action: {action}'
                }))
        
        except Exception as e:
            logger.error(f"Error processing WebSocket message: {e}")
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': str(e)
            }))
    
    async def _initialize_redis(self):
        """Initialize Redis connection for pub-sub"""
        try:
            # Get Redis configuration from Django settings
            redis_url = getattr(settings, 'REDIS_URL', 'redis://localhost:6379/0')
            self.redis_client = redis.from_url(redis_url, decode_responses=True)
            
            # Test connection
            await sync_to_async(self.redis_client.ping)()
            
            # Create pubsub instance
            self.pubsub = self.redis_client.pubsub()
            
            logger.info(f"Redis pub-sub initialized for consumer {self.consumer_id}")
            
        except Exception as e:
            logger.error(f"Failed to initialize Redis for consumer {self.consumer_id}: {e}")
            # Fallback to localhost
            try:
                self.redis_client = redis.Redis(host='localhost', port=6379, db=0, decode_responses=True)
                await sync_to_async(self.redis_client.ping)()
                self.pubsub = self.redis_client.pubsub()
                logger.info(f"Redis pub-sub initialized on localhost fallback for consumer {self.consumer_id}")
            except Exception as fallback_error:
                logger.error(f"Redis fallback also failed for consumer {self.consumer_id}: {fallback_error}")
                raise Exception("Could not establish Redis connection for consumer")
    
    async def _cleanup_redis(self):
        """Clean up Redis connections"""
        try:
            if self.pubsub:
                await sync_to_async(self.pubsub.close)()
            if self.redis_client:
                await sync_to_async(self.redis_client.close)()
            logger.info(f"Redis connections cleaned up for consumer {self.consumer_id}")
        except Exception as e:
            logger.error(f"Error cleaning up Redis for consumer {self.consumer_id}: {e}")
    
    async def _subscribe_to_redis_channels(self, tokens):
        """Subscribe to Redis channels for given tokens"""
        try:
            if not self.pubsub:
                logger.error("Pubsub not initialized")
                return
            
            for token in tokens:
                channel_name = f"tick:{token}"
                await sync_to_async(self.pubsub.subscribe)(channel_name)
                self.subscribed_channels.add(channel_name)
                logger.debug(f"Subscribed to Redis channel: {channel_name}")
                
        except Exception as e:
            logger.error(f"Error subscribing to Redis channels: {e}")
    
    async def _unsubscribe_from_redis_channels(self, tokens):
        """Unsubscribe from Redis channels for given tokens"""
        try:
            if not self.pubsub:
                return
                
            for token in tokens:
                channel_name = f"tick:{token}"
                if channel_name in self.subscribed_channels:
                    await sync_to_async(self.pubsub.unsubscribe)(channel_name)
                    self.subscribed_channels.remove(channel_name)
                    logger.debug(f"Unsubscribed from Redis channel: {channel_name}")
                    
        except Exception as e:
            logger.error(f"Error unsubscribing from Redis channels: {e}")
    
    async def _unsubscribe_from_all_redis_channels(self):
        """Unsubscribe from all Redis channels"""
        try:
            if not self.pubsub:
                return
                
            channels_to_unsubscribe = list(self.subscribed_channels)
            for channel_name in channels_to_unsubscribe:
                await sync_to_async(self.pubsub.unsubscribe)(channel_name)
                self.subscribed_channels.remove(channel_name)
                logger.debug(f"Unsubscribed from Redis channel: {channel_name}")
                
        except Exception as e:
            logger.error(f"Error unsubscribing from all Redis channels: {e}")
    
    async def _handle_redis_subscriptions(self):
        """Handle incoming messages from Redis pub-sub"""
        logger.info(f"Starting Redis subscription handler for consumer {self.consumer_id}")
        
        while self.is_running:
            try:
                if not self.pubsub:
                    await asyncio.sleep(0.1)
                    continue
                
                # Get message from Redis pub-sub (non-blocking)
                message = await sync_to_async(self.pubsub.get_message)(timeout=0.05)
                
                if message and message['type'] == 'message':
                    try:
                        # Parse the tick data
                        tick_data = json.loads(message['data'])
                        
                        # Send tick to WebSocket client
                        await self.send(text_data=json.dumps({
                            'type': 'tick',
                            'data': tick_data
                        }, cls=DateTimeEncoder))
                        
                        logger.debug(f"Forwarded tick from Redis to WebSocket for consumer {self.consumer_id}")
                        
                    except Exception as e:
                        logger.error(f"Error processing Redis message: {e}")
                
                # Small sleep to prevent CPU spinning
                await asyncio.sleep(0.01)  # 10ms interval
                
            except asyncio.CancelledError:
                # Task was cancelled, exit gracefully
                logger.info(f"Redis subscription handler cancelled for consumer {self.consumer_id}")
                break
            except Exception as e:
                logger.error(f"Error in Redis subscription handler for consumer {self.consumer_id}: {e}")
                await asyncio.sleep(0.1)  # Prevent cpu spinning on error
        
        logger.info(f"Redis subscription handler stopped for consumer {self.consumer_id}")
    
    def _subscribe_to_tokens(self, tokens):
        """Subscribe to instrument tokens in ticker manager"""
        try:
            ticker_manager = KiteTickerManager.get_instance()
            return ticker_manager.subscribe(self.consumer_id, tokens)
        except Exception as e:
            logger.error(f"Error subscribing to tokens: {e}")
            return False
    
    def _unsubscribe_from_tokens(self, tokens):
        """Unsubscribe from instrument tokens in ticker manager"""
        try:
            ticker_manager = KiteTickerManager.get_instance()
            return ticker_manager.unsubscribe(self.consumer_id, tokens)
        except Exception as e:
            logger.error(f"Error unsubscribing from tokens: {e}")
            return False
    
    def _unsubscribe_all(self):
        """Unsubscribe from all tokens in ticker manager"""
        try:
            ticker_manager = KiteTickerManager.get_instance()
            return ticker_manager.unsubscribe(self.consumer_id)
        except Exception as e:
            logger.error(f"Error unsubscribing from all tokens: {e}")
            return False