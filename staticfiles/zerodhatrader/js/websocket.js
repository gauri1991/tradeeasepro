// WebSocket functionality - reusable across pages
class WebSocketManager {
    constructor(app) {
        this.app = app;
        this.wsConnection = null;
        this.wsConnected = false;
    }

    connect() {
        if (!this.app.state.isAuthenticated) {
            this.app.updateStatus('Please login first');
            this.app.showToast('Please login first');
            return;
        }

        try {
            this.app.updateStatus('Connecting to WebSocket...');
            
            const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${wsProtocol}//${window.location.host}/ws/ticker/`;
            
            this.wsConnection = new WebSocket(wsUrl);
            
            this.wsConnection.onopen = () => this.onOpen();
            this.wsConnection.onclose = (event) => this.onClose(event);
            this.wsConnection.onerror = (error) => this.onError(error);
            this.wsConnection.onmessage = (event) => this.onMessage(event);
            
        } catch (error) {
            console.error('WebSocket connection error:', error);
            this.app.updateStatus(`Error: ${error.message}`);
            window.addWsDebugLog(`Error: ${error.message}`);
        }
    }

    disconnect() {
        if (this.wsConnection) {
            this.wsConnection.close();
            this.app.updateStatus('Disconnecting WebSocket...');
        }
    }

    onOpen() {
        this.wsConnected = true;
        this.app.state.wsConnection = this.wsConnection;
        this.app.state.wsConnected = true;
        this.app.updateStatus('WebSocket connected');
        
        // Update connection badge if it exists
        const connectionBadge = document.getElementById('connection-badge');
        if (connectionBadge) {
            connectionBadge.textContent = 'Connected';
            connectionBadge.className = 'text-success';
        }
        
        window.addWsDebugLog('WebSocket connection established');
    }

    onClose(event) {
        this.wsConnected = false;
        this.app.state.wsConnection = null;
        this.app.state.wsConnected = false;
        this.app.updateStatus(`WebSocket disconnected: Code ${event.code}`);
        
        // Update connection badge if it exists
        const connectionBadge = document.getElementById('connection-badge');
        if (connectionBadge) {
            connectionBadge.textContent = 'Disconnected';
            connectionBadge.className = 'text-danger';
        }
        
        window.addWsDebugLog(`WebSocket disconnected: Code ${event.code}`);
        
        // Try to reconnect after 5 seconds
        setTimeout(() => {
            if (!this.wsConnected) {
                this.app.updateStatus('Attempting to reconnect WebSocket...');
                this.connect();
            }
        }, 5000);
    }

    onError(error) {
        console.error('WebSocket error:', error);
        this.app.updateStatus('WebSocket error');
        window.addWsDebugLog(`Error: WebSocket connection error`);
    }

    onMessage(event) {
        try {
            const rawData = event.data;
            window.addWsDebugLog(`Received: ${rawData.substring(0, 100)}${rawData.length > 100 ? '...' : ''}`);

            const data = JSON.parse(rawData);
            
            if (data.type === 'tick' && data.data) {
                const tickData = data.data;
                console.log('Tick received:', tickData);
                window.addWsDebugLog(`Tick data: ${JSON.stringify(tickData, null, 2)}`);
                
                // Call the price update handler
                if (window.updateInstrumentPrice) {
                    window.updateInstrumentPrice(tickData);
                }
            } else if (data.type === 'connection_established') {
                window.addWsDebugLog(`Connection established: ${data.message}, Consumer ID: ${data.consumer_id}`);
            } else if (data.type === 'subscription_status') {
                window.addWsDebugLog(`Subscription status: ${data.message}, Success: ${data.success}, Tokens: ${JSON.stringify(data.tokens)}`);
            } else if (data.type === 'error') {
                window.addWsDebugLog(`Error from server: ${data.message}`);
            }
        } catch (error) {
            console.error('WebSocket message processing error:', error);
            window.addWsDebugLog(`Error processing message: ${error.message}`);
        }
    }

    subscribe(tokens) {
        if (!this.wsConnected || !this.wsConnection) {
            this.app.updateStatus('WebSocket not connected');
            return;
        }
        
        const validTokens = tokens.filter(token => token && !isNaN(parseInt(token)));
        
        if (validTokens.length === 0) {
            this.app.updateStatus('No valid tokens to subscribe to');
            return;
        }

        const message = {
            action: 'subscribe',
            tokens: validTokens
        };
        
        this.wsConnection.send(JSON.stringify(message));
        this.app.updateStatus(`Subscribing to ${validTokens.length} instruments`);
        window.addWsDebugLog(`Sending subscription request for tokens: ${validTokens.join(', ')}`);
    }
}

// Create global WebSocket manager when app is available
document.addEventListener('DOMContentLoaded', function() {
    if (window.tradeEaseApp) {
        window.wsManager = new WebSocketManager(window.tradeEaseApp);
    }
});