// Index page (main trading interface) specific JavaScript

// Application state specific to index page
const indexState = {
    selectedInstruments: [],
    searchResults: [],
    selectedSearchItem: null,
    ordersBeingMonitored: {},

    // NEW: Automated trading state
    pendingAutoOrders: {}, // Orders waiting for auto opposite order placement
    positionTracker: {},   // Instrument-wise position tracking
    autoOrderPairs: {}     // Links parent order to child auto order
};

// DOM Elements
let loginBtn, profileBtn, downloadBtn, debugBtn, connectWsBtn, disconnectWsBtn;
let profileUserId, profileUserName, profileEmail;
let instrumentSearch, searchSuggestions, addInstrumentBtn, tradingTableBody, orderLogBody;
let optionsElements = {};

// Initialize DOM elements
function initializeIndexElements() {
    // Control buttons
    loginBtn = document.getElementById('login-btn');
    profileBtn = document.getElementById('profile-btn');
    downloadBtn = document.getElementById('download-btn');
    debugBtn = document.getElementById('debug-btn');
    connectWsBtn = document.getElementById('connect-ws-btn');
    disconnectWsBtn = document.getElementById('disconnect-ws-btn');
    
    // Profile elements
    profileUserId = document.getElementById('profile-user-id');
    profileUserName = document.getElementById('profile-user-name');
    profileEmail = document.getElementById('profile-email');
    
    // Search and trading elements
    instrumentSearch = document.getElementById('instrument-search');
    searchSuggestions = document.getElementById('search-suggestions');
    addInstrumentBtn = document.getElementById('add-instrument-btn');
    tradingTableBody = document.getElementById('trading-table-body');
    orderLogBody = document.getElementById('order-log-body');
    
    // Options Panel DOM Elements
    optionsElements = {
        // Nifty Options Elements
        niftySpot: document.getElementById('nifty-spot'),
        niftyExpiry: document.getElementById('nifty-expiry'),
        niftyQuantity: document.getElementById('nifty-quantity'),
        niftyDiff: document.getElementById('nifty-diff'),
        niftyLoadBtn: document.getElementById('nifty-load-btn'),
        niftyOptionsBody: document.getElementById('nifty-options-body'),
        
        // Bank Nifty Options Elements
        bankniftySpot: document.getElementById('banknifty-spot'),
        bankniftyExpiry: document.getElementById('banknifty-expiry'),
        bankniftyQuantity: document.getElementById('banknifty-quantity'),
        bankniftyDiff: document.getElementById('banknifty-diff'),
        bankniftyLoadBtn: document.getElementById('banknifty-load-btn'),
        bankniftyOptionsBody: document.getElementById('banknifty-options-body')
    };
}

// Handle login
function handleLogin() {
    // First check if we already have a saved token
    if (window.tradeEaseApp.state.isAuthenticated && window.tradeEaseApp.state.sessionToken) {
        // Verify the token is still valid by making a test API call
        fetch('/api/profile/', {
            headers: {
                'Authorization': `Token ${window.tradeEaseApp.state.sessionToken}`
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'error') {
                // Token is invalid, force re-login
                window.tradeEaseApp.updateStatus('Authentication token is invalid or expired. Please login again.');
                window.tradeEaseApp.showToast('Session expired. Please login again.', 'warning');
                
                // Reset authentication state
                window.tradeEaseApp.state.isAuthenticated = false;
                window.tradeEaseApp.state.sessionToken = null;
                window.tradeEaseApp.updateConnectionStatus();
                
                // Now initiate new login flow
                initiateLogin();
            } else {
                // Token is valid
                window.tradeEaseApp.updateStatus('Already authenticated');
                window.tradeEaseApp.showToast('Already logged in', 'success');
                // Automatically fetch profile
                getProfile();
            }
        })
        .catch(error => {
            // API error, force re-login
            console.error('Token validation error:', error);
            window.tradeEaseApp.updateStatus('Authentication error. Please login again.');
            window.tradeEaseApp.showToast('Authentication error. Please login again.', 'error');
            
            // Reset authentication state
            window.tradeEaseApp.state.isAuthenticated = false;
            window.tradeEaseApp.state.sessionToken = null;
            window.tradeEaseApp.updateConnectionStatus();
            
            // Now initiate new login flow
            initiateLogin();
        });
    } else {
        // Not authenticated, start login flow
        initiateLogin();
    }
}

function initiateLogin() {
    window.tradeEaseApp.updateStatus('Initiating login process...');

    // Open login window
    const loginWindow = window.open('/api/login/', 'Kite Login', 'width=800,height=600');
    
    // Create a check interval to get the request token
    const checkInterval = setInterval(() => {
        try {
            // Check if window redirected to success page
            if (loginWindow.location.href.includes('request_token=')) {
                clearInterval(checkInterval);
                
                // Extract request token from URL
                const url = new URL(loginWindow.location.href);
                const requestToken = url.searchParams.get('request_token');
                
                // Exchange the token
                exchangeToken(requestToken, loginWindow);
            }
        } catch (e) {
            // This error is expected due to cross-origin policy
            // We just continue checking until we can access the URL
        }
    }, 1000);
}

// Exchange request token for session token and save in database
async function exchangeToken(requestToken, loginWindow) {
    try {
        window.tradeEaseApp.updateStatus('Exchanging token and saving to database...');

        const response = await fetch('/api/save-session/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': window.tradeEaseApp.getCsrfToken()
            },
            body: JSON.stringify({ request_token: requestToken })
        });

        const data = await response.json();

        if (data.status === 'success') {
            window.tradeEaseApp.state.sessionToken = data.access_token;
            window.tradeEaseApp.state.isAuthenticated = true;
            window.tradeEaseApp.updateStatus('Login successful, token saved in database');
            window.tradeEaseApp.updateConnectionStatus();
            window.tradeEaseApp.showToast('Login successful', 'success');
            
            // Set a timer to close the login window after 5 seconds
            setTimeout(() => {
                if (loginWindow && !loginWindow.closed) {
                    loginWindow.close();
                }
            }, 5000);
            
            // Automatically fetch profile after successful login
            getProfile();
        } else {
            window.tradeEaseApp.updateStatus(`Login failed: ${data.message}`);
            window.tradeEaseApp.showToast(`Login failed: ${data.message}`, 'error');
            
            // Close the login window if there's an error
            if (loginWindow && !loginWindow.closed) {
                loginWindow.close();
            }
        }
    } catch (error) {
        console.error('Token exchange error:', error);
        window.tradeEaseApp.updateStatus(`Error: ${error.message}`);
        window.tradeEaseApp.showToast('Failed to exchange token', 'error');
        
        // Close the login window if there's an error
        if (loginWindow && !loginWindow.closed) {
            loginWindow.close();
        }
    }
}
 
// Get user profile - Updated to match earlier working version
async function getProfile() {
    try {
        window.tradeEaseApp.updateStatus('Fetching profile data...');

        const response = await window.tradeEaseApp.fetchWithCSRF('/api/profile/', {
            method: 'GET'
        });

        const data = await response.json();

        if (response.ok && (data.status === 'success' || data.user_id)) {
            // Update profile display - SAME FORMAT AS BEFORE
            if (profileUserId) profileUserId.textContent = data.user_id || '-';
            if (profileUserName) profileUserName.textContent = data.user_name || '-';
            if (profileEmail) profileEmail.textContent = data.email || '-';
            
            window.tradeEaseApp.updateStatus('Profile data retrieved successfully');
            window.tradeEaseApp.showToast('Profile retrieved', 'success');
        } else {
            window.tradeEaseApp.updateStatus(`Failed to get profile: ${data.message}`);
            window.tradeEaseApp.showToast(`Failed to get profile: ${data.message}`, 'error');
        }
    } catch (error) {
        console.error('Profile fetch error:', error);
        window.tradeEaseApp.updateStatus(`Error: ${error.message}`);
        window.tradeEaseApp.showToast('Failed to fetch profile', 'error');
    }
}

// Download instruments
async function downloadInstruments() {
    if (!window.tradeEaseApp.state.isAuthenticated) {
        window.tradeEaseApp.updateStatus('Please login first');
        window.tradeEaseApp.showToast('Please login first', 'warning');
        return;
    }

    try {
        window.tradeEaseApp.updateStatus('Downloading instruments...');

        const response = await fetch('/api/instruments/download/', {
            method: 'POST',
            headers: {
                'Authorization': `Token ${window.tradeEaseApp.state.sessionToken}`,
                'X-CSRFToken': window.tradeEaseApp.getCsrfToken()
            }
        });

        const data = await response.json();

        if (data.status === 'success') {
            window.tradeEaseApp.updateStatus(`Successfully downloaded ${data.count} instruments`);
            window.tradeEaseApp.showToast(`Downloaded ${data.count} instruments`, 'success');
            
            // Fetch the downloaded instruments
            fetchInstruments();
        } else {
            window.tradeEaseApp.updateStatus(`Failed to download instruments: ${data.message}`);
            window.tradeEaseApp.showToast(`Failed to download: ${data.message}`, 'error');
        }
    } catch (error) {
        console.error('Instrument download error:', error);
        window.tradeEaseApp.updateStatus(`Error: ${error.message}`);
        window.tradeEaseApp.showToast('Failed to download instruments', 'error');
    }
}

// Fetch instruments from database
async function fetchInstruments() {
    try {
        window.tradeEaseApp.updateStatus('Fetching instruments...');

        const response = await fetch('/api/instruments/');
        const data = await response.json();

        if (data.status === 'success') {
            window.tradeEaseApp.state.instruments = data.instruments || [];
            window.tradeEaseApp.updateStatus(`Loaded ${window.tradeEaseApp.state.instruments.length} instruments`);
            
            // Now that instruments are loaded, populate expiry dropdowns
            populateExpiryDropdowns();
        } else {
            window.tradeEaseApp.updateStatus(`Failed to fetch instruments: ${data.message}`);
        }
    } catch (error) {
        console.error('Instrument fetch error:', error);
        window.tradeEaseApp.updateStatus(`Error: ${error.message}`);
    }
}

// Handle instrument search
function handleInstrumentSearch() {
    const query = instrumentSearch.value.trim().toLowerCase();
    
    if (query.length < 2) {
        searchSuggestions.style.display = 'none';
        indexState.searchResults = [];
        return;
    }
    
    // Filter instruments that match the query
    indexState.searchResults = window.tradeEaseApp.state.instruments.filter(instrument => {
        const tradingSymbol = (instrument.tradingsymbol || '').toLowerCase();
        const name = (instrument.name || '').toLowerCase();
        
        return tradingSymbol.includes(query) || name.includes(query);
    }).slice(0, 15); // Limit to 15 results
    
    // Display suggestions
    renderSearchSuggestions();
}

