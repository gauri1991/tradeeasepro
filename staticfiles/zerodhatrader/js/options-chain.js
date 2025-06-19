// zerodhatrader/static/zerodhatrader/js/options-chain.js

// Safely get DOM elements with fallback
function safeGetElement(id) {
    const element = document.getElementById(id);
    if (!element) {
        console.warn(`Element with ID "${id}" not found in DOM`);
        return null;
    }
    return element;
}

// Initialize WebSocket connection
document.addEventListener('DOMContentLoaded', () => {
    // Get elements safely
    const websocketStatus = safeGetElement('websocket-status');
    const connectWsBtn = safeGetElement('connect-ws-btn');
    const disconnectWsBtn = safeGetElement('disconnect-ws-btn');
    const expirySelector = safeGetElement('expiry-selector');
    
    // Only set up callbacks if elements exist
    if (typeof tickerSocket !== 'undefined') {
        // Set up WebSocket callbacks
        tickerSocket.setConnectCallback(() => {
            if (websocketStatus) {
                websocketStatus.textContent = 'Connected';
                websocketStatus.classList.add('text-green-500');
                websocketStatus.classList.remove('text-red-500');
            }
        });

        tickerSocket.setDisconnectCallback(() => {
            if (websocketStatus) {
                websocketStatus.textContent = 'Disconnected';
                websocketStatus.classList.add('text-red-500');
                websocketStatus.classList.remove('text-green-500');
            }
        });

        tickerSocket.setTickCallback(handleTickData);

        // Connect WebSocket
        tickerSocket.connect();
        
        // Set up button event listeners
        if (connectWsBtn) {
            connectWsBtn.addEventListener('click', () => {
                tickerSocket.connect();
            });
        }
        
        if (disconnectWsBtn) {
            disconnectWsBtn.addEventListener('click', () => {
                tickerSocket.disconnect();
            });
        }
    } else {
        console.error('tickerSocket is not defined. Make sure websocket.js is loaded before options-chain.js');
    }
    
    // Set up expiry selector change event
    if (expirySelector) {
        expirySelector.addEventListener('change', handleExpiryChange);
    }
});

// Handle real-time tick data
function handleTickData(tick) {
    if (!tick || !tick.instrument_token) return;
    
    const token = tick.instrument_token;
    
    // Find all price cells for this token
    const priceCells = document.querySelectorAll(`[data-token="${token}"]`);
    
    priceCells.forEach(cell => {
        // Store previous price for comparison
        const previousPrice = parseFloat(cell.textContent) || 0;
        const newPrice = tick.last_price;
        
        // Update price
        cell.textContent = newPrice.toFixed(2);
        
        // Add visual indicator for price change
        cell.classList.remove('price-up', 'price-down');
        if (newPrice > previousPrice) {
            cell.classList.add('price-up');
        } else if (newPrice < previousPrice) {
            cell.classList.add('price-down');
        }
        
        // Reset indicator after a delay
        setTimeout(() => {
            cell.classList.remove('price-up', 'price-down');
        }, 1000);
    });
}

// Handle expiry selector change
async function handleExpiryChange() {
    const expirySelector = safeGetElement('expiry-selector');
    const spotPrice = safeGetElement('spot-price');
    
    if (!expirySelector) return;
    
    const selectedExpiry = expirySelector.value;
    if (!selectedExpiry) return;
    
    try {
        // Fetch options for selected expiry
        const response = await fetch(`/api/instruments/nifty/?expiry=${selectedExpiry}`);
        const data = await response.json();
        
        if (data.status === 'success') {
            const instruments = data.instruments;
            displayOptionsChain(instruments, spotPrice ? parseFloat(spotPrice.value) : 0);
            
            // Subscribe to tokens of displayed options
            if (typeof tickerSocket !== 'undefined') {
                const tokens = instruments.map(instr => instr.instrument_token);
                tickerSocket.subscribe(tokens);
            }
        }
    } catch (error) {
        console.error('Error fetching options:', error);
    }
}

function displayOptionsChain(instruments, spotPrice = 0) {
    // Get options table container
    const tableContainer = safeGetElement('options-table-container');
    if (!tableContainer) return;
    
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
    
    // Get ATM strike (closest to spot price)
    const atmStrike = strikes.reduce((prev, curr) => 
        (Math.abs(curr - spotPrice) < Math.abs(prev - spotPrice) ? curr : prev), 
        strikes[0] || 0
    );
    
    // Create table if it doesn't exist
    let tableBody;
    if (!document.getElementById('options-table')) {
        // Create new table
        const table = document.createElement('table');
        table.id = 'options-table';
        table.className = 'options-table';
        
        // Create table header
        const thead = document.createElement('thead');
        thead.innerHTML = `
            <tr>
                <th colspan="4">Calls</th>
                <th>Strike</th>
                <th colspan="4">Puts</th>
            </tr>
            <tr>
                <th>OI</th>
                <th>Volume</th>
                <th>LTP</th>
                <th>Change</th>
                <th></th>
                <th>Change</th>
                <th>LTP</th>
                <th>Volume</th>
                <th>OI</th>
            </tr>
        `;
        table.appendChild(thead);
        
        // Create table body
        const tbody = document.createElement('tbody');
        tbody.id = 'options-body';
        table.appendChild(tbody);
        
        // Add table to container
        tableContainer.innerHTML = '';
        tableContainer.appendChild(table);
        
        tableBody = tbody;
    } else {
        tableBody = document.getElementById('options-body');
    }
    
    if (!tableBody) return;
    
    // Clear table body
    tableBody.innerHTML = '';
    
    // Populate options table
    strikes.forEach(strike => {
        const row = document.createElement('tr');
        const callOption = strikeMap[strike].call;
        const putOption = strikeMap[strike].put;
        
        // Highlight ATM strike
        if (strike === atmStrike) {
            row.classList.add('atm-strike');
        }
        
        // Add Call Option columns
        if (callOption) {
            row.innerHTML += `
                <td>${callOption.oi || '-'}</td>
                <td>${callOption.volume_traded || '-'}</td>
                <td data-token="${callOption.instrument_token}" class="price-cell">${callOption.last_price || '-'}</td>
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
                <td data-token="${putOption.instrument_token}" class="price-cell">${putOption.last_price || '-'}</td>
                <td>${putOption.volume_traded || '-'}</td>
                <td>${putOption.oi || '-'}</td>
            `;
        } else {
            row.innerHTML += '<td>-</td><td>-</td><td>-</td><td>-</td>';
        }
        
        tableBody.appendChild(row);
    });
}