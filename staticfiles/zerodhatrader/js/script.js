// zerodhatrader/static/zerodhatrader/js/script.js

// Global state
const state = {
    isAuthenticated: false,
    apiKey: '',
    apiSecret: '',
    accessToken: '',
    profile: null,
    instruments: [],
    websocket: null,
    subscribedTokens: []
};

// DOM elements
const elements = {
    // Authentication
    apiKeyInput: document.getElementById('apiKey'),
    apiSecretInput: document.getElementById('apiSecret'),
    accessTokenInput: document.getElementById('accessToken'),
    loginBtn: document.getElementById('login-btn'),
    
    // Profile
    profileBtn: document.getElementById('profile-btn'),
    nameInput: document.getElementById('name'),
    emailInput: document.getElementById('email'),
    currentTimeInput: document.getElementById('currentTime'),
    statusInput: document.getElementById('status'),
    websocketInput: document.getElementById('websocket'),
    
    // Instruments
    downloadInstrumentsBtn: document.getElementById('download-instruments-btn'),
    uploadCsvBtn: document.getElementById('upload-csv-btn'),
    instrumentFileInput: document.getElementById('instrumentFile'),
    instrumentCount: document.getElementById('instrumentCount'),
    instrumentLastUpdated: document.getElementById('instrumentLastUpdated'),
    instrumentStatus: document.getElementById('instrumentStatus'),
    exportCsvBtn: document.getElementById('export-csv-btn'),
    viewJsonBtn: document.getElementById('view-json-btn'),
    
    // WebSocket
    websocketBtn: document.getElementById('websocket-btn'),
    disconnectWebsocketBtn: document.getElementById('disconnect-websocket-btn'),
    
    // Nifty Options
    niftySpotInput: document.getElementById('niftySpotInput'),
    niftyExpiryInput: document.getElementById('niftyExpiryInput'),
    niftyOptionsBody: document.getElementById('nifty-options-body'),
    niftyWsToggle: document.getElementById('nifty-ws-toggle'),
    
    // Bank Nifty Options
    bankNiftySpotInput: document.getElementById('bankNiftySpotInput'),
    bankNiftyExpiryInput: document.getElementById('bankNiftyExpiryInput'),
    bankNiftyOptionsBody: document.getElementById('banknifty-options-body'),
    bankNiftyWsToggle: document.getElementById('banknifty-ws-toggle'),
    
    // Order Log
    orderLogBody: document.getElementById('order-log-body')
};

// API endpoints
const API = {
    login: '/api/login/',
    profile: '/api/profile/',
    instruments: '/api/instruments/',
    instrumentsCsv: '/api/instruments/csv/',
    orders: '/api/orders/',
    quote: '/api/quote/',
    wsEndpoint: `ws://${window.location.host}/ws/ticker/`
};

// Helper functions
function formatDate(date) {
    const d = new Date(date);
    return d.toLocaleString();
}

function updateCurrentTime() {
    const now = new Date();
    elements.currentTimeInput.value = now.toLocaleString();
}

function showToast(message, type = 'info') {
    // Simple toast implementation
    console.log(`[${type}] ${message}`);
    // In a real app, use a proper toast library
}

function setCsrfToken(xhr) {
    const csrfToken = document.querySelector('[name=csrfmiddlewaretoken]').value;
    xhr.setRequestHeader('X-CSRFToken', csrfToken);
}

async function fetchJson(url, options = {}) {
    try {
        if (options.method && options.method !== 'GET') {
            options.headers = options.headers || {};
            options.headers['X-CSRFToken'] = document.querySelector('[name=csrfmiddlewaretoken]').value;
        }
        
        const response = await fetch(url, options);
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Fetch error:', error);
        showToast(`Error: ${error.message}`, 'error');
        throw error;
    }
}

// Authentication and Session Management
async function login() {
    try {
        state.apiKey = elements.apiKeyInput.value;
        state.apiSecret = elements.apiSecretInput.value;
        
        if (!state.apiKey || !state.apiSecret) {
            showToast('Please enter API Key and API Secret', 'error');
            return;
        }
        
        // Save credentials to backend
        const response = await fetchJson(API.login, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                api_key: state.apiKey,
                api_secret: state.apiSecret
            })
        });
        
        if (response.login_url) {
            // Redirect user to Kite login page
            window.location.href = response.login_url;
        } else {
            showToast('Failed to generate login URL', 'error');
        }
    } catch (error) {
        console.error('Login error:', error);
    }
}