// Render search suggestions
function renderSearchSuggestions() {
    if (!searchSuggestions) {
        console.error("searchSuggestions element not found!");
        return;
    }
    
    if (indexState.searchResults.length === 0) {
        searchSuggestions.style.display = 'none';
        return;
    }
    
    // Clear previous suggestions
    searchSuggestions.innerHTML = '';
    
    // Create a heading
    const heading = document.createElement('div');
    heading.className = 'suggestion-item font-semibold';
    heading.textContent = `Found ${indexState.searchResults.length} instruments`;
    searchSuggestions.appendChild(heading);
    
    // Add each suggestion
    indexState.searchResults.forEach((instrument, index) => {
        const item = document.createElement('div');
        item.className = 'suggestion-item';
        
        // Create a more detailed display with symbol and name
        if (instrument.name) {
            item.innerHTML = `<strong>${instrument.tradingsymbol}</strong> <span style="color: var(--muted-foreground);">(${instrument.name})</span>`;
        } else {
            item.innerHTML = `<strong>${instrument.tradingsymbol}</strong>`;
        }
        
        item.dataset.index = index;
        
        item.addEventListener('click', () => {
            indexState.selectedSearchItem = instrument;
            instrumentSearch.value = instrument.tradingsymbol;
            searchSuggestions.style.display = 'none';
        });
        
        searchSuggestions.appendChild(item);
    });
    
    // Force display to block
    searchSuggestions.style.display = 'block';
}

// Add selected instrument to trading table
function addSelectedInstrument() {
    if (!indexState.selectedSearchItem) {
        window.tradeEaseApp.showToast('Please select an instrument first', 'warning');
        return;
    }
    
    // Check if already added
    if (indexState.selectedInstruments.some(i => i.instrument_token === indexState.selectedSearchItem.instrument_token)) {
        window.tradeEaseApp.showToast('Instrument already added', 'warning');
        return;
    }
    
    // Add to selected instruments
    indexState.selectedInstruments.push({
        ...indexState.selectedSearchItem,
        quantity: 1,
        diff: 5, // Default diff value
        last_price: indexState.selectedSearchItem.last_price || 0
    });
    
    // Subscribe to WebSocket updates for this instrument
    if (window.wsManager && window.wsManager.wsConnected) {
        window.wsManager.subscribe([indexState.selectedSearchItem.instrument_token]);
    }
    
    // Reset search
    instrumentSearch.value = '';
    indexState.selectedSearchItem = null;
    
    // Update UI
    renderTradingTable();
}

// Render trading table
function renderTradingTable() {
    if (!tradingTableBody) return;
    
    if (indexState.selectedInstruments.length === 0) {
        tradingTableBody.innerHTML = '<tr><td colspan="5" class="text-center">No instruments added yet</td></tr>';
        return;
    }
    
    tradingTableBody.innerHTML = '';
    
    indexState.selectedInstruments.forEach(instrument => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${instrument.tradingsymbol}</td>
            <td id="price-${instrument.instrument_token}">${instrument.last_price?.toFixed(2) || '-'}</td>
            <td>
                <input type="number" class="quantity-input" data-token="${instrument.instrument_token}" 
                       value="${instrument.quantity}" min="1">
            </td>
            <td>
                <input type="number" class="diff-input" data-token="${instrument.instrument_token}" 
                       value="${instrument.diff}" min="0" step="0.01">
            </td>
            <td>
                <button class="button button-primary buy-btn" data-token="${instrument.instrument_token}">Buy</button>
                <button class="button button-danger sell-btn" data-token="${instrument.instrument_token}">Sell</button>
                <button class="button button-danger remove-btn" data-token="${instrument.instrument_token}">✕</button>
            </td>
        `;
        
        tradingTableBody.appendChild(row);
    });
    
    // Add event listeners
    document.querySelectorAll('.quantity-input').forEach(input => {
        input.addEventListener('change', handleQuantityChange);
    });
    
    document.querySelectorAll('.diff-input').forEach(input => {
        input.addEventListener('change', handleDiffChange);
    });
    
    document.querySelectorAll('.buy-btn').forEach(btn => {
        btn.addEventListener('click', handleBuy);
    });
    
    document.querySelectorAll('.sell-btn').forEach(btn => {
        btn.addEventListener('click', handleSell);
    });
    
    document.querySelectorAll('.remove-btn').forEach(btn => {
        btn.addEventListener('click', handleRemoveInstrument);
    });
}

// Handle quantity change
function handleQuantityChange(event) {
    const token = parseInt(event.target.dataset.token);
    const quantity = parseInt(event.target.value);
    
    if (isNaN(token) || isNaN(quantity) || quantity < 1) return;
    
    const index = indexState.selectedInstruments.findIndex(i => i.instrument_token === token);
    if (index >= 0) {
        indexState.selectedInstruments[index].quantity = quantity;
    }
}

// Handle diff change (continuing from where we left off)
function handleDiffChange(event) {
    const token = parseInt(event.target.dataset.token);
    const diff = parseFloat(event.target.value);
    
    if (isNaN(token) || isNaN(diff) || diff < 0) return;
    
    const index = indexState.selectedInstruments.findIndex(i => i.instrument_token === token);
    if (index >= 0) {
        indexState.selectedInstruments[index].diff = diff;
    }
}

// Handle buy button
function handleBuy(event) {
    const token = parseInt(event.target.dataset.token);
    const instrument = indexState.selectedInstruments.find(i => i.instrument_token === token);
    
    if (!instrument) return;
    
    if (!window.tradeEaseApp.state.isAuthenticated) {
        window.tradeEaseApp.updateStatus('Please login first to place orders');
        window.tradeEaseApp.showToast('Authentication required', 'warning');
        return;
    }
    
    // Place order
    placeOrder(instrument, 'BUY');
}

// Handle sell button
function handleSell(event) {
    const token = parseInt(event.target.dataset.token);
    const instrument = indexState.selectedInstruments.find(i => i.instrument_token === token);
    
    if (!instrument) return;
    
    if (!window.tradeEaseApp.state.isAuthenticated) {
        window.tradeEaseApp.updateStatus('Please login first to place orders');
        window.tradeEaseApp.showToast('Authentication required', 'warning');
        return;
    }
    
    // Place order
    placeOrder(instrument, 'SELL');
}

// Place order API call
// Enhanced placeOrder function to enable auto opposite orders
// Fixed placeOrder function - ensure orders are properly added to log
async function placeOrder(instrument, transactionType) {
    try {
        window.tradeEaseApp.updateStatus(`Placing ${transactionType} order for ${instrument.quantity} ${instrument.tradingsymbol}...`);
        
        const response = await fetch('/api/orders/place/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Token ${window.tradeEaseApp.state.sessionToken}`,
                'X-CSRFToken': window.tradeEaseApp.getCsrfToken()
            },
            body: JSON.stringify({
                tradingsymbol: instrument.tradingsymbol,
                exchange: instrument.exchange || 'NSE',
                transaction_type: transactionType,
                quantity: instrument.quantity,
                product: 'MIS',
                order_type: 'MARKET'
            })
        });
        
        const data = await response.json();
        
        if (data.status === 'success' && data.order_id) {
            const orderId = data.order_id;
            
            window.tradeEaseApp.updateStatus(`${transactionType} order placed successfully. Order ID: ${orderId}`);
            window.tradeEaseApp.showToast(`Order placed: ${orderId}`, 'success');
            
            // Add order to log with initial status
            addOrderToLog(orderId, instrument.tradingsymbol, transactionType, 
                         instrument.quantity, instrument.last_price || 0, 'PUT ORDER REQ RECEIVED');
            
            // CRITICAL FIX: Start monitoring this order immediately
            console.log(`🚀 Starting status monitoring for order ${orderId}`);
            setTimeout(() => {
                checkOrderStatusAndExitIfFilled(orderId);
            }, 1000); // Wait 1 second before first check
            
            // Schedule auto opposite order
            scheduleAutoOppositeOrder(orderId, {
                symbol: instrument.tradingsymbol,
                exchange: instrument.exchange || 'NSE',
                transaction_type: transactionType,
                quantity: instrument.quantity,
                diff: instrument.diff,
                original_price: instrument.last_price || 0,
                order_id: orderId
            });
            
        } else {
            window.tradeEaseApp.updateStatus(`Order placement failed: ${data.message || 'Unknown error'}`);
            window.tradeEaseApp.showToast(`Order failed: ${data.message || 'Unknown error'}`, 'error');
            
            addOrderToLog('FAILED', instrument.tradingsymbol, transactionType, 
                         instrument.quantity, instrument.last_price || 0, 'REJECTED', data.message || 'Unknown error');
        }
    } catch (error) {
        console.error('Order placement error:', error);
        window.tradeEaseApp.updateStatus(`Error placing order: ${error.message}`);
        window.tradeEaseApp.showToast('Failed to place order', 'error');
        
        addOrderToLog('ERROR', instrument.tradingsymbol, transactionType, 
                     instrument.quantity, instrument.last_price || 0, 'ERROR', error.message);
    }
}

// NEW: Schedule auto opposite order placement
function scheduleAutoOppositeOrder(orderId, orderInfo) {
    indexState.pendingAutoOrders[orderId] = orderInfo;
    window.tradeEaseApp.updateStatus(`Scheduled auto opposite order for Order ID: ${orderId}`);
}

// Update the checkOrderStatusAndExitIfFilled function
// Replace the existing checkOrderStatusAndExitIfFilled function
// Replace the existing checkOrderStatusAndExitIfFilled function
function checkOrderStatusAndExitIfFilled(orderId) {
    console.log(`🔍 Checking status for order: ${orderId}`);
    
    if (!indexState.ordersBeingMonitored[orderId]) {
        console.error(`Order ${orderId} not found in monitoring list`);
        return;
    }
    
    const orderInfo = indexState.ordersBeingMonitored[orderId];
    orderInfo.lastChecked = new Date();
    
    // Use the correct endpoint
    fetch(`/api/orders/${orderId}/status/`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            return response.json();
        })
        .then(response => {
            console.log(`📊 Status response for ${orderId}:`, response);
            
            if (response.status === 'success' && response.data) {
                const order = response.data;
                
                // Update local order info
                orderInfo.status = order.status;
                orderInfo.filled = order.filled_quantity || 0;
                orderInfo.pending = order.pending_quantity || order.quantity;
                orderInfo.averagePrice = order.average_price || order.price || 0;
                orderInfo.statusMessage = order.status_message || '';
                orderInfo.statusMessageRaw = order.status_message_raw || '';
                
                // Get human-readable status message
                const statusInfo = getStatusInfo(order.status, order.status_message, order.status_message_raw);
                
                // Update the status display
                updateOrderStatus(orderId, order.status, statusInfo.message);
                
                // Handle different statuses based on Kite documentation
                switch(order.status) {
                    // Final states - stop monitoring after a delay
                    case 'COMPLETE':
                        window.tradeEaseApp.updateStatus(`✅ Order ${orderId} completed at ₹${order.average_price}`);
                        
                        // Handle auto order trigger
                        if (indexState.pendingAutoOrders[orderId]) {
                            handleAutoOrderTrigger(order);
                        }
                        
                        // Update position tracker
                        updatePositionTracker(orderInfo.symbol, orderInfo.transactionType, 
                                            order.filled_quantity, parseFloat(order.average_price));
                        
                        // Update buttons
                        updateOrderLogWithStatusAndButtons(orderId, orderInfo);
                        
                        // Stop monitoring after 10 seconds
                        setTimeout(() => {
                            delete indexState.ordersBeingMonitored[orderId];
                            console.log(`🗑️ Stopped monitoring completed order ${orderId}`);
                        }, 10000);
                        break;
                        
                    case 'REJECTED':
                    case 'CANCELLED':
                        window.tradeEaseApp.updateStatus(`❌ Order ${orderId} ${order.status.toLowerCase()}: ${statusInfo.message}`);
                        
                        // Update buttons
                        updateOrderLogWithStatusAndButtons(orderId, orderInfo);
                        
                        // Stop monitoring after 5 seconds
                        setTimeout(() => {
                            delete indexState.ordersBeingMonitored[orderId];
                            console.log(`🗑️ Stopped monitoring ${order.status} order ${orderId}`);
                        }, 5000);
                        break;
                    
                    // Active states - continue monitoring
                    case 'OPEN':
                        if (order.filled_quantity > 0) {
                            window.tradeEaseApp.updateStatus(`📊 Order ${orderId} partially filled: ${order.filled_quantity}/${order.quantity}`);
                        } else {
                            window.tradeEaseApp.updateStatus(`📋 Order ${orderId} is open at exchange`);
                        }
                        updateOrderLogWithStatusAndButtons(orderId, orderInfo);
                        setTimeout(() => checkOrderStatusAndExitIfFilled(orderId), 5000);
                        break;
                    
                    // Transitional states - continue monitoring with shorter interval
                    case 'PUT ORDER REQ RECEIVED':
                    case 'VALIDATION PENDING':
                    case 'OPEN PENDING':
                    case 'MODIFY VALIDATION PENDING':
                    case 'MODIFY PENDING':
                    case 'TRIGGER PENDING':
                    case 'CANCEL PENDING':
                    case 'AMO REQ RECEIVED':
                        console.log(`⏳ Order ${orderId} in transitional state: ${order.status}`);
                        setTimeout(() => checkOrderStatusAndExitIfFilled(orderId), 2000); // Check more frequently
                        break;
                        
                    default:
                        console.log(`❓ Unknown status for ${orderId}: ${order.status}`);
                        setTimeout(() => checkOrderStatusAndExitIfFilled(orderId), 5000);
                        break;
                }
            } else {
                console.error(`❌ Invalid response for order ${orderId}:`, response);
                window.tradeEaseApp.updateStatus(`Error checking order ${orderId}: ${response.message || 'Invalid response'}`);
                // Retry after 10 seconds
                setTimeout(() => checkOrderStatusAndExitIfFilled(orderId), 10000);
            }
        })
        .catch(error => {
            console.error(`❌ Error checking status for ${orderId}:`, error);
            window.tradeEaseApp.updateStatus(`Network error checking order ${orderId}`);
            // Retry after 10 seconds
            setTimeout(() => checkOrderStatusAndExitIfFilled(orderId), 10000);
        });
}

// Add this new function to get human-readable status messages
function getStatusInfo(status, statusMessage, statusMessageRaw) {
    // If there's a specific status message, use it
    if (statusMessage) {
        return { message: statusMessage, type: 'specific' };
    }
    
    // Otherwise, provide friendly messages for known statuses
    const statusMessages = {
        'PUT ORDER REQ RECEIVED': 'Order request received',
        'VALIDATION PENDING': 'Validating order with risk management',
        'OPEN PENDING': 'Sending order to exchange',
        'OPEN': 'Order active at exchange',
        'COMPLETE': 'Order fully executed',
        'REJECTED': statusMessageRaw || 'Order rejected by exchange/RMS',
        'CANCELLED': 'Order cancelled',
        'MODIFY VALIDATION PENDING': 'Validating modification request',
        'MODIFY PENDING': 'Sending modification to exchange',
        'MODIFIED': 'Order modified successfully',
        'TRIGGER PENDING': 'Waiting for trigger price',
        'CANCEL PENDING': 'Cancellation request sent to exchange',
        'AMO REQ RECEIVED': 'After market order received'
    };
    
    return {
        message: statusMessages[status] || `Status: ${status}`,
        type: 'generic'
    };
}

// New function to update order log with status and proper buttons
function updateOrderLogWithStatusAndButtons(orderId, orderInfo) {
    if (!orderLogBody) return;
    
    const row = orderLogBody.querySelector(`tr[data-order-id="${orderId}"]`);
    if (!row) return;
    
    // Update status cell
    const statusCell = row.querySelector(`#status-${orderId}`);
    if (statusCell) {
        let statusDisplay = orderInfo.status;
        let statusClass = '';
        
        if (orderInfo.filled > 0) {
            statusDisplay = `${orderInfo.filled}/${orderInfo.quantity} filled (${orderInfo.status})`;
        }
        
        if (orderInfo.statusMessage) {
            statusDisplay += `: ${orderInfo.statusMessage}`;
        }
        
        // Status styling
        if (orderInfo.status === 'COMPLETE') {
            statusClass = 'text-success';
        } else if (['REJECTED', 'CANCELLED'].includes(orderInfo.status)) {
            statusClass = 'text-danger';
        } else if (['OPEN', 'PENDING'].includes(orderInfo.status)) {
            statusClass = 'text-warning';
        }
        
        statusCell.className = `text-center ${statusClass}`;
        statusCell.textContent = statusDisplay;
    }
    
    // Update action buttons based on status
    const actionCell = row.querySelector('td:nth-child(7)'); // Actions column
    if (actionCell) {
        let buttonsHTML = '';
        
        switch(orderInfo.status) {
            case 'COMPLETE':
                buttonsHTML = `
                    <button class="button button-danger exit-btn" 
                            data-order-id="${orderId}" 
                            data-symbol="${orderInfo.symbol}"
                            style="font-size: 0.75rem; padding: 0.25rem 0.5rem; margin-right: 0.25rem;">
                        Exit
                    </button>
                    <button class="button button-outline modify-btn" 
                            data-order-id="${orderId}"
                            style="font-size: 0.75rem; padding: 0.25rem 0.5rem;">
                        Modify
                    </button>
                `;
                break;
                
            case 'OPEN':
                buttonsHTML = `
                    <button class="button button-warning cancel-btn" 
                            data-order-id="${orderId}"
                            style="font-size: 0.75rem; padding: 0.25rem 0.5rem; margin-right: 0.25rem;">
                        Cancel
                    </button>
                    <button class="button button-outline modify-btn" 
                            data-order-id="${orderId}"
                            style="font-size: 0.75rem; padding: 0.25rem 0.5rem;">
                        Modify
                    </button>
                `;
                break;
                
            case 'REJECTED':
            case 'CANCELLED':
                buttonsHTML = '<span class="text-muted">No actions</span>';
                break;
                
            default:
                buttonsHTML = `
                    <button class="button button-outline modify-btn" 
                            data-order-id="${orderId}"
                            style="font-size: 0.75rem; padding: 0.25rem 0.5rem;">
                        Modify
                    </button>
                `;
                break;
        }
        
        actionCell.innerHTML = buttonsHTML;
        
        // Add event listeners to new buttons
        const exitBtn = actionCell.querySelector('.exit-btn');
        const modifyBtn = actionCell.querySelector('.modify-btn');
        const cancelBtn = actionCell.querySelector('.cancel-btn');
        
        if (exitBtn) exitBtn.addEventListener('click', handleExitOrder);
        if (modifyBtn) modifyBtn.addEventListener('click', handleModifyOrder);
        if (cancelBtn) cancelBtn.addEventListener('click', handleCancelOrder);
    }
}

// New function to handle exit orders (market order)
function handleExitOrder(event) {
    const orderId = event.target.dataset.orderId;
    const symbol = event.target.dataset.symbol;
    
    if (confirm(`Place market exit order for ${symbol}?`)) {
        // Convert to market order for immediate execution
        fetch(`/api/orders/${orderId}/modify/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': window.tradeEaseApp.getCsrfToken()
            },
            body: JSON.stringify({
                order_type: 'MARKET'
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                updateStatus(`Exit order placed for ${symbol}`);
                window.tradeEaseApp.showToast(`Exit order placed`, 'success');
            } else {
                updateStatus(`Exit failed: ${data.message}`);
                window.tradeEaseApp.showToast(`Exit failed: ${data.message}`, 'error');
            }
        })
        .catch(error => {
            console.error('Exit order error:', error);
            window.tradeEaseApp.showToast('Exit order failed', 'error');
        });
    }
}

// New function to handle modify orders (real-time)
function handleModifyOrder(event) {
    const orderId = event.target.dataset.orderId;
    const orderInfo = indexState.ordersBeingMonitored[orderId];
    
    if (!orderInfo) {
        window.tradeEaseApp.showToast('Order not found', 'error');
        return;
    }
    
    // Show modify modal
    showModifyOrderModal(orderId, orderInfo);
}

// New function to handle cancel orders
function handleCancelOrder(event) {
    const orderId = event.target.dataset.orderId;
    
    if (confirm(`Cancel order ${orderId}?`)) {
        fetch(`/api/orders/${orderId}/cancel/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': window.tradeEaseApp.getCsrfToken()
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                updateStatus(`Order ${orderId} cancelled`);
                window.tradeEaseApp.showToast('Order cancelled', 'success');
            } else {
                updateStatus(`Cancel failed: ${data.message}`);
                window.tradeEaseApp.showToast(`Cancel failed: ${data.message}`, 'error');
            }
        })
        .catch(error => {
            console.error('Cancel order error:', error);
            window.tradeEaseApp.showToast('Cancel failed', 'error');
        });
    }
}