async function getProfile() {
    try {
        const profile = await fetchJson(API.profile);
        
        state.profile = profile;
        elements.nameInput.value = profile.user_name || '';
        elements.emailInput.value = profile.email || '';
        elements.statusInput.value = 'Connected';
        
        updateCurrentTime();
        showToast('Profile loaded successfully');
    } catch (error) {
        elements.statusInput.value = 'Error';
        console.error('Profile error:', error);
    }
}

// Instrument Management
async function downloadInstruments() {
    try {
        elements.instrumentStatus.textContent = 'Downloading...';
        
        const response = await fetchJson(API.instruments, {
            method: 'POST'
        });
        
        if (response.status === 'success') {
            elements.instrumentStatus.textContent = 'Download complete';
            elements.instrumentCount.textContent = response.count || '0';
            elements.instrumentLastUpdated.textContent = formatDate(new Date());
            
            // Load instruments into memory
            await loadInstruments();
            
            showToast(response.message);
        } else {
            elements.instrumentStatus.textContent = 'Download failed';
            showToast(response.message, 'error');
        }
    } catch (error) {
        elements.instrumentStatus.textContent = 'Download failed';
        console.error('Download error:', error);
    }
}

async function loadInstruments() {
    try {
        const response = await fetchJson(API.instruments);
        
        state.instruments = response.instruments || [];
        elements.instrumentCount.textContent = state.instruments.length;
        
        // Populate expiry dropdowns
        populateExpiryDropdowns();
        
        return state.instruments;
    } catch (error) {
        console.error('Load instruments error:', error);
        return [];
    }
}

function populateExpiryDropdowns() {
    // Extract unique expiry dates for Nifty options
    const niftyOptions = state.instruments.filter(instr => 
        instr.tradingsymbol.includes('NIFTY') && 
        instr.segment === 'NFO-OPT'
    );
    
    const niftyExpiries = [...new Set(niftyOptions.map(opt => opt.expiry))].sort();
    
    // Clear and populate Nifty expiry dropdown
    elements.niftyExpiryInput.innerHTML = '<option value="">Select Expiry</option>';
    niftyExpiries.forEach(expiry => {
        if (expiry) {
            const option = document.createElement('option');
            option.value = expiry;
            option.textContent = new Date(expiry).toLocaleDateString();
            elements.niftyExpiryInput.appendChild(option);
        }
    });
    
    // Extract unique expiry dates for Bank Nifty options
    const bankNiftyOptions = state.instruments.filter(instr => 
        instr.tradingsymbol.includes('BANKNIFTY') && 
        instr.segment === 'NFO-OPT'
    );
    
    const bankNiftyExpiries = [...new Set(bankNiftyOptions.map(opt => opt.expiry))].sort();
    
    // Clear and populate Bank Nifty expiry dropdown
    elements.bankNiftyExpiryInput.innerHTML = '<option value="">Select Expiry</option>';
    bankNiftyExpiries.forEach(expiry => {
        if (expiry) {
            const option = document.createElement('option');
            option.value = expiry;
            option.textContent = new Date(expiry).toLocaleDateString();
            elements.bankNiftyExpiryInput.appendChild(option);
        }
    });
}