// New function to show modify order modal
function showModifyOrderModal(orderId, orderInfo) {
    const modal = document.createElement('div');
    modal.className = 'modify-modal-overlay';
    modal.innerHTML = `
        <div class="modify-modal">
            <div class="modify-modal-header">
                <h3>Modify Order: ${orderInfo.symbol}</h3>
                <button class="modify-modal-close">&times;</button>
            </div>
            <div class="modify-modal-body">
                <p><strong>Order ID:</strong> ${orderId}</p>
                <p><strong>Current Status:</strong> ${orderInfo.status}</p>
                
                <div class="form-group">
                    <label for="modify-quantity">Quantity:</label>
                    <input type="number" id="modify-quantity" value="${orderInfo.quantity}" 
                           min="1" class="input">
                </div>
                
                <div class="form-group">
                    <label for="modify-price">Exit Price:</label>
                    <input type="number" id="modify-price" value="${orderInfo.price || ''}" 
                           min="0" step="0.05" class="input">
                </div>
                
                <p><em>Changes will be updated at the exchange in real-time.</em></p>
            </div>
            <div class="modify-modal-footer">
                <button class="button button-primary" id="confirm-modify">Update at Exchange</button>
                <button class="button button-outline" id="cancel-modify">Cancel</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Event listeners
    modal.querySelector('#confirm-modify').addEventListener('click', () => {
        const quantity = parseInt(modal.querySelector('#modify-quantity').value);
        const price = parseFloat(modal.querySelector('#modify-price').value);
        
        confirmModifyOrder(orderId, quantity, price, modal);
    });
    
    modal.querySelector('#cancel-modify').addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    modal.querySelector('.modify-modal-close').addEventListener('click', () => {
        document.body.removeChild(modal);
    });
}

// New function to confirm modify order with real-time exchange update
async function confirmModifyOrder(orderId, quantity, price, modal) {
    try {
        const modifyData = {
            quantity: quantity
        };
        
        if (price && price > 0) {
            modifyData.price = price;
        }
        
        const response = await fetch(`/api/orders/${orderId}/modify/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': window.tradeEaseApp.getCsrfToken()
            },
            body: JSON.stringify(modifyData)
        });
        
        const data = await response.json();
        
        if (data.status === 'success') {
            updateStatus(`Order ${orderId} modified successfully at exchange`);
            window.tradeEaseApp.showToast('Order modified at exchange', 'success');
            
            // Update local order info with exchange response
            if (indexState.ordersBeingMonitored[orderId] && data.data) {
                indexState.ordersBeingMonitored[orderId].quantity = data.data.quantity;
                indexState.ordersBeingMonitored[orderId].price = data.data.price;
                indexState.ordersBeingMonitored[orderId].status = data.data.status;
            }
        } else {
            updateStatus(`Modify failed: ${data.message}`);
            window.tradeEaseApp.showToast(`Modify failed: ${data.message}`, 'error');
        }
        
        document.body.removeChild(modal);
        
    } catch (error) {
        console.error('Modify order error:', error);
        window.tradeEaseApp.showToast('Modify failed', 'error');
    }
}

// Handle remove instrument
function handleRemoveInstrument(event) {
    const token = parseInt(event.target.dataset.token);
    
    // Remove from selected instruments
    indexState.selectedInstruments = indexState.selectedInstruments.filter(i => i.instrument_token !== token);
    
    // Update UI
    renderTradingTable();
    
    window.tradeEaseApp.updateStatus(`Removed instrument from watchlist`);
}



// Populate Expiry Dropdowns for Nifty and Bank Nifty
function populateExpiryDropdowns() {
    if (!window.tradeEaseApp.state.instruments || window.tradeEaseApp.state.instruments.length === 0) {
        console.warn('No instruments available to populate expiry dropdowns');
        return;
    }
    
    // Filter for Nifty and Bank Nifty options
    const niftyOptions = window.tradeEaseApp.state.instruments.filter(instr => 
        instr.tradingsymbol.includes('NIFTY') && 
        !instr.tradingsymbol.includes('BANKNIFTY') &&
        !instr.tradingsymbol.includes('FINNIFTY') &&
        (instr.instrument_type === 'CE' || instr.instrument_type === 'PE') &&
        (instr.exchange === 'NFO')
    );
    
    const bankNiftyOptions = window.tradeEaseApp.state.instruments.filter(instr => 
        instr.tradingsymbol.includes('BANKNIFTY') && 
        (instr.instrument_type === 'CE' || instr.instrument_type === 'PE') &&
        (instr.exchange === 'NFO')
    );
    
    // Get unique expiry dates
    const niftyExpiries = [...new Set(niftyOptions.map(opt => opt.expiry))].filter(Boolean).sort();
    const bankNiftyExpiries = [...new Set(bankNiftyOptions.map(opt => opt.expiry))].filter(Boolean).sort();
    
    // Populate Nifty expiry dropdown
    if (optionsElements.niftyExpiry) {
        optionsElements.niftyExpiry.innerHTML = '<option value="">Select Expiry</option>';
        niftyExpiries.forEach(expiry => {
            const option = document.createElement('option');
            option.value = expiry;
            option.textContent = window.tradeEaseApp.formatDate(expiry);
            optionsElements.niftyExpiry.appendChild(option);
        });
    }
    
    // Populate Bank Nifty expiry dropdown
    if (optionsElements.bankniftyExpiry) {
        optionsElements.bankniftyExpiry.innerHTML = '<option value="">Select Expiry</option>';
        bankNiftyExpiries.forEach(expiry => {
            const option = document.createElement('option');
            option.value = expiry;
            option.textContent = window.tradeEaseApp.formatDate(expiry);
            optionsElements.bankniftyExpiry.appendChild(option);
        });
    }
}

// Load options based on selected criteria
function loadOptions(indexType) {
    // Check if instruments data is available
    if (!window.tradeEaseApp.state.instruments || window.tradeEaseApp.state.instruments.length === 0) {
        window.tradeEaseApp.updateStatus('No instrument data available. Please download instruments first.');
        window.tradeEaseApp.showToast('Please download instruments first', 'warning');
        return;
    }
    
    const isNifty = indexType === 'NIFTY';
    
    // Get input elements based on index type
    const spotInput = isNifty ? optionsElements.niftySpot : optionsElements.bankniftySpot;
    const expirySelect = isNifty ? optionsElements.niftyExpiry : optionsElements.bankniftyExpiry;
    const quantityInput = isNifty ? optionsElements.niftyQuantity : optionsElements.bankniftyQuantity;
    const diffInput = isNifty ? optionsElements.niftyDiff : optionsElements.bankniftyDiff;
    const tableBody = isNifty ? optionsElements.niftyOptionsBody : optionsElements.bankniftyOptionsBody;
    
    // Get values
    const spotPrice = parseFloat(spotInput.value);
    const expiryDate = expirySelect.value;
    const quantity = parseInt(quantityInput.value);
    const diff = parseFloat(diffInput.value);
    
    // Validate inputs
    if (isNaN(spotPrice) || !expiryDate || isNaN(quantity) || isNaN(diff)) {
        window.tradeEaseApp.updateStatus(`Please enter valid values for ${indexType} options`);
        window.tradeEaseApp.showToast('Please enter all required values', 'warning');
        return;
    }
    
    // Show loading state
    const loadingOverlay = window.tradeEaseApp.showLoadingState(tableBody.parentElement, `Loading ${indexType} options...`);
    
    // Filter instruments
    const filteredInstruments = window.tradeEaseApp.state.instruments.filter(instr => {
        if (indexType === 'NIFTY') {
            return instr.tradingsymbol.includes('NIFTY') && 
                !instr.tradingsymbol.includes('BANKNIFTY') &&
                !instr.tradingsymbol.includes('FINNIFTY') &&
                (instr.instrument_type === 'CE' || instr.instrument_type === 'PE') &&
                instr.expiry === expiryDate;
        } else {
            return instr.tradingsymbol.includes(indexType) && 
                (instr.instrument_type === 'CE' || instr.instrument_type === 'PE') &&
                instr.expiry === expiryDate;
        }
    });
    
    if (filteredInstruments.length === 0) {
        window.tradeEaseApp.updateStatus(`No ${indexType} options found for the selected expiry date`);
        tableBody.innerHTML = `<tr><td colspan="11" class="text-center">No options found for selected criteria</td></tr>`;
        window.tradeEaseApp.hideLoadingState(loadingOverlay);
        return;
    }
    
    // Group by strike price
    const strikeMap = {};
    filteredInstruments.forEach(instr => {
        const strike = instr.strike;
        if (!strikeMap[strike]) {
            strikeMap[strike] = { CE: null, PE: null };
        }
        
        if (instr.instrument_type === 'CE') {
            strikeMap[strike].CE = instr;
        } else if (instr.instrument_type === 'PE') {
            strikeMap[strike].PE = instr;
        }
    });
    
    // Get strikes around spot price
    const allStrikes = Object.keys(strikeMap).map(Number).sort((a, b) => b - a);
    
    // Find closest strike to spot price
    let closestStrike = allStrikes[0];
    let minDiff = Math.abs(allStrikes[0] - spotPrice);
    
    allStrikes.forEach(strike => {
        const diff = Math.abs(strike - spotPrice);
        if (diff < minDiff) {
            minDiff = diff;
            closestStrike = strike;
        }
    });
    
    // Get 4 strikes above and 4 strikes below
    const strikesBelow = allStrikes.filter(strike => strike <= spotPrice)
                                    .sort((a, b) => b - a)
                                    .slice(0, 4);
    
    const strikesAbove = allStrikes.filter(strike => strike >= spotPrice)
                                    .sort((a, b) => a - b)
                                    .slice(0, 4);
    
    const displayStrikes = [...new Set([...strikesBelow, ...strikesAbove])].sort((a, b) => b - a);
    
    // Clear table
    tableBody.innerHTML = '';
    
    // Create rows for each strike
    displayStrikes.forEach(strike => {
        const row = document.createElement('tr');
        const options = strikeMap[strike];
        
        if (options.CE && options.PE) {
            // Mock some prices for demonstration
            if (!options.CE.last_price) options.CE.last_price = Math.random() * 100 + 50;
            if (!options.PE.last_price) options.PE.last_price = Math.random() * 100 + 50;
            
            const ceMargin = calculateMargin(options.CE.last_price, quantity);
            const peMargin = calculateMargin(options.PE.last_price, quantity);
            
            row.innerHTML = `
                <td class="symbol-cell">${options.CE.tradingsymbol}</td>
                <td class="price-cell" id="price-${options.CE.instrument_token}">${options.CE.last_price.toFixed(2)}</td>
                <td class="text-right" id="margin-${options.CE.instrument_token}">${ceMargin}</td>
                <td>
                    <button class="buy-button" data-token="${options.CE.instrument_token}" 
                            data-symbol="${options.CE.tradingsymbol}" data-type="MKT">Buy</button>
                </td>
                <td>
                    <button class="sell-button" data-token="${options.CE.instrument_token}" 
                            data-symbol="${options.CE.tradingsymbol}" data-type="MKT">Sell</button>
                </td>
                <td class="strike-cell">${strike}</td>
                <td>
                    <button class="buy-button" data-token="${options.PE.instrument_token}" 
                            data-symbol="${options.PE.tradingsymbol}" data-type="MKT">Buy</button>
                </td>
                <td>
                    <button class="sell-button" data-token="${options.PE.instrument_token}" 
                            data-symbol="${options.PE.tradingsymbol}" data-type="MKT">Sell</button>
                </td>
                <td class="text-right" id="margin-${options.PE.instrument_token}">${peMargin}</td>
                <td class="price-cell" id="price-${options.PE.instrument_token}">${options.PE.last_price.toFixed(2)}</td>
                <td class="symbol-cell">${options.PE.tradingsymbol}</td>
            `;
        }
        
        tableBody.appendChild(row);
    });
    
    // Add event listeners to buttons
    tableBody.querySelectorAll('.buy-button').forEach(btn => {
        btn.addEventListener('click', handleOptionBuy);
    });
    
    tableBody.querySelectorAll('.sell-button').forEach(btn => {
        btn.addEventListener('click', handleOptionSell);
    });
    
    // Subscribe to WebSocket for these instruments if connected
    if (window.wsManager && window.wsManager.wsConnected) {
        const tokens = [];
        displayStrikes.forEach(strike => {
            const options = strikeMap[strike];
            if (options.CE) tokens.push(options.CE.instrument_token);
            if (options.PE) tokens.push(options.PE.instrument_token);
        });
        
        if (tokens.length > 0) {
            console.log(`Subscribing to ${tokens.length} option tokens for ${indexType}:`, tokens);
            window.wsManager.subscribe(tokens);
            window.tradeEaseApp.updateStatus(`Subscribed to ${tokens.length} ${indexType} option instruments`);
        } else {
            console.warn(`No tokens found for ${indexType} options subscription`);
        }
    } else {
        console.warn('WebSocket not connected, cannot subscribe to options');
        window.tradeEaseApp.updateStatus('WebSocket not connected - prices will not update in real-time');
    }
    
    // Hide loading state
    window.tradeEaseApp.hideLoadingState(loadingOverlay);
    
    window.tradeEaseApp.updateStatus(`Loaded ${displayStrikes.length} strikes for ${indexType} options`);
}

// Calculate margin based on LTP and quantity
function calculateMargin(lastPrice, quantity) {
    if (!lastPrice || isNaN(lastPrice) || !quantity || isNaN(quantity)) {
        return '-';
    }
    
    const margin = lastPrice * quantity;
    return margin.toFixed(2);
}

// Handle option buy button click
function handleOptionBuy(event) {
    const token = parseInt(event.target.dataset.token);
    const symbol = event.target.dataset.symbol;
    const orderType = event.target.dataset.type || 'MARKET';
    
    if (!token || !symbol) {
        window.tradeEaseApp.showToast('Invalid instrument data', 'error');
        return;
    }
    
    // Determine if it's Nifty or Bank Nifty
    const isNifty = symbol.includes('NIFTY') && !symbol.includes('BANKNIFTY');
    
    // Get quantity
    const quantity = isNifty 
        ? parseInt(optionsElements.niftyQuantity.value) 
        : parseInt(optionsElements.bankniftyQuantity.value);
    
    if (isNaN(quantity) || quantity <= 0) {
        window.tradeEaseApp.showToast('Please enter a valid quantity', 'warning');
        return;
    }
    
    // Find the current price
    const priceCell = document.getElementById(`price-${token}`);
    const currentPrice = priceCell ? parseFloat(priceCell.textContent) : 0;
    
    if (confirm(`Buy ${quantity} ${symbol} at market price?`)) {
        placeOptionOrder(token, symbol, 'BUY', quantity, currentPrice, 'MARKET');
    }
}

// Handle option sell button click
function handleOptionSell(event) {
    const token = parseInt(event.target.dataset.token);
    const symbol = event.target.dataset.symbol;
    const orderType = event.target.dataset.type || 'MARKET';
    
    if (!token || !symbol) {
        window.tradeEaseApp.showToast('Invalid instrument data', 'error');
        return;
    }
    
    // Determine if it's Nifty or Bank Nifty
    const isNifty = symbol.includes('NIFTY') && !symbol.includes('BANKNIFTY');
    
    // Get quantity
    const quantity = isNifty 
        ? parseInt(optionsElements.niftyQuantity.value) 
        : parseInt(optionsElements.bankniftyQuantity.value);
    
    if (isNaN(quantity) || quantity <= 0) {
        window.tradeEaseApp.showToast('Please enter a valid quantity', 'warning');
        return;
    }
    
    // Find the current price
    const priceCell = document.getElementById(`price-${token}`);
    const currentPrice = priceCell ? parseFloat(priceCell.textContent) : 0;
    
    if (confirm(`Sell ${quantity} ${symbol} at market price?`)) {
        placeOptionOrder(token, symbol, 'SELL', quantity, currentPrice, 'MARKET');
    }
}

// Place option order
// Update the placeOptionOrder function with correct error handling
function placeOptionOrder(token, symbol, transactionType, quantity, price, orderType) {
    if (!window.tradeEaseApp.state.isAuthenticated) {
        window.tradeEaseApp.updateStatus('Please login first to place orders');
        window.tradeEaseApp.showToast('Authentication required', 'warning');
        return;
    }
    
    window.tradeEaseApp.updateStatus(`Placing ${transactionType} ${orderType} order for ${quantity} ${symbol}...`);
    
    const exchange = symbol.includes('NIFTY') ? 'NFO' : 'NSE';
    
    const orderData = {
        tradingsymbol: symbol,
        exchange: exchange,
        transaction_type: transactionType,
        quantity: quantity,
        product: 'MIS',
        order_type: orderType
    };
    
    if (price && (orderType === 'LIMIT' || orderType === 'SL')) {
        orderData.price = price;
    }
    
    window.tradeEaseApp.fetchWithCSRF('/api/orders/place/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Token ${window.tradeEaseApp.state.sessionToken}`
        },
        body: JSON.stringify(orderData)
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
            const orderId = data.order_id;
            window.tradeEaseApp.updateStatus(`${transactionType} order placed successfully. Order ID: ${orderId}`);
            window.tradeEaseApp.showToast(`Order placed: ${orderId}`, 'success');
            
            // Add order to log
            addOrderToLog(orderId, symbol, transactionType, quantity, price, 'PUT ORDER REQ RECEIVED');
            
            // START MONITORING HERE TOO
            console.log(`🚀 Starting status monitoring for option order ${orderId}`);
            setTimeout(() => {
                checkOrderStatusAndExitIfFilled(orderId);
            }, 1000);
            
            // NEW: Schedule auto opposite order for options too
            const isNifty = symbol.includes('NIFTY') && !symbol.includes('BANKNIFTY');
            const diff = isNifty 
                ? parseFloat(optionsElements.niftyDiff.value) || 1.5
                : parseFloat(optionsElements.bankniftyDiff.value) || 1.5;
            
            scheduleAutoOppositeOrder(orderId, {
                symbol: symbol,
                exchange: exchange,
                transaction_type: transactionType,
                quantity: quantity,
                diff: diff,
                original_price: price,
                order_id: orderId
            });
            
        } else {
            window.tradeEaseApp.updateStatus(`Order placement failed: ${data.message}`);
            window.tradeEaseApp.showToast(`Order failed: ${data.message}`, 'error');
            
            // Add failed order to log
            addOrderToLog(null, symbol, transactionType, quantity, price, 'REJECTED', data.message);
        }
    })
    .catch(error => {
        console.error('Order placement error:', error);
        window.tradeEaseApp.updateStatus(`Error placing order: ${error.message}`);
        window.tradeEaseApp.showToast('Failed to place order', 'error');
        
        // Add error order to log
        addOrderToLog(null, symbol, transactionType, quantity, price, 'FAILED', error.message);
    });
}

// Update options price from WebSocket
function updateOptionsPrice(token, price) {
    // Find all price cells for this token (could be in multiple tables)
    const priceCells = document.querySelectorAll(`#price-${token}`);
    
    if (priceCells.length === 0) {
        console.log(`No price cell found for token ${token}`);
        return;
    }
    
    priceCells.forEach(priceCell => {
        const oldPrice = parseFloat(priceCell.textContent) || 0;
        
        // Update price
        priceCell.textContent = price.toFixed(2);
        
        // Add visual indicator for price change
        priceCell.classList.remove('price-up', 'price-down');
        if (price > oldPrice) {
            priceCell.classList.add('price-up');
        } else if (price < oldPrice) {
            priceCell.classList.add('price-down');
        }
        
        // Update margin for this instrument
        const marginCell = document.getElementById(`margin-${token}`);
        if (marginCell) {
            // Determine the quantity based on which table the cell is in
            let quantity = 75; // Default for Nifty
            
            const row = priceCell.closest('tr');
            if (row) {
                const tbody = row.closest('tbody');
                if (tbody) {
                    if (tbody.id === 'nifty-options-body') {
                        quantity = parseInt(optionsElements.niftyQuantity.value) || 75;
                    } else if (tbody.id === 'banknifty-options-body') {
                        quantity = parseInt(optionsElements.bankniftyQuantity.value) || 30;
                    }
                }
            }
            
            marginCell.textContent = calculateMargin(price, quantity);
        }
        
        console.log(`Updated price for token ${token}: ${price} (old: ${oldPrice})`);
    });
}

// NEW: Position tracking and management functions

// Update position tracker when orders are filled
function updatePositionTracker(symbol, transactionType, quantity, avgPrice) {
    if (!indexState.positionTracker[symbol]) {
        indexState.positionTracker[symbol] = {
            symbol: symbol,
            netQuantity: 0,
            totalBuyQty: 0,
            totalSellQty: 0,
            totalBuyValue: 0,
            totalSellValue: 0,
            avgPrice: 0,
            currentPrice: 0,
            grossPL: 0,
            netPL: 0, // Reserved for future brokerage calculations
            lastUpdated: new Date()
        };
    }
    
    const position = indexState.positionTracker[symbol];
    
    if (transactionType === 'BUY') {
        position.totalBuyQty += quantity;
        position.totalBuyValue += (quantity * avgPrice);
        position.netQuantity += quantity;
    } else if (transactionType === 'SELL') {
        position.totalSellQty += quantity;
        position.totalSellValue += (quantity * avgPrice);
        position.netQuantity -= quantity;
    }
    
    // Calculate average price
    if (position.netQuantity > 0) {
        // Net long position - use average buy price
        position.avgPrice = position.totalBuyQty > 0 ? 
            (position.totalBuyValue / position.totalBuyQty) : 0;
    } else if (position.netQuantity < 0) {
        // Net short position - use average sell price
        position.avgPrice = position.totalSellQty > 0 ? 
            (position.totalSellValue / position.totalSellQty) : 0;
    } else {
        // Square position - calculate realized P&L
        const realizedPL = position.totalSellValue - position.totalBuyValue;
        position.avgPrice = 0;
        position.grossPL = realizedPL;
    }
    
    position.lastUpdated = new Date();
    
    // Update position panel display
    updatePositionPanel();
    
    console.log(`Position updated for ${symbol}:`, position);
}

// Calculate current P&L for a position
function calculatePositionPL(position) {
    if (!position || position.netQuantity === 0) {
        return {
            grossPL: position ? position.grossPL : 0, // Realized P&L for square positions
            netPL: position ? position.netPL : 0 // Reserved for future
        };
    }
    
    const currentPrice = position.currentPrice || position.avgPrice;
    let unrealizedPL = 0;
    
    if (position.netQuantity > 0) {
        // Long position: P&L = (Current Price - Avg Buy Price) * Net Qty
        unrealizedPL = (currentPrice - position.avgPrice) * position.netQuantity;
    } else if (position.netQuantity < 0) {
        // Short position: P&L = (Avg Sell Price - Current Price) * Abs(Net Qty)
        unrealizedPL = (position.avgPrice - currentPrice) * Math.abs(position.netQuantity);
    }
    
    // Add any realized P&L from previous square-offs
    const totalGrossPL = unrealizedPL + (position.grossPL || 0);
    
    return {
        grossPL: totalGrossPL,
        netPL: totalGrossPL // Same as gross for now, will subtract brokerage later
    };
}