function handleExpiryChange(indexType) {
    const spotInput = indexType === 'nifty' ? elements.niftySpotInput : elements.bankNiftySpotInput;
    const expiryInput = indexType === 'nifty' ? elements.niftyExpiryInput : elements.bankNiftyExpiryInput;
    const optionsBody = indexType === 'nifty' ? elements.niftyOptionsBody : elements.bankNiftyOptionsBody;
    
    const spotPrice = parseFloat(spotInput.value);
    const selectedExpiry = expiryInput.value;
    
    if (!selectedExpiry || isNaN(spotPrice)) {
        return;
    }
    
    // Filter options for the selected index and expiry
    const indexPrefix = indexType === 'nifty' ? 'NIFTY' : 'BANKNIFTY';
    const options = state.instruments.filter(instr => 
        instr.tradingsymbol.includes(indexPrefix) && 
        instr.segment === 'NFO-OPT' &&
        instr.expiry === selectedExpiry
    );
    
    // Group options by strike price
    const strikeGroups = {};
    options.forEach(opt => {
        const strike = opt.strike;
        if (!strikeGroups[strike]) {
            strikeGroups[strike] = { CE: null, PE: null };
        }
        
        if (opt.tradingsymbol.includes('CE')) {
            strikeGroups[strike].CE = opt;
        } else if (opt.tradingsymbol.includes('PE')) {
            strikeGroups[strike].PE = opt;
        }
    });
    
    // Sort strike prices
    const strikes = Object.keys(strikeGroups).map(Number).sort((a, b) => a - b);
    
    // Find strikes around spot price
    const nearbyStrikes = strikes.filter(strike => 
        Math.abs(strike - spotPrice) <= 1000
    );
    
    // Clear options table
    optionsBody.innerHTML = '';
    
    // Create rows for each strike price
    nearbyStrikes.forEach(strike => {
        const group = strikeGroups[strike];
        const ceOption = group.CE;
        const peOption = group.PE;
        
        if (ceOption) {
            createOptionRow(optionsBody, ceOption, 'CE', indexType);
        }
        
        if (peOption) {
            createOptionRow(optionsBody, peOption, 'PE', indexType);
        }
    });
}

function createOptionRow(tableBody, option, optionType, indexType) {
    const row = document.createElement('tr');
    row.classList.add(optionType === 'CE' ? 'bg-blue-50' : 'bg-red-50');
    row.dataset.instrumentToken = option.instrument_token;
    
    const quantityInput = indexType === 'nifty' ? elements.nifty50QuantityInput : elements.bankNiftyQuantityInput;
    const quantity = parseInt(quantityInput.value) || 0;
    
    row.innerHTML = `
        <td class="text-center">${option.strike}</td>
        <td class="text-center">${option.instrument_token}</td>
        <td class="text-center">
            <input type="checkbox" class="ws-checkbox" data-token="${option.instrument_token}">
        </td>
        <td>${option.tradingsymbol}</td>
        <td class="text-right price-cell" data-token="${option.instrument_token}">-</td>
        <td class="text-right">${quantity}</td>
        <td class="text-center">
            <button class="button button-primary h-6 px-2 py-0.5 text-xs buy-btn" 
                    data-token="${option.instrument_token}" 
                    data-symbol="${option.tradingsymbol}">Buy</button>
        </td>
        <td class="text-center">
            <button class="button button-destructive h-6 px-2 py-0.5 text-xs sell-btn" 
                    data-token="${option.instrument_token}" 
                    data-symbol="${option.tradingsymbol}">Sell</button>
        </td>
    `;
    
    tableBody.appendChild(row);
    
    // Add event listeners to buttons
    const buyBtn = row.querySelector('.buy-btn');
    const sellBtn = row.querySelector('.sell-btn');
    const wsCheckbox = row.querySelector('.ws-checkbox');
    
    buyBtn.addEventListener('click', () => placeOrder('BUY', option, quantity));
    sellBtn.addEventListener('click', () => placeOrder('SELL', option, quantity));
    wsCheckbox.addEventListener('change', (e) => {
        if (e.target.checked) {
            subscribeToToken(option.instrument_token);
        } else {
            unsubscribeFromToken(option.instrument_token);
        }
    });
}

// WebSocket Connection for Real-time Data
function connectWebSocket() {
    if (state.websocket) {
        // Already connected
        return;
    }
    
    state.websocket = new WebSocket(API.wsEndpoint);
    
    state.websocket.onopen = () => {
        elements.websocketInput.value = '1';
        elements.websocketBtn.disabled = true;
        elements.disconnectWebsocketBtn.disabled = false;
        showToast('WebSocket connected');
    };
    
    state.websocket.onclose = () => {
        elements.websocketInput.value = '0';
        elements.websocketBtn.disabled = false;
        elements.disconnectWebsocketBtn.disabled = true;
        state.websocket = null;
        showToast('WebSocket disconnected');
    };
    
    state.websocket.onerror = (error) => {
        console.error('WebSocket error:', error);
        showToast('WebSocket error', 'error');
    };
    
    state.websocket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            
            if (data.type === 'tick') {
                // Update price display for this instrument
                updateTickData(data.data);
            } else if (data.type === 'connection_established') {
                // Resubscribe to previously subscribed tokens
                if (state.subscribedTokens.length > 0) {
                    sendToWebSocket({
                        action: 'subscribe',
                        tokens: state.subscribedTokens
                    });
                }
            }
        } catch (error) {
            console.error('WebSocket message error:', error);
        }
    };
}