// Update position panel display
function updatePositionPanel() {
    const positionsTableBody = document.getElementById('positions-table-body');
    if (!positionsTableBody) return;
    
    const positions = Object.values(indexState.positionTracker);
    
    if (positions.length === 0) {
        positionsTableBody.innerHTML = '<tr><td colspan="7" class="text-center text-gray-500">No positions yet</td></tr>';
        return;
    }
    
    // Clear existing rows
    positionsTableBody.innerHTML = '';
    
    // Sort positions by symbol
    positions.sort((a, b) => a.symbol.localeCompare(b.symbol));
    
    positions.forEach(position => {
        const pl = calculatePositionPL(position);
        const row = document.createElement('tr');
        
        // Determine P&L styling
        let plClass = '';
        if (pl.grossPL > 0) {
            plClass = 'text-success';
        } else if (pl.grossPL < 0) {
            plClass = 'text-danger';
        }
        
        // Format net quantity with sign
        let netQtyDisplay = position.netQuantity;
        let qtyClass = '';
        if (position.netQuantity > 0) {
            netQtyDisplay = `+${position.netQuantity}`;
            qtyClass = 'text-success';
        } else if (position.netQuantity < 0) {
            netQtyDisplay = `${position.netQuantity}`;
            qtyClass = 'text-danger';
        } else {
            netQtyDisplay = '0';
            qtyClass = 'text-muted';
        }
        
        row.innerHTML = `
            <td>${position.symbol}</td>
            <td class="text-right ${qtyClass}">${netQtyDisplay}</td>
            <td class="text-right">₹${position.avgPrice.toFixed(2)}</td>
            <td class="text-right" id="pos-price-${position.symbol}">₹${(position.currentPrice || position.avgPrice).toFixed(2)}</td>
            <td class="text-right ${plClass}" id="pos-pl-${position.symbol}">₹${pl.grossPL.toFixed(2)}</td>
            <td class="text-right text-muted">₹${pl.netPL.toFixed(2)}</td>
            <td class="text-center">
                <button class="button button-outline reset-position-btn" 
                        data-symbol="${position.symbol}" 
                        style="font-size: 0.75rem; padding: 0.25rem 0.5rem;">Reset</button>
            </td>
        `;
        
        positionsTableBody.appendChild(row);
    });
    
    // Add event listeners for reset buttons
    document.querySelectorAll('.reset-position-btn').forEach(btn => {
        btn.addEventListener('click', handleResetPosition);
    });
}

// Handle individual position reset
function handleResetPosition(event) {
    const symbol = event.target.dataset.symbol;
    
    if (confirm(`Reset position for ${symbol}? This will clear all tracking data.`)) {
        delete indexState.positionTracker[symbol];
        updatePositionPanel();
        window.tradeEaseApp.updateStatus(`Position reset for ${symbol}`);
        window.tradeEaseApp.showToast(`Position reset: ${symbol}`, 'info');
    }
}

// Handle reset all positions
function handleResetAllPositions() {
    if (confirm('Reset all positions? This will clear all position tracking data.')) {
        indexState.positionTracker = {};
        updatePositionPanel();
        window.tradeEaseApp.updateStatus('All positions reset');
        window.tradeEaseApp.showToast('All positions reset', 'info');
    }
}

// Update position prices from WebSocket tick data
function updatePositionPrices(tickData) {
    if (!tickData || !tickData.instrument_token) return;
    
    const token = parseInt(tickData.instrument_token);
    const newPrice = parseFloat(tickData.last_price);
    
    if (isNaN(newPrice)) return;
    
    // Find position by matching instrument token to symbol
    // Note: We'll need to enhance this to match by instrument token rather than symbol
    Object.values(indexState.positionTracker).forEach(position => {
        // For now, we'll update based on symbol matching from selectedInstruments
        const matchingInstrument = indexState.selectedInstruments.find(
            instrument => parseInt(instrument.instrument_token) === token
        );
        
        if (matchingInstrument && matchingInstrument.tradingsymbol === position.symbol) {
            const oldPrice = position.currentPrice || position.avgPrice;
            position.currentPrice = newPrice;
            
            // Update position panel price cell
            const priceCell = document.getElementById(`pos-price-${position.symbol}`);
            if (priceCell) {
                priceCell.textContent = `₹${newPrice.toFixed(2)}`;
                
                // Add visual indicator for price change
                priceCell.classList.remove('price-up', 'price-down');
                if (newPrice > oldPrice) {
                    priceCell.classList.add('price-up');
                } else if (newPrice < oldPrice) {
                    priceCell.classList.add('price-down');
                }
            }
            
            // Update P&L cell
            const pl = calculatePositionPL(position);
            const plCell = document.getElementById(`pos-pl-${position.symbol}`);
            if (plCell) {
                let plClass = '';
                if (pl.grossPL > 0) {
                    plClass = 'text-success';
                } else if (pl.grossPL < 0) {
                    plClass = 'text-danger';
                }
                
                plCell.className = `text-right ${plClass}`;
                plCell.textContent = `₹${pl.grossPL.toFixed(2)}`;
            }
        }
    });
}

// Enhanced WebSocket price update function
window.updateInstrumentPrice = function(tickData) {
    if (!tickData || !tickData.instrument_token) {
        console.warn("Invalid tick data received:", tickData);
        return;
    }
    
    const token = parseInt(tickData.instrument_token);
    const newPrice = parseFloat(tickData.last_price);
    
    if (isNaN(newPrice)) {
        console.warn(`Tick for token ${token} has invalid price:`, tickData.last_price);
        return;
    }
    
    console.log(`Processing tick for token ${token}: ${newPrice}`);
    
    // Update trading table prices (existing functionality)
    const instrumentIndex = indexState.selectedInstruments.findIndex(
        instrument => parseInt(instrument.instrument_token) === token
    );
    
    if (instrumentIndex >= 0) {
        const instrument = indexState.selectedInstruments[instrumentIndex];
        const oldPrice = parseFloat(instrument.last_price) || 0;
        
        // Update the price in state
        indexState.selectedInstruments[instrumentIndex].last_price = newPrice;
        
        // Update trading table UI
        const priceCell = document.getElementById(`price-${token}`);
        if (priceCell) {
            priceCell.textContent = newPrice.toFixed(2);
            
            // Add visual indicator for price change
            priceCell.classList.remove('price-up', 'price-down');
            
            if (newPrice > oldPrice) {
                priceCell.classList.add('price-up');
            } else if (newPrice < oldPrice) {
                priceCell.classList.add('price-down');
            }
        }
        
        console.log(`Updated trading table for token ${token}`);
    }
    
    // Update position panel prices
    updatePositionPrices(tickData);
    
    // Update options panels - THIS IS THE KEY FIX
    updateOptionsPrice(token, newPrice);
};

// Fixed addOrderToLog function with correct column positioning
// Fixed addOrderToLog function with status support
function addOrderToLog(orderId, symbol, transactionType, quantity, price, status = 'PENDING', errorMessage = '', isAutoOrder = false) {
    console.log('📝 addOrderToLog called with:', {
        orderId, symbol, transactionType, quantity, price, status, errorMessage, isAutoOrder
    });
    
    if (!orderLogBody) {
        console.error('❌ orderLogBody element not found!');
        // Try to find it again
        orderLogBody = document.getElementById('order-log-body');
        if (!orderLogBody) {
            console.error('❌ Still cannot find order-log-body element!');
            return;
        }
    }
    
    // Clear "No orders yet" message
    if (orderLogBody.children.length === 1 && orderLogBody.children[0].textContent.includes('No orders yet')) {
        orderLogBody.innerHTML = '';
        console.log('✅ Cleared "No orders yet" message');
    }
    
    // Create new row
    const row = document.createElement('tr');
    row.dataset.orderId = orderId || 'FAILED';
    row.dataset.symbol = symbol;
    row.dataset.transactionType = transactionType;
    
    // Determine status display
    let statusDisplay = status;
    let statusClass = '';
    
    if (status === 'REJECTED' || status === 'FAILED') {
        statusDisplay = errorMessage ? `${status}: ${errorMessage}` : status;
        statusClass = 'text-danger';
    } else if (status === 'COMPLETE') {
        statusClass = 'text-success';
    } else if (status === 'PENDING' || status === 'OPEN') {
        statusClass = 'text-warning';
    }
    
    const autoIndicator = isAutoOrder ? ' 🤖' : '';
    const symbolDisplay = `${symbol} ${transactionType}${autoIndicator}`;
    
    // Create cells based on transaction type
    if (transactionType === 'BUY') {
        row.innerHTML = `
            <td>${symbolDisplay}</td>
            <td class="text-right">${price ? price.toFixed(2) : '-'}</td>
            <td>${orderId || 'FAILED'}</td>
            <td class="text-right">-</td>
            <td>-</td>
            <td class="text-right">-</td>
            <td class="text-center">
                ${orderId && orderId !== 'FAILED' ? 
                    `<button class="button button-sm exit-btn" data-order-id="${orderId}">Exit</button>` : 
                    '-'}
            </td>
            <td class="text-center ${statusClass}" id="status-${orderId || 'failed'}">${statusDisplay}</td>
            <td class="text-right">${quantity}</td>
        `;
    } else { // SELL
        row.innerHTML = `
            <td>${symbolDisplay}</td>
            <td class="text-right">-</td>
            <td>-</td>
            <td class="text-right">${price ? price.toFixed(2) : '-'}</td>
            <td>${orderId || 'FAILED'}</td>
            <td class="text-right">-</td>
            <td class="text-center">
                ${orderId && orderId !== 'FAILED' ? 
                    `<button class="button button-sm exit-btn" data-order-id="${orderId}">Exit</button>` : 
                    '-'}
            </td>
            <td class="text-center ${statusClass}" id="status-${orderId || 'failed'}">${statusDisplay}</td>
            <td class="text-right">${quantity}</td>
        `;
    }
    
    orderLogBody.appendChild(row);
    console.log('✅ Row added to order log table');
    
    // Store for monitoring if valid order
    if (orderId && orderId !== 'FAILED' && orderId !== 'ERROR') {
        indexState.ordersBeingMonitored[orderId] = {
            symbol: symbol,
            transactionType: transactionType,
            quantity: quantity,
            price: price,
            status: status,
            rowElement: row,
            isAutoOrder: isAutoOrder
        };
        console.log('✅ Order added to monitoring list');
    }
}

// Enhanced updateOrderStatus function
// Enhanced updateOrderStatus function
// Enhanced updateOrderStatus function
function updateOrderStatus(orderId, newStatus, statusMessage = '') {
    console.log(`📝 Updating order ${orderId} to status: ${newStatus}`);
    
    const statusCell = document.getElementById(`status-${orderId}`);
    if (!statusCell) {
        console.error(`Status cell not found for order ${orderId}`);
        return;
    }
    
    // Update the monitoring info
    if (indexState.ordersBeingMonitored[orderId]) {
        indexState.ordersBeingMonitored[orderId].status = newStatus;
        indexState.ordersBeingMonitored[orderId].statusMessage = statusMessage;
    }
    
    // Determine status styling
    let statusClass = '';
    let statusIcon = '';
    
    // Group statuses by type
    const successStatuses = ['COMPLETE', 'MODIFIED'];
    const errorStatuses = ['REJECTED', 'CANCELLED'];
    const warningStatuses = ['OPEN', 'TRIGGER PENDING'];
    const pendingStatuses = [
        'PUT ORDER REQ RECEIVED', 'VALIDATION PENDING', 'OPEN PENDING',
        'MODIFY VALIDATION PENDING', 'MODIFY PENDING', 'CANCEL PENDING', 
        'AMO REQ RECEIVED'
    ];
    
    if (successStatuses.includes(newStatus)) {
        statusClass = 'text-success';
        statusIcon = '✅ ';
    } else if (errorStatuses.includes(newStatus)) {
        statusClass = 'text-danger';
        statusIcon = '❌ ';
    } else if (warningStatuses.includes(newStatus)) {
        statusClass = 'text-warning';
        statusIcon = '⚠️ ';
    } else if (pendingStatuses.includes(newStatus)) {
        statusClass = 'text-info';
        statusIcon = '⏳ ';
    }
    
    // Build display text
    let displayText = statusIcon + newStatus;
    if (statusMessage) {
        displayText += `: ${statusMessage}`;
    }
    
    // Update the cell
    statusCell.className = `text-center ${statusClass}`;
    statusCell.textContent = displayText;
    
    // Animate the update
    statusCell.style.transition = 'background-color 0.3s';
    statusCell.style.backgroundColor = 'rgba(255, 255, 0, 0.2)';
    setTimeout(() => {
        statusCell.style.backgroundColor = '';
    }, 300);
}

// Enhanced function to check order statuses and trigger auto orders
// Fixed and enhanced order status checking
// Enhanced order status checking with better logging
async function checkOrderStatuses() {
    if (!window.tradeEaseApp.state.isAuthenticated) {
        console.log('Not authenticated, skipping status check');
        return;
    }
    
    const orderIds = Object.keys(indexState.ordersBeingMonitored);
    const pendingAutoOrderIds = Object.keys(indexState.pendingAutoOrders);
    const allOrderIds = [...new Set([...orderIds, ...pendingAutoOrderIds])];
    
    if (allOrderIds.length === 0) {
        console.log('No orders to monitor');
        return;
    }
    
    console.log('🔍 Checking status for orders:', allOrderIds);
    
    try {
        const response = await fetch('/api/orders/', {
            headers: {
                'Authorization': `Token ${window.tradeEaseApp.state.sessionToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('📡 Raw API Response:', data);
        
        // Handle both possible response formats for compatibility
        let orders = [];
        if (data.status === 'success' && data.data && Array.isArray(data.data)) {
            orders = data.data; // ✅ Correct format
        } else if (data.orders && Array.isArray(data.orders)) {
            orders = data.orders; // ❌ Legacy format (fallback)
        } else {
            console.error('❌ Unexpected API response format:', data);
            return;
        }
        
        console.log(`📊 Processing ${orders.length} orders from API`);
        
        orders.forEach(order => {
            const orderId = order.order_id;
            
            // Update order status in the log
            if (indexState.ordersBeingMonitored[orderId]) {
                console.log(`📝 Updating status for ${orderId}: ${order.status}`);
                updateOrderStatus(orderId, order.status, order.status_message);
            }
            
            // Check for auto-order triggers
            if (indexState.pendingAutoOrders[orderId]) {
                console.log(`🤖 Checking auto-order trigger for ${orderId}`);
                handleAutoOrderTrigger(order);
            }
        });
        
    } catch (error) {
        console.error('❌ Error checking order statuses:', error);
        console.error('❌ Error details:', {
            message: error.message,
            stack: error.stack
        });
    }
}

// NEW: Handle auto-order placement when parent order fills
function handleAutoOrderTrigger(order) {
    const orderId = order.order_id;
    const autoOrderInfo = indexState.pendingAutoOrders[orderId];
    
    // Check if order is completely filled
    if (order.status === 'COMPLETE' && order.filled_quantity == order.quantity) {
        window.tradeEaseApp.updateStatus(`Order ${orderId} completely filled. Placing auto opposite order...`);
        
        // Calculate opposite order details
        const oppositeTransactionType = autoOrderInfo.transaction_type === 'BUY' ? 'SELL' : 'BUY';
        const avgPrice = parseFloat(order.average_price || order.price || autoOrderInfo.original_price);
        
        // Calculate target price based on diff
        let targetPrice;
        if (autoOrderInfo.transaction_type === 'BUY') {
            // For BUY orders, sell at buy_price + diff
            targetPrice = avgPrice + autoOrderInfo.diff;
        } else {
            // For SELL orders, buy at sell_price - diff
            targetPrice = avgPrice - autoOrderInfo.diff;
        }
        
        // Place auto opposite order
        placeAutoOppositeOrder(autoOrderInfo, oppositeTransactionType, targetPrice, order.filled_quantity);
        
        // Update position tracker
        updatePositionTracker(autoOrderInfo.symbol, autoOrderInfo.transaction_type, 
                            order.filled_quantity, avgPrice);
        
        // Remove from pending auto orders
        delete indexState.pendingAutoOrders[orderId];
        
        window.tradeEaseApp.showToast(`Auto ${oppositeTransactionType} order placed for ${autoOrderInfo.symbol}`, 'success');
    }
    
    // Handle partial fills (for future enhancement)
    else if (order.status === 'COMPLETE' && order.filled_quantity < order.quantity) {
        window.tradeEaseApp.updateStatus(`Order ${orderId} partially filled: ${order.filled_quantity}/${order.quantity}`);
        // For now, we wait for complete fill as per requirement
    }
}

// NEW: Place automatic opposite order
async function placeAutoOppositeOrder(parentOrderInfo, transactionType, targetPrice, quantity) {
    try {
        const orderData = {
            tradingsymbol: parentOrderInfo.symbol,
            exchange: parentOrderInfo.exchange,
            transaction_type: transactionType,
            quantity: quantity,
            product: 'MIS',
            order_type: 'LIMIT',
            price: targetPrice.toFixed(2),
            validity: 'DAY',
            tag: 'TradeEase-Auto'
        };
        
        const response = await fetch('/api/orders/place/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Token ${window.tradeEaseApp.state.sessionToken}`,
                'X-CSRFToken': window.tradeEaseApp.getCsrfToken()
            },
            body: JSON.stringify(orderData)
        });
        
        const data = await response.json();
        
        if (data.status === 'success') {
            const autoOrderId = data.order_id;
            
            // Link parent and child orders
            indexState.autoOrderPairs[parentOrderInfo.order_id] = autoOrderId;
            
            // Add auto order to monitoring (but not for further auto orders)
            addOrderToLog(autoOrderId, parentOrderInfo.symbol, transactionType, 
                         quantity, targetPrice, 'PENDING', '', true); // isAutoOrder = true
            
            window.tradeEaseApp.updateStatus(`Auto ${transactionType} order placed: ${autoOrderId} at ₹${targetPrice.toFixed(2)}`);
        } else {
            window.tradeEaseApp.updateStatus(`Failed to place auto order: ${data.message}`);
            window.tradeEaseApp.showToast(`Auto order failed: ${data.message}`, 'error');
        }
    } catch (error) {
        console.error('Error placing auto opposite order:', error);
        window.tradeEaseApp.updateStatus(`Error placing auto order: ${error.message}`);
    }
}

// Setup quantity change handlers
function setupQuantityChangeHandlers() {
    // When Nifty quantity changes, update all margin calculations
    if (optionsElements.niftyQuantity) {
        optionsElements.niftyQuantity.addEventListener('change', () => {
            updateAllMargins('nifty-options-body');
        });
    }
    
    // When Bank Nifty quantity changes, update all margin calculations
    if (optionsElements.bankniftyQuantity) {
        optionsElements.bankniftyQuantity.addEventListener('change', () => {
            updateAllMargins('banknifty-options-body');
        });
    }
}

// Update margins for all instruments in the options table
function updateAllMargins(tableBodyId) {
    const tableBody = document.getElementById(tableBodyId);
    if (!tableBody) return;
    
    const isNifty = tableBodyId === 'nifty-options-body';
    const quantity = isNifty 
        ? parseInt(optionsElements.niftyQuantity.value) 
        : parseInt(optionsElements.bankniftyQuantity.value);
    
    if (isNaN(quantity) || quantity <= 0) return;
    
    // Find all price cells and update corresponding margins
    const priceCells = tableBody.querySelectorAll('[id^="price-"]');
    priceCells.forEach(priceCell => {
        const token = priceCell.id.replace('price-', '');
        const price = parseFloat(priceCell.textContent);
        
        if (!isNaN(price) && price > 0) {
            const marginCell = document.getElementById(`margin-${token}`);
            if (marginCell) {
                marginCell.textContent = calculateMargin(price, quantity);
            }
        }
    });
}

// Initialize Options Panels
function initOptionsPanel() {
    // Check if elements exist before adding event listeners
    if (optionsElements.niftyLoadBtn) {
        optionsElements.niftyLoadBtn.addEventListener('click', () => loadOptions('NIFTY'));
    }
    
    if (optionsElements.bankniftyLoadBtn) {
        optionsElements.bankniftyLoadBtn.addEventListener('click', () => loadOptions('BANKNIFTY'));
    }
    
    // Set default values for quantity inputs with correct step values
    if (optionsElements.niftyQuantity) {
        optionsElements.niftyQuantity.value = '75';
        optionsElements.niftyQuantity.min = '75';
        optionsElements.niftyQuantity.step = '75';
    }
    
    if (optionsElements.bankniftyQuantity) {
        optionsElements.bankniftyQuantity.value = '30';
        optionsElements.bankniftyQuantity.min = '30';
        optionsElements.bankniftyQuantity.step = '30';
    }
    
    // Set default diff values
    if (optionsElements.niftyDiff) {
        optionsElements.niftyDiff.value = '1.5';
    }
    
    if (optionsElements.bankniftyDiff) {
        optionsElements.bankniftyDiff.value = '1.5';
    }
}

// Handle option chain button
function handleOptionChainButton() {
    // Open option chain analysis in a new tab, preserving session
    window.open('/api/option-chain/', '_blank');
}

// NEW: Handle exit button clicks for order modification
function handleExitOrder(button) {
    const orderId = button.dataset.orderId;
    const symbol = button.dataset.symbol;
    
    if (!orderId || orderId === 'FAILED') {
        window.tradeEaseApp.showToast('Invalid order ID', 'error');
        return;
    }
    
    // Find the order details
    const orderInfo = indexState.ordersBeingMonitored[orderId];
    if (!orderInfo) {
        window.tradeEaseApp.showToast('Order not found in monitoring list', 'error');
        return;
    }
    
    // Show exit confirmation modal with quantity modification option
    showExitOrderModal(orderId, symbol, orderInfo);
}