function disconnectWebSocket() {
    if (state.websocket) {
        state.websocket.close();
    }
}

function sendToWebSocket(data) {
    if (state.websocket && state.websocket.readyState === WebSocket.OPEN) {
        state.websocket.send(JSON.stringify(data));
    } else {
        showToast('WebSocket not connected', 'error');
    }
}

function subscribeToToken(token) {
    if (!state.subscribedTokens.includes(token)) {
        state.subscribedTokens.push(token);
        
        sendToWebSocket({
            action: 'subscribe',
            tokens: [token]
        });
    }
}

function unsubscribeFromToken(token) {
    const index = state.subscribedTokens.indexOf(token);
    if (index !== -1) {
        state.subscribedTokens.splice(index, 1);
        
        sendToWebSocket({
            action: 'unsubscribe',
            tokens: [token]
        });
    }
}

function updateTickData(tick) {
    const cells = document.querySelectorAll(`.price-cell[data-token="${tick.instrument_token}"]`);
    
    cells.forEach(cell => {
        cell.textContent = tick.last_price.toFixed(2);
        
        // Add visual indicator for price change
        cell.classList.remove('text-green-500', 'text-red-500');
        
        if (cell.dataset.lastPrice) {
            const lastPrice = parseFloat(cell.dataset.lastPrice);
            if (tick.last_price > lastPrice) {
                cell.classList.add('text-green-500');
            } else if (tick.last_price < lastPrice) {
                cell.classList.add('text-red-500');
            }
        }
        
        cell.dataset.lastPrice = tick.last_price;
    });
}

// Order Placement
async function placeOrder(transactionType, option, quantity) {
    try {
        if (!quantity || quantity <= 0) {
            showToast('Quantity must be greater than 0', 'error');
            return;
        }
        
        const response = await fetchJson(API.orders, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                tradingsymbol: option.tradingsymbol,
                exchange: option.exchange,
                transaction_type: transactionType,
                quantity: quantity,
                product: 'MIS',  // You can make this configurable
                order_type: 'MARKET'  // You can make this configurable
            })
        });
        
        if (response.order_id) {
            showToast(`${transactionType} order placed successfully. Order ID: ${response.order_id}`);
            addOrderToLog(response.order_id, option, transactionType, quantity);
        } else {
            showToast('Order placement failed', 'error');
        }
    } catch (error) {
        console.error('Order placement error:', error);
        showToast(`Order error: ${error.message}`, 'error');
    }
}

function addOrderToLog(orderId, option, transactionType, quantity) {
    // For demonstration, we'll just add a row to the order log
    // In a real app, you'd fetch the actual order details
    
    const row = document.createElement('tr');
    
    const now = new Date();
    const price = parseFloat(document.querySelector(`.price-cell[data-token="${option.instrument_token}"]`)?.textContent || '0');
    
    row.innerHTML = `
        <td>${transactionType} ${option.tradingsymbol}</td>
        <td class="text-right">${transactionType === 'BUY' ? price.toFixed(2) : '-'}</td>
        <td>${transactionType === 'BUY' ? orderId : '-'}</td>
        <td class="text-right">${transactionType === 'SELL' ? price.toFixed(2) : '-'}</td>
        <td>${transactionType === 'SELL' ? orderId : '-'}</td>
        <td class="text-right">-</td>
        <td>-</td>
        <td class="text-right">-</td>
        <td class="text-right">${quantity}</td>
    `;
    
    // Remove "No orders yet" row if present
    const noOrdersRow = elements.orderLogBody.querySelector('td[colspan="9"]');
    if (noOrdersRow) {
        noOrdersRow.parentElement.remove();
    }
    
    elements.orderLogBody.appendChild(row);
}