// NEW: Show exit order modal
function showExitOrderModal(orderId, symbol, orderInfo) {
    // Create modal HTML
    const modal = document.createElement('div');
    modal.className = 'exit-modal-overlay';
    modal.innerHTML = `
        <div class="exit-modal">
            <div class="exit-modal-header">
                <h3>Exit Position: ${symbol}</h3>
                <button class="exit-modal-close">&times;</button>
            </div>
            <div class="exit-modal-body">
                <p><strong>Order ID:</strong> ${orderId}</p>
                <p><strong>Current Type:</strong> LIMIT Order</p>
                <p><strong>Original Quantity:</strong> ${orderInfo.quantity}</p>
                <div class="form-group">
                    <label for="exit-quantity">Exit Quantity:</label>
                    <input type="number" id="exit-quantity" value="${orderInfo.quantity}" 
                           min="1" max="${orderInfo.quantity}" class="input">
                </div>
                <p><em>This will convert the LIMIT order to MARKET order for immediate execution.</em></p>
            </div>
            <div class="exit-modal-footer">
                <button class="button button-danger" id="confirm-exit">Convert to Market Order</button>
                <button class="button button-outline" id="cancel-exit">Cancel</button>
            </div>
        </div>
    `;
    
    // Add modal styles
    const style = document.createElement('style');
    style.textContent = `
        .exit-modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 1000;
        }
        .exit-modal {
            background: white;
            border-radius: 8px;
            max-width: 400px;
            width: 90%;
            max-height: 90vh;
            overflow-y: auto;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        .exit-modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 1rem;
            border-bottom: 1px solid #eee;
        }
        .exit-modal-body {
            padding: 1rem;
        }
        .exit-modal-footer {
            display: flex;
            gap: 0.5rem;
            padding: 1rem;
            border-top: 1px solid #eee;
        }
        .exit-modal-close {
            background: none;
            border: none;
            font-size: 1.5rem;
            cursor: pointer;
        }
        .form-group {
            margin: 1rem 0;
        }
        .form-group label {
            display: block;
            margin-bottom: 0.5rem;
            font-weight: 500;
        }
    `;
    
    document.head.appendChild(style);
    document.body.appendChild(modal);
    
    // Event listeners
    modal.querySelector('#confirm-exit').addEventListener('click', () => {
        const exitQuantity = parseInt(modal.querySelector('#exit-quantity').value);
        confirmExitOrder(orderId, symbol, exitQuantity, modal, style);
    });
    
    modal.querySelector('#cancel-exit').addEventListener('click', () => {
        document.body.removeChild(modal);
        document.head.removeChild(style);
    });
    
    modal.querySelector('.exit-modal-close').addEventListener('click', () => {
        document.body.removeChild(modal);
        document.head.removeChild(style);
    });
    
    // Close on overlay click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
            document.head.removeChild(style);
        }
    });
}

// NEW: Confirm and execute exit order
async function confirmExitOrder(orderId, symbol, exitQuantity, modal, style) {
    try {
        window.tradeEaseApp.updateStatus(`Converting order ${orderId} to market order...`);
        
        const response = await fetch(`/api/orders/${orderId}/modify/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Token ${window.tradeEaseApp.state.sessionToken}`,
                'X-CSRFToken': window.tradeEaseApp.getCsrfToken()
            },
            body: JSON.stringify({
                quantity: exitQuantity,
                order_type: 'MARKET'
            })
        });
        
        const data = await response.json();
        
        if (data.status === 'success') {
            window.tradeEaseApp.updateStatus(`Order ${orderId} converted to market order successfully`);
            window.tradeEaseApp.showToast(`Exit order placed for ${symbol}`, 'success');
            
            // Update order status in the log
            updateOrderStatus(orderId, 'MODIFIED');
        } else {
            window.tradeEaseApp.updateStatus(`Failed to modify order: ${data.message}`);
            window.tradeEaseApp.showToast(`Exit failed: ${data.message}`, 'error');
        }
        
        // Close modal
        document.body.removeChild(modal);
        document.head.removeChild(style);
        
    } catch (error) {
        console.error('Error modifying order:', error);
        window.tradeEaseApp.updateStatus(`Error: ${error.message}`);
        window.tradeEaseApp.showToast('Failed to modify order', 'error');
    }
}

// Tab functionality
function initializeTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.dataset.tab;
            
            // Remove active class from all buttons and contents
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));
            
            // Add active class to clicked button and corresponding content
            button.classList.add('active');
            document.getElementById(`${targetTab}-tab`).classList.add('active');
        });
    });
}


// Add this debug helper function
window.debugOrderLog = function() {
    console.log('=== ORDER LOG DEBUG ===');
    console.log('Orders being monitored:', indexState.ordersBeingMonitored);
    console.log('Pending auto orders:', indexState.pendingAutoOrders);
    console.log('Order log body element:', orderLogBody);
    console.log('Order log rows:', orderLogBody ? orderLogBody.children.length : 'N/A');
    console.log('========================');
};
// Initialize the index page
// Enhanced initIndex function with proper polling setup
function initIndex() {
    // Initialize DOM elements
    initializeIndexElements();
    
    initializeTabs();
    
    // Check for existing session token
    window.tradeEaseApp.checkSavedAuthToken();
    
    // Set up event listeners (existing code)
    if (loginBtn) loginBtn.addEventListener('click', handleLogin);
    if (profileBtn) profileBtn.addEventListener('click', getProfile);
    if (downloadBtn) downloadBtn.addEventListener('click', downloadInstruments);
    if (debugBtn) debugBtn.addEventListener('click', async () => {
        try {
            const response = await fetch('/api/instruments/debug/');
            const data = await response.json();
            window.tradeEaseApp.updateStatus(`Debug: ${data.message}`);
        } catch (error) {
            console.error('Debug error:', error);
            window.tradeEaseApp.updateStatus(`Debug error: ${error.message}`);
        }
    });

    // Option chain button
    const optionChainBtn = document.getElementById('option-chain-btn');
    if (optionChainBtn) {
        optionChainBtn.addEventListener('click', handleOptionChainButton);
    }

    // WebSocket related event listeners
    if (connectWsBtn) connectWsBtn.addEventListener('click', () => {
        if (window.wsManager) {
            window.wsManager.connect();
        }
    });
    if (disconnectWsBtn) disconnectWsBtn.addEventListener('click', () => {
        if (window.wsManager) {
            window.wsManager.disconnect();
        }
    });
    
    // Search functionality (existing code)
    if (instrumentSearch) {
        instrumentSearch.addEventListener('input', window.tradeEaseApp.debounce(handleInstrumentSearch, 300));
        instrumentSearch.addEventListener('focus', handleInstrumentSearch);
        
        instrumentSearch.addEventListener('keydown', function(event) {
            if (event.key === 'Enter' && indexState.searchResults.length > 0) {
                indexState.selectedSearchItem = indexState.searchResults[0];
                instrumentSearch.value = indexState.selectedSearchItem.tradingsymbol;
                searchSuggestions.style.display = 'none';
                event.preventDefault();
            }
        });
    }

    // Add global click handler to close the dropdown when clicking outside
    document.addEventListener('click', function(event) {
        if (searchSuggestions && !searchSuggestions.contains(event.target) && 
            event.target !== instrumentSearch) {
            searchSuggestions.style.display = 'none';
        }
    });
    
    if (addInstrumentBtn) addInstrumentBtn.addEventListener('click', addSelectedInstrument);
    
    // Initialize options panel
    initOptionsPanel();
    
    // Setup quantity change handlers
    setupQuantityChangeHandlers();
    
    // Position Panel event listeners
    const refreshPositionsBtn = document.getElementById('refresh-positions-btn');
    if (refreshPositionsBtn) {
        refreshPositionsBtn.addEventListener('click', () => {
            updatePositionPanel();
            window.tradeEaseApp.updateStatus('Positions refreshed');
        });
    }
    
    const resetAllPositionsBtn = document.getElementById('reset-all-positions-btn');
    if (resetAllPositionsBtn) {
        resetAllPositionsBtn.addEventListener('click', handleResetAllPositions);
    }
    
    // Exit button event delegation for dynamically created buttons
    if (orderLogBody) {
        orderLogBody.addEventListener('click', function(event) {
            if (event.target.classList.contains('exit-btn')) {
                handleExitOrder(event.target);
            }
        });
    }
    
    // Fetch instruments if available
    fetchInstruments();
    
    // Initial UI render
    renderTradingTable();
    updatePositionPanel();
    
    // Enhanced order status monitoring setup
    console.log('🚀 Starting order status monitoring...');

    // Function to start polling
    function startOrderPolling() {
        // Clear any existing interval
        if (window.orderPollingInterval) {
            clearInterval(window.orderPollingInterval);
        }
        
        console.log('⏰ Setting up polling interval...');
        
        // Set up polling every 5 seconds
        window.orderPollingInterval = setInterval(() => {
            console.log('🔄 [POLLING] Checking order statuses...');
            
            // Check if we have orders to monitor
            const orderCount = Object.keys(indexState.ordersBeingMonitored).length;
            const pendingCount = Object.keys(indexState.pendingAutoOrders).length;

            // Check if we're still authenticated
            if (!window.tradeEaseApp.state.isAuthenticated) {
                console.log('❌ [POLLING] Not authenticated, stopping polling');
                clearInterval(window.orderPollingInterval);
                return;
            }
            
            if (orderCount === 0 && pendingCount === 0) {
                console.log('ℹ️ [POLLING] No orders to monitor');
                return;
            }
            
            console.log(`🔍 [POLLING] Monitoring ${orderCount} orders, ${pendingCount} pending auto orders`);
            checkOrderStatuses();
        }, 5000);
        
        console.log('✅ Polling interval started with ID:', window.orderPollingInterval);
        
        // Do an immediate first check after 2 seconds
        setTimeout(() => {
            console.log('🔍 [INITIAL] First order status check...');
            checkOrderStatuses();
        }, 2000);
    }

    // Start polling
    startOrderPolling();

    // Restart polling when user logs in
    window.restartOrderPolling = startOrderPolling;
    
    window.tradeEaseApp.updateStatus('Index page initialized with enhanced order tracking');
}

// Debug helper to check if everything is working
window.debugOrderSystem = function() {
    console.log('=== ORDER SYSTEM DEBUG ===');
    console.log('Orders being monitored:', Object.keys(indexState.ordersBeingMonitored));
    console.log('Order log body exists:', !!orderLogBody);
    console.log('Order rows in table:', orderLogBody ? orderLogBody.children.length : 'N/A');
    console.log('Polling interval active:', !!window.orderPollingInterval);
    console.log('=========================');
};

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initIndex);