// CSV Export
function exportInstrumentsCsv() {
    window.location.href = API.instrumentsCsv;
}

// Initialize the application
function init() {
    // Set up event listeners
    elements.loginBtn.addEventListener('click', login);
    elements.profileBtn.addEventListener('click', getProfile);
    elements.downloadInstrumentsBtn.addEventListener('click', downloadInstruments);
    elements.exportCsvBtn.addEventListener('click', exportInstrumentsCsv);
    elements.uploadCsvBtn.addEventListener('click', () => elements.instrumentFileInput.click());
    elements.instrumentFileInput.addEventListener('change', handleCsvUpload);
    elements.websocketBtn.addEventListener('click', connectWebSocket);
    elements.disconnectWebsocketBtn.addEventListener('click', disconnectWebSocket);
    
    elements.niftyExpiryInput.addEventListener('change', () => handleExpiryChange('nifty'));
    elements.bankNiftyExpiryInput.addEventListener('change', () => handleExpiryChange('banknifty'));
    
    elements.niftyWsToggle.addEventListener('click', () => toggleIndexWebsocket('nifty'));
    elements.bankNiftyWsToggle.addEventListener('click', () => toggleIndexWebsocket('banknifty'));
    
    // Update current time every second
    setInterval(updateCurrentTime, 1000);
    
    // Check if we're returning from login redirect
    const urlParams = new URLSearchParams(window.location.search);
    const requestToken = urlParams.get('request_token');
    
    if (requestToken) {
        // Exchange request token for access token
        exchangeToken(requestToken);
    }
    
    // Load instruments if available
    loadInstruments();
}

async function exchangeToken(requestToken) {
    try {
        const response = await fetchJson(`${API.login}?request_token=${requestToken}`);
        
        if (response.status === 'success') {
            elements.accessTokenInput.value = response.access_token || '';
            elements.statusInput.value = 'Authenticated';
            
            showToast('Login successful');
            getProfile();
        } else {
            showToast('Authentication failed', 'error');
        }
    } catch (error) {
        console.error('Token exchange error:', error);
        showToast('Authentication error', 'error');
    }
}

async function handleCsvUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        elements.instrumentStatus.textContent = 'Uploading...';
        
        const response = await fetch(API.instruments, {
            method: 'POST',
            headers: {
                'X-CSRFToken': document.querySelector('[name=csrfmiddlewaretoken]').value
            },
            body: formData
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.status === 'success') {
            elements.instrumentStatus.textContent = 'Upload complete';
            elements.instrumentCount.textContent = data.count || '0';
            elements.instrumentLastUpdated.textContent = formatDate(new Date());
            
            // Load the newly uploaded instruments
            await loadInstruments();
            
            showToast(data.message);
        } else {
            elements.instrumentStatus.textContent = 'Upload failed';
            showToast(data.message, 'error');
        }
    } catch (error) {
        elements.instrumentStatus.textContent = 'Upload failed';
        console.error('CSV upload error:', error);
        showToast(`Upload error: ${error.message}`, 'error');
    }
    
    // Clear the file input
    event.target.value = '';
}

function toggleIndexWebsocket(indexType) {
    const wsToggle = indexType === 'nifty' ? elements.niftyWsToggle : elements.bankNiftyWsToggle;
    const optionsBody = indexType === 'nifty' ? elements.niftyOptionsBody : elements.bankNiftyOptionsBody;
    
    const isActive = wsToggle.getAttribute('data-active') === 'true';
    
    if (isActive) {
        // Unsubscribe from all tokens for this index
        wsToggle.setAttribute('data-active', 'false');
        wsToggle.textContent = 'WS';
        
        // Uncheck all checkboxes
        const checkboxes = optionsBody.querySelectorAll('.ws-checkbox:checked');
        checkboxes.forEach(checkbox => {
            checkbox.checked = false;
            unsubscribeFromToken(parseInt(checkbox.dataset.token));
        });
    } else {
        // Subscribe to all tokens for this index
        wsToggle.setAttribute('data-active', 'true');
        wsToggle.textContent = 'WS ON';
        
        // Create WebSocket connection if not already created
        if (!state.websocket) {
            connectWebSocket();
        }
        
        // Check all checkboxes
        const checkboxes = optionsBody.querySelectorAll('.ws-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.checked = true;
            subscribeToToken(parseInt(checkbox.dataset.token));
        });
    }
}
// Add this to your script.js
document.getElementById('download-instruments-btn').addEventListener('click', async function() {
    try {
        const response = await fetch('/api/instruments/download/', {
            method: 'GET',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
            }
        });
        
        const data = await response.json();
        
        if (data.status === 'success') {
            alert(`Success: ${data.message}`);
            // Update UI to show instrument count
            document.getElementById('instrumentCount').textContent = data.count;
        } else {
            alert(`Error: ${data.message}`);
        }
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
});
// Load Nifty options on page load
async function loadNiftyOptions() {
    try {
        const response = await fetch('/api/instruments/nifty/');
        const data = await response.json();
        
        if (data.status === 'success') {
            // Populate expiry dates dropdown
            const expirySelector = document.getElementById('expiry-selector');
            expirySelector.innerHTML = '<option value="">Select Expiry</option>';
            
            data.expiry_dates.forEach(expiry => {
                const option = document.createElement('option');
                option.value = expiry;
                option.textContent = new Date(expiry).toLocaleDateString();
                expirySelector.appendChild(option);
            });
            
            // Store instruments data
            window.niftyInstruments = data.instruments;
        }
    } catch (error) {
        console.error('Error loading Nifty options:', error);
    }
}

// Handle expiry date selection
document.getElementById('expiry-selector').addEventListener('change', function() {
    const selectedExpiry = this.value;
    if (!selectedExpiry) return;
    
    // Filter instruments by selected expiry
    const instruments = window.niftyInstruments.filter(instr => instr.expiry === selectedExpiry);
    
    // Group by strike price
    const strikeMap = {};
    instruments.forEach(instr => {
        const strike = instr.strike;
        if (!strikeMap[strike]) {
            strikeMap[strike] = { call: null, put: null };
        }
        
        if (instr.tradingsymbol.includes('CE')) {
            strikeMap[strike].call = instr;
        } else if (instr.tradingsymbol.includes('PE')) {
            strikeMap[strike].put = instr;
        }
    });
    
    // Sort strikes
    const strikes = Object.keys(strikeMap).map(Number).sort((a, b) => a - b);
    
    // Populate options table
    const tableBody = document.getElementById('options-body');
    tableBody.innerHTML = '';
    
    strikes.forEach(strike => {
        const row = document.createElement('tr');
        const callOption = strikeMap[strike].call;
        const putOption = strikeMap[strike].put;
        
        // Add Call Option columns
        if (callOption) {
            row.innerHTML += `
                <td>${callOption.oi || '-'}</td>
                <td>${callOption.volume_traded || '-'}</td>
                <td>${callOption.last_price || '-'}</td>
                <td>${callOption.change || '-'}</td>
            `;
        } else {
            row.innerHTML += '<td>-</td><td>-</td><td>-</td><td>-</td>';
        }
        
        // Add Strike Price column
        row.innerHTML += `<td class="strike">${strike}</td>`;
        
        // Add Put Option columns
        if (putOption) {
            row.innerHTML += `
                <td>${putOption.change || '-'}</td>
                <td>${putOption.last_price || '-'}</td>
                <td>${putOption.volume_traded || '-'}</td>
                <td>${putOption.oi || '-'}</td>
            `;
        } else {
            row.innerHTML += '<td>-</td><td>-</td><td>-</td><td>-</td>';
        }
        
        tableBody.appendChild(row);
    });
});

// Initialize
document.addEventListener('DOMContentLoaded', loadNiftyOptions);
// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', init);

// Safely add event listener only if element exists
document.addEventListener('DOMContentLoaded', function() {
    const expirySelector = document.getElementById('expiry-selector');
    
    if (expirySelector) {
        expirySelector.addEventListener('change', function() {
            // Your event handler code here
            handleExpiryChange();
        });
    } else {
        console.warn("Element with ID 'expiry-selector' not found in the DOM");
    }
});

