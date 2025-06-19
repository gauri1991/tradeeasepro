// Option Chain Analysis specific JavaScript

// Strategy descriptions for each strategy
const strategyDescriptions = {
    'calendar-spread': {
        title: 'Calendar Spread',
        description: 'A calendar spread involves selling a near-term option and buying a longer-term option with the same strike price. This strategy benefits from time decay and volatility expansion.',
        emoji: '📅'
    },
    'vertical-spread': {
        title: 'Vertical Spread',
        description: 'A vertical spread involves buying and selling options of the same type but different strike prices in the same expiration. Bull spreads profit from rising prices, while bear spreads profit from falling prices.',
        emoji: '📊'
    },
    'iron-condor': {
        title: 'Iron Condor',
        description: 'An iron condor combines a bull put spread with a bear call spread. This strategy profits when the underlying asset remains within a specific price range until expiration.',
        emoji: '🦅'
    },
    'butterfly': {
        title: 'Butterfly',
        description: 'A butterfly spread involves buying one option at a lower strike, selling two options at a middle strike, and buying one option at a higher strike. This strategy profits when the underlying asset is near the middle strike at expiration.',
        emoji: '🦋'
    },
    'diagonal-spread': {
        title: 'Diagonal Spread',
        description: 'A diagonal spread combines elements of both vertical and calendar spreads. It involves buying and selling options with different strike prices and different expiration dates.',
        emoji: '↗️'
    },
    'ratio-spread': {
        title: 'Ratio Spread',
        description: 'A ratio spread involves buying and selling options with different strike prices in an uneven ratio. This creates an asymmetric risk/reward profile.',
        emoji: '⚖️'
    }
};

// Application state with strategy-specific data
const optionChainState = {
    // Strategy-specific data
    calendarSpread: {
        nearMonthOptions: [],
        farMonthOptions: [],
        calendarSpreads: []
    },
    verticalSpread: {
        options: [],
        spreads: []
    },
    ironCondor: {
        callOptions: [],
        putOptions: [],
        condors: []
    },
    butterfly: {
        options: [],
        butterflies: []
    },
    diagonalSpread: {
        nearMonthOptions: [],
        farMonthOptions: [],
        spreads: []
    },
    ratioSpread: {
        options: [],
        spreads: []
    }
};

// DOM Elements for Calendar Spread
let csIndexSelect, csSpotPrice, csNearMonthExpiry, csFarMonthExpiry, csOptionType, csQuantity, csLoadSpreadsBtn;
let calendarSpreadTable, csAvgIvDiff, csAvgThetaRatio, csAvgDebit, csSpreadsCount, csRecommendationsContainer;

// Initialize DOM elements
function initializeOptionChainElements() {
    // Calendar Spread elements
    csIndexSelect = document.getElementById('cs-index-select');
    csSpotPrice = document.getElementById('cs-spot-price');
    csNearMonthExpiry = document.getElementById('cs-near-month-expiry');
    csFarMonthExpiry = document.getElementById('cs-far-month-expiry');
    csOptionType = document.getElementById('cs-option-type');
    csQuantity = document.getElementById('cs-quantity');
    csLoadSpreadsBtn = document.getElementById('cs-load-spreads-btn');
    calendarSpreadTable = document.getElementById('calendar-spread-table');
    
    // Metric Elements for Calendar Spread
    csAvgIvDiff = document.getElementById('cs-avg-iv-diff');
    csAvgThetaRatio = document.getElementById('cs-avg-theta-ratio');
    csAvgDebit = document.getElementById('cs-avg-debit');
    csSpreadsCount = document.getElementById('cs-spreads-count');
    csRecommendationsContainer = document.getElementById('cs-recommendations-container');
}

// Populate Expiry Dropdowns for selected index and specific dropdown elements
function populateExpiryDropdowns(strategy = 'calendar-spread') {
    if (!window.tradeEaseApp.state.instruments || window.tradeEaseApp.state.instruments.length === 0) {
        console.warn('No instruments available to populate expiry dropdowns');
        return;
    }
    
    // Get strategy-specific selectors
    let indexSelect, dropdowns;
    
    switch(strategy) {
        case 'calendar-spread':
            indexSelect = csIndexSelect;
            dropdowns = [csNearMonthExpiry, csFarMonthExpiry];
            break;
        case 'vertical-spread':
            indexSelect = document.getElementById('vs-index-select');
            dropdowns = [document.getElementById('vs-expiry')];
            break;
        case 'iron-condor':
            indexSelect = document.getElementById('ic-index-select');
            dropdowns = [document.getElementById('ic-expiry')];
            break;
        case 'butterfly':
            indexSelect = document.getElementById('bf-index-select');
            dropdowns = [document.getElementById('bf-expiry')];
            break;
        case 'diagonal-spread':
            indexSelect = document.getElementById('ds-index-select');
            dropdowns = [document.getElementById('ds-near-month-expiry'), document.getElementById('ds-far-month-expiry')];
            break;
        case 'ratio-spread':
            indexSelect = document.getElementById('rs-index-select');
            dropdowns = [document.getElementById('rs-expiry')];
            break;
        default:
            return;
    }
    
    if (!indexSelect || !dropdowns.every(d => d)) return;
    
    const selectedIndex = indexSelect.value;
    
    // Filter for selected index options
    const indexOptions = window.tradeEaseApp.state.instruments.filter(instr => 
        instr.tradingsymbol.includes(selectedIndex) && 
        (instr.instrument_type === 'CE' || instr.instrument_type === 'PE') &&
        (instr.exchange === 'NFO')
    );
    
    // Get unique expiry dates
    const expiryDates = [...new Set(indexOptions.map(opt => opt.expiry))].filter(Boolean).sort();
    
    // Populate each dropdown
    dropdowns.forEach(dropdown => {
        if (!dropdown) return;
        
        const currentValue = dropdown.value;
        dropdown.innerHTML = '<option value="">Select Expiry</option>';
        
        expiryDates.forEach(expiry => {
            const option = document.createElement('option');
            option.value = expiry;
            option.textContent = window.tradeEaseApp.formatDate(expiry);
            dropdown.appendChild(option);
        });
        
        // Restore selected value if it still exists
        if (currentValue && expiryDates.includes(currentValue)) {
            dropdown.value = currentValue;
        }
    });
    
    window.tradeEaseApp.updateStatus(`Loaded ${expiryDates.length} expiry dates for ${selectedIndex}`);
    
    // Update default values
    updateDefaultValues(strategy);
}

// Update default values based on selected index
function updateDefaultValues(strategy) {
    let indexSelect, spotPrice, quantity;
    
    // Get the appropriate elements based on strategy
    switch (strategy) {
        case 'calendar-spread':
            indexSelect = csIndexSelect;
            spotPrice = csSpotPrice;
            quantity = csQuantity;
            break;
        case 'vertical-spread':
            indexSelect = document.getElementById('vs-index-select');
            spotPrice = document.getElementById('vs-spot-price');
            quantity = document.getElementById('vs-quantity');
            break;
        case 'iron-condor':
            indexSelect = document.getElementById('ic-index-select');
            spotPrice = document.getElementById('ic-spot-price');
            quantity = document.getElementById('ic-quantity');
            break;
        case 'butterfly':
            indexSelect = document.getElementById('bf-index-select');
            spotPrice = document.getElementById('bf-spot-price');
            quantity = document.getElementById('bf-quantity');
            break;
        case 'diagonal-spread':
            indexSelect = document.getElementById('ds-index-select');
            spotPrice = document.getElementById('ds-spot-price');
            quantity = document.getElementById('ds-quantity');
            break;
        case 'ratio-spread':
            indexSelect = document.getElementById('rs-index-select');
            spotPrice = document.getElementById('rs-spot-price');
            quantity = document.getElementById('rs-quantity');
            break;
        default:
            return;
    }
    
    if (!indexSelect || !spotPrice || !quantity) return;
    
    // Set default spot price based on index
    if (indexSelect.value === 'NIFTY') {
        spotPrice.value = '22500';
        quantity.value = '75';
        quantity.min = '75';
        quantity.step = '75';
    } else if (indexSelect.value === 'BANKNIFTY') {
        spotPrice.value = '48000';
        quantity.value = '25';
        quantity.min = '25';
        quantity.step = '25';
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

// Load Calendar Spreads
async function loadCalendarSpreads() {
    try {
        const selectedIndex = csIndexSelect.value;
        const nearMonth = csNearMonthExpiry.value;
        const farMonth = csFarMonthExpiry.value;
        const selectType = csOptionType.value;
        const spot = parseFloat(csSpotPrice.value);
        
        // Validate inputs
        if (!selectedIndex || !nearMonth || !farMonth || !selectType || isNaN(spot)) {
            window.tradeEaseApp.showToast('Please fill in all required fields');
            return;
        }
        
        // Ensure near month is before far month
        if (new Date(nearMonth) > new Date(farMonth)) {
            window.tradeEaseApp.showToast('Near month expiry should be earlier than far month expiry');
            return;
        }
        
        // Show loading state
        const loadingOverlay = window.tradeEaseApp.showLoadingState(calendarSpreadTable.parentElement, 'Loading calendar spreads...');
        
        window.tradeEaseApp.updateStatus(`Loading ${selectedIndex} ${selectType} options for calendar spreads...`);
        
        // Filter options for near month
        optionChainState.calendarSpread.nearMonthOptions = window.tradeEaseApp.state.instruments.filter(instr => 
            instr.tradingsymbol.includes(selectedIndex) && 
            instr.instrument_type === selectType &&
            instr.expiry === nearMonth
        );
        
        // Filter options for far month
        optionChainState.calendarSpread.farMonthOptions = window.tradeEaseApp.state.instruments.filter(instr => 
            instr.tradingsymbol.includes(selectedIndex) && 
            instr.instrument_type === selectType &&
            instr.expiry === farMonth
        );
        
        // Calculate strikes to display based on spot price
        const allStrikes = [...new Set([
            ...optionChainState.calendarSpread.nearMonthOptions.map(opt => opt.strike),
            ...optionChainState.calendarSpread.farMonthOptions.map(opt => opt.strike)
        ])].filter(Boolean).map(Number).sort((a, b) => a - b);
        
        // Find the closest strike to spot price
        let closestStrike = allStrikes[0];
        let minDiff = Math.abs(allStrikes[0] - spot);
        
        allStrikes.forEach(strike => {
            const diff = Math.abs(strike - spot);
            if (diff < minDiff) {
                minDiff = diff;
                closestStrike = strike;
            }
        });
        
        // Get 5 strikes above and 5 strikes below the closest strike
        const lowerIndex = allStrikes.indexOf(closestStrike);
        const lowerBound = Math.max(0, lowerIndex - 5);
        const upperBound = Math.min(allStrikes.length, lowerIndex + 6);
        
        const strikesToShow = allStrikes.slice(lowerBound, upperBound);
        
        // Get tokens for WebSocket subscription
        const nearMonthTokens = optionChainState.calendarSpread.nearMonthOptions
            .filter(opt => strikesToShow.includes(opt.strike))
            .map(opt => opt.instrument_token);
        
        const farMonthTokens = optionChainState.calendarSpread.farMonthOptions
            .filter(opt => strikesToShow.includes(opt.strike))
            .map(opt => opt.instrument_token);
        
        // Mock LTP data for demonstration
        await fetchLTP([...nearMonthTokens, ...farMonthTokens]);
        
        // Subscribe to these tokens via WebSocket
        if (window.wsManager && window.wsManager.wsConnected) {
            window.wsManager.subscribe([...nearMonthTokens, ...farMonthTokens]);
        }
        
        // Calculate calendar spreads
        calculateCalendarSpreads();
        
        // Update the UI
        updateCalendarSpreadTable();
        
        // Hide loading state
        window.tradeEaseApp.hideLoadingState(loadingOverlay);
        
        window.tradeEaseApp.updateStatus(`Loaded calendar spreads for ${selectedIndex} ${selectType} options`);
    } catch (error) {
        console.error('Error loading calendar spreads:', error);
        window.tradeEaseApp.updateStatus(`Error: ${error.message}`);
    }
}

// Fetch Last Traded Price (LTP) for options - Mock implementation
async function fetchLTP(tokens) {
    if (!tokens || tokens.length === 0) return;
    
    try {
        // Mock LTP values for demonstration
        tokens.forEach(token => {
            // Find the option in any of the strategy data structures
            const nearOption = optionChainState.calendarSpread.nearMonthOptions.find(opt => opt.instrument_token === token);
            if (nearOption && !nearOption.last_price) {
                nearOption.last_price = parseFloat((50 + Math.random() * 50).toFixed(2));
                nearOption.iv = parseFloat((20 + Math.random() * 10).toFixed(2));
                nearOption.theta = parseFloat((-5 - Math.random() * 5).toFixed(2));
            }
            
            const farOption = optionChainState.calendarSpread.farMonthOptions.find(opt => opt.instrument_token === token);
            if (farOption && !farOption.last_price) {
                farOption.last_price = parseFloat((80 + Math.random() * 70).toFixed(2));
                farOption.iv = parseFloat((18 + Math.random() * 8).toFixed(2));
                farOption.theta = parseFloat((-2 - Math.random() * 2.5).toFixed(2));
            }
        });
        
        window.tradeEaseApp.updateStatus(`Updated LTP for ${tokens.length} options`);
    } catch (error) {
        console.error('Error fetching LTP:', error);
        window.tradeEaseApp.updateStatus(`Error fetching LTP: ${error.message}`);
    }
}

// Calculate Calendar Spreads
function calculateCalendarSpreads() {
    optionChainState.calendarSpread.calendarSpreads = [];
    
    // Get common strikes between near and far month
    const nearStrikes = optionChainState.calendarSpread.nearMonthOptions.map(opt => opt.strike);
    const farStrikes = optionChainState.calendarSpread.farMonthOptions.map(opt => opt.strike);
    const commonStrikes = nearStrikes.filter(strike => farStrikes.includes(strike));
    
    // Create calendar spreads
    commonStrikes.forEach(strike => {
        const nearOption = optionChainState.calendarSpread.nearMonthOptions.find(opt => opt.strike === strike);
        const farOption = optionChainState.calendarSpread.farMonthOptions.find(opt => opt.strike === strike);
        
        if (nearOption && farOption && nearOption.last_price && farOption.last_price) {
            const debit = farOption.last_price - nearOption.last_price;
            const ivDiff = (nearOption.iv || 20) - (farOption.iv || 18);
            const thetaRatio = Math.abs((nearOption.theta || -5) / (farOption.theta || -2));
            
            // Calculate probability
            let probability = 'Medium';
            let score = 0;
            
            if (ivDiff > 0) score += 1;
            if (thetaRatio > 2) score += 1;
            if (debit > 0 && debit < (farOption.last_price * 0.3)) score += 1;
            
            if (score >= 2) {
                probability = 'High';
            } else if (score <= 0) {
                probability = 'Low';
            }
            
            optionChainState.calendarSpread.calendarSpreads.push({
                strike,
                nearOption,
                farOption,
                debit,
                ivDiff,
                thetaRatio,
                probability
            });
        }
    });
    
    // Sort by probability
    optionChainState.calendarSpread.calendarSpreads.sort((a, b) => {
        const probOrder = { 'High': 0, 'Medium': 1, 'Low': 2 };
        return probOrder[a.probability] - probOrder[b.probability];
    });
    
    updateCalendarMetrics();
    updateCalendarRecommendations();
}

// Update Calendar Spread Table
function updateCalendarSpreadTable() {
    if (!calendarSpreadTable) return;
    
    if (optionChainState.calendarSpread.calendarSpreads.length === 0) {
        calendarSpreadTable.querySelector('tbody').innerHTML = 
            '<tr><td colspan="12" class="text-center">No calendar spreads available</td></tr>';
        return;
    }
    
    const tbody = calendarSpreadTable.querySelector('tbody');
    tbody.innerHTML = '';
    
    optionChainState.calendarSpread.calendarSpreads.forEach(spread => {
        const row = document.createElement('tr');
        
        if (spread.probability === 'High') {
            row.className = 'highlighted-row';
        }
        
        row.innerHTML = `
            <td>${spread.strike}</td>
            <td>${spread.nearOption.tradingsymbol}</td>
            <td>${spread.nearOption.iv?.toFixed(2) || '-'}%</td>
            <td data-token="${spread.nearOption.instrument_token}">${spread.nearOption.last_price?.toFixed(2) || '-'}</td>
            <td>${spread.farOption.tradingsymbol}</td>
            <td>${spread.farOption.iv?.toFixed(2) || '-'}%</td>
            <td data-token="${spread.farOption.instrument_token}">${spread.farOption.last_price?.toFixed(2) || '-'}</td>
            <td class="${spread.debit > 0 ? 'positive-value' : 'negative-value'}">${spread.debit.toFixed(2)}</td>
            <td class="${spread.ivDiff > 0 ? 'positive-value' : 'negative-value'}">${spread.ivDiff.toFixed(2)}%</td>
            <td>${spread.thetaRatio.toFixed(2)}</td>
            <td>
                <span class="badge ${spread.probability === 'High' ? 'badge-success' : 
                                   spread.probability === 'Medium' ? 'badge-warning' : 'badge-danger'}">
                    ${spread.probability}
                </span>
            </td>
            <td>
                <button class="button button-primary execute-calendar-spread-btn" 
                        data-near-token="${spread.nearOption.instrument_token}"
                        data-far-token="${spread.farOption.instrument_token}"
                        data-near-symbol="${spread.nearOption.tradingsymbol}"
                        data-far-symbol="${spread.farOption.tradingsymbol}">
                    Execute
                </button>
            </td>
        `;
        
        tbody.appendChild(row);
    });
    
    // Add event listeners to execute buttons
    document.querySelectorAll('.execute-calendar-spread-btn').forEach(btn => {
        btn.addEventListener('click', handleExecuteCalendarSpread);
    });
}

// Update Calendar Spread Metrics
function updateCalendarMetrics() {
    if (optionChainState.calendarSpread.calendarSpreads.length === 0) {
        if (csAvgIvDiff) csAvgIvDiff.textContent = '-';
        if (csAvgThetaRatio) csAvgThetaRatio.textContent = '-';
        if (csAvgDebit) csAvgDebit.textContent = '-';
        if (csSpreadsCount) csSpreadsCount.textContent = '-';
        return;
    }
    
    // Calculate averages
    const totalIvDiff = optionChainState.calendarSpread.calendarSpreads.reduce((sum, spread) => sum + spread.ivDiff, 0);
    const totalThetaRatio = optionChainState.calendarSpread.calendarSpreads.reduce((sum, spread) => sum + spread.thetaRatio, 0);
    const totalDebit = optionChainState.calendarSpread.calendarSpreads.reduce((sum, spread) => sum + spread.debit, 0);
    
    const avgIvDiffValue = totalIvDiff / optionChainState.calendarSpread.calendarSpreads.length;
    const avgThetaRatioValue = totalThetaRatio / optionChainState.calendarSpread.calendarSpreads.length;
    const avgDebitValue = totalDebit / optionChainState.calendarSpread.calendarSpreads.length;
    
    // Update UI
    if (csAvgIvDiff) {
        csAvgIvDiff.textContent = avgIvDiffValue.toFixed(2) + '%';
        csAvgIvDiff.className = avgIvDiffValue > 0 ? 'spread-metric-value positive-value' : 'spread-metric-value negative-value';
    }
    
    if (csAvgThetaRatio) {
        csAvgThetaRatio.textContent = avgThetaRatioValue.toFixed(2);
    }
    
    if (csAvgDebit) {
        csAvgDebit.textContent = avgDebitValue.toFixed(2);
        csAvgDebit.className = avgDebitValue > 0 ? 'spread-metric-value positive-value' : 'spread-metric-value negative-value';
    }
    
    if (csSpreadsCount) {
        csSpreadsCount.textContent = optionChainState.calendarSpread.calendarSpreads.length;
    }
}

// Update Calendar Spread Recommendations
function updateCalendarRecommendations() {
    if (!csRecommendationsContainer) return;
    
    if (optionChainState.calendarSpread.calendarSpreads.length === 0) {
        csRecommendationsContainer.innerHTML = `
            <div class="recommendation-item">
                <div>
                    <div class="recommendation-title">No recommendations available</div>
                    <div class="recommendation-desc">Load calendar spreads to view recommendations</div>
                </div>
            </div>
        `;
        return;
    }
    
    csRecommendationsContainer.innerHTML = '';
    
    const highProbabilitySpreads = optionChainState.calendarSpread.calendarSpreads.filter(spread => spread.probability === 'High');
    
    if (highProbabilitySpreads.length > 0) {
        highProbabilitySpreads.slice(0, 3).forEach(spread => {
            const item = document.createElement('div');
            item.className = 'recommendation-item';
            
            item.innerHTML = `
                <div>
                    <div class="recommendation-title high-probability">
                        ${spread.strike} ${csOptionType.value} Calendar Spread
                    </div>
                    <div class="recommendation-desc">
                        Sell ${spread.nearOption.tradingsymbol} @ ${spread.nearOption.last_price?.toFixed(2) || '-'}, 
                        Buy ${spread.farOption.tradingsymbol} @ ${spread.farOption.last_price?.toFixed(2) || '-'} <br>
                        IV Diff: ${spread.ivDiff.toFixed(2)}%, Theta Ratio: ${spread.thetaRatio.toFixed(2)}, 
                        Net Debit: ${spread.debit.toFixed(2)}
                    </div>
                </div>
                <button class="button button-primary execute-calendar-spread-btn" 
                        data-near-token="${spread.nearOption.instrument_token}"
                        data-far-token="${spread.farOption.instrument_token}"
                        data-near-symbol="${spread.nearOption.tradingsymbol}"
                        data-far-symbol="${spread.farOption.tradingsymbol}">
                    Execute
                </button>
            `;
            
            csRecommendationsContainer.appendChild(item);
        });
        
        csRecommendationsContainer.querySelectorAll('.execute-calendar-spread-btn').forEach(btn => {
            btn.addEventListener('click', handleExecuteCalendarSpread);
        });
    } else {
        csRecommendationsContainer.innerHTML = `
            <div class="recommendation-item">
                <div>
                    <div class="recommendation-title">No high probability spreads found</div>
                    <div class="recommendation-desc">Try different expiry dates or wait for better market conditions</div>
                </div>
            </div>
        `;
    }
}

// Handle Execute Calendar Spread button click
function handleExecuteCalendarSpread(event) {
    const btn = event.target;
    const nearToken = btn.dataset.nearToken;
    const farToken = btn.dataset.farToken;
    const nearSymbol = btn.dataset.nearSymbol;
    const farSymbol = btn.dataset.farSymbol;
    
    const nearOption = optionChainState.calendarSpread.nearMonthOptions.find(opt => opt.instrument_token == nearToken);
    const farOption = optionChainState.calendarSpread.farMonthOptions.find(opt => opt.instrument_token == farToken);
    
    if (!nearOption || !farOption) {
        window.tradeEaseApp.showToast('Error: Could not find options', 'error');
        return;
    }
    
    const qty = parseInt(csQuantity.value) || 75;
    
    if (confirm(`Execute Calendar Spread:\n\nSell ${qty} ${nearSymbol} @ ${nearOption.last_price?.toFixed(2) || 'Market'}\nBuy ${qty} ${farSymbol} @ ${farOption.last_price?.toFixed(2) || 'Market'}\n\nConfirm?`)) {
        executeCalendarSpread(nearOption, farOption, qty);
    }
}

// Execute Calendar Spread
async function executeCalendarSpread(nearOption, farOption, qty) {
    try {
        window.tradeEaseApp.updateStatus(`Executing calendar spread: Sell ${nearOption.tradingsymbol}, Buy ${farOption.tradingsymbol}`);
        
        // Place sell order for near month option
        const sellOrderResult = await placeOrder({
            tradingsymbol: nearOption.tradingsymbol,
            exchange: nearOption.exchange || 'NFO',
            transaction_type: 'SELL',
            quantity: qty,
            product: 'MIS',
            order_type: 'MARKET'
        });
        
        if (sellOrderResult.status !== 'success') {
            throw new Error(`Sell order failed: ${sellOrderResult.message}`);
        }
        
        window.tradeEaseApp.updateStatus(`Sell order placed: ${sellOrderResult.order_id}`);
        
        // Place buy order for far month option
        const buyOrderResult = await placeOrder({
            tradingsymbol: farOption.tradingsymbol,
            exchange: farOption.exchange || 'NFO',
            transaction_type: 'BUY',
            quantity: qty,
            product: 'MIS',
            order_type: 'MARKET'
        });
        
        if (buyOrderResult.status !== 'success') {
            window.tradeEaseApp.updateStatus(`Warning: Buy order failed: ${buyOrderResult.message}`);
            window.tradeEaseApp.showToast(`Buy order failed: ${buyOrderResult.message}`, 'error');
            return;
        }
        
        window.tradeEaseApp.updateStatus(`Buy order placed: ${buyOrderResult.order_id}`);
        window.tradeEaseApp.showToast(`Calendar spread executed successfully!`, 'success');
        
    } catch (error) {
        console.error('Error executing calendar spread:', error);
        window.tradeEaseApp.updateStatus(`Error executing calendar spread: ${error.message}`);
        window.tradeEaseApp.showToast(`Error executing calendar spread: ${error.message}`, 'error');
    }
}

// Add these functions to your existing option-chain.js file after the calendar spread implementation

// Vertical Spread Implementation
async function loadVerticalSpreads() {
    try {
        const vsIndexSelect = document.getElementById('vs-index-select');
        const vsSpotPrice = document.getElementById('vs-spot-price');
        const vsExpiry = document.getElementById('vs-expiry');
        const vsSpreadType = document.getElementById('vs-spread-type');
        const vsQuantity = document.getElementById('vs-quantity');
        
        if (!vsIndexSelect.value || !vsExpiry.value || !vsSpreadType.value || !vsSpotPrice.value) {
            window.tradeEaseApp.showToast('Please fill in all required fields', 'error');
            return;
        }
        
        const selectedIndex = vsIndexSelect.value;
        const spotPrice = parseFloat(vsSpotPrice.value);
        const spreadType = vsSpreadType.value;
        
        const loadingOverlay = window.tradeEaseApp.showLoadingState(
            document.getElementById('vertical-spread-results'), 
            'Calculating vertical spreads...'
        );
        
        const options = window.tradeEaseApp.state.instruments.filter(instr => 
            instr.tradingsymbol.includes(selectedIndex) && 
            instr.expiry === vsExpiry.value &&
            ((spreadType.includes('call') && instr.instrument_type === 'CE') ||
             (spreadType.includes('put') && instr.instrument_type === 'PE'))
        );
        
        const strikes = [...new Set(options.map(opt => opt.strike))].sort((a, b) => a - b);
        const atmStrikeIndex = strikes.reduce((prev, curr, index) => 
            Math.abs(curr - spotPrice) < Math.abs(strikes[prev] - spotPrice) ? index : prev, 0
        );
        
        const relevantStrikes = strikes.slice(
            Math.max(0, atmStrikeIndex - 5), 
            Math.min(strikes.length, atmStrikeIndex + 6)
        );
        
        optionChainState.verticalSpread.spreads = [];
        
        for (let i = 0; i < relevantStrikes.length - 1; i++) {
            const longStrike = relevantStrikes[i];
            const shortStrike = relevantStrikes[i + 1];
            
            const longOption = options.find(opt => opt.strike === longStrike);
            const shortOption = options.find(opt => opt.strike === shortStrike);
            
            if (longOption && shortOption && longOption.last_price && shortOption.last_price) {
                try {
                    const response = await window.tradeEaseApp.fetchWithCSRF('/api/strategies/vertical-spread/', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            spread_type: spreadType,
                            spot: spotPrice,
                            long_strike: longStrike,
                            short_strike: shortStrike,
                            expiry: vsExpiry.value,
                            long_premium: longOption.last_price,
                            short_premium: shortOption.last_price,
                            quantity: parseInt(vsQuantity.value),
                            symbol: selectedIndex
                        })
                    });
                    
                    const data = await response.json();
                    
                    if (data.status === 'success') {
                        optionChainState.verticalSpread.spreads.push({
                            ...data.data,
                            longOption,
                            shortOption
                        });
                    }
                } catch (error) {
                    console.error('Error calculating spread:', error);
                }
            }
        }
        
        updateVerticalSpreadTable();
        updateVerticalSpreadMetrics();
        window.tradeEaseApp.hideLoadingState(loadingOverlay);
        
    } catch (error) {
        console.error('Error loading vertical spreads:', error);
        window.tradeEaseApp.showToast('Error loading vertical spreads', 'error');
    }
}

function updateVerticalSpreadTable() {
    const table = document.getElementById('vertical-spread-table');
    if (!table) return;
    
    const tbody = table.querySelector('tbody');
    tbody.innerHTML = '';
    
    if (optionChainState.verticalSpread.spreads.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="text-center">No spreads available</td></tr>';
        return;
    }
    
    optionChainState.verticalSpread.spreads.forEach(spread => {
        const row = document.createElement('tr');
        const riskRewardRatio = spread.risk_reward_ratio || 0;
        
        if (riskRewardRatio > 2) {
            row.className = 'highlighted-row';
        }
        
        row.innerHTML = `
            <td>${spread.longOption.strike} / ${spread.shortOption.strike}</td>
            <td data-token="${spread.longOption.instrument_token}">${spread.longOption.last_price.toFixed(2)}</td>
            <td data-token="${spread.shortOption.instrument_token}">${spread.shortOption.last_price.toFixed(2)}</td>
            <td class="${spread.net_debit > 0 ? 'negative-value' : 'positive-value'}">
                ${Math.abs(spread.net_debit).toFixed(2)}
            </td>
            <td>${spread.breakeven.toFixed(2)}</td>
            <td class="positive-value">${spread.max_profit.toFixed(2)}</td>
            <td class="negative-value">${Math.abs(spread.max_loss).toFixed(2)}</td>
            <td>${riskRewardRatio.toFixed(2)}</td>
            <td>${(spread.profit_probability * 100).toFixed(1)}%</td>
            <td>
                <button class="button button-primary execute-vertical-spread-btn" 
                        data-spread='${JSON.stringify({
                            longOption: spread.longOption,
                            shortOption: spread.shortOption,
                            strategy: spread.strategy
                        })}'>
                    Execute
                </button>
            </td>
        `;
        
        tbody.appendChild(row);
    });
    
    document.querySelectorAll('.execute-vertical-spread-btn').forEach(btn => {
        btn.addEventListener('click', handleExecuteVerticalSpread);
    });
}

function updateVerticalSpreadMetrics() {
    const spreads = optionChainState.verticalSpread.spreads;
    if (spreads.length === 0) return;
    
    const avgRiskReward = spreads.reduce((sum, s) => sum + s.risk_reward_ratio, 0) / spreads.length;
    const avgProbability = spreads.reduce((sum, s) => sum + s.profit_probability, 0) / spreads.length;
    const bestRiskReward = Math.max(...spreads.map(s => s.risk_reward_ratio));
    
    document.getElementById('vs-avg-risk-reward').textContent = avgRiskReward.toFixed(2);
    document.getElementById('vs-avg-probability').textContent = (avgProbability * 100).toFixed(1) + '%';
    document.getElementById('vs-best-risk-reward').textContent = bestRiskReward.toFixed(2);
    document.getElementById('vs-spreads-count').textContent = spreads.length;
}

async function handleExecuteVerticalSpread(event) {
    const spreadData = JSON.parse(event.target.dataset.spread);
    const quantity = parseInt(document.getElementById('vs-quantity').value);
    
    if (confirm(`Execute ${spreadData.strategy}?\n\nBuy ${quantity} ${spreadData.longOption.tradingsymbol} @ ${spreadData.longOption.last_price}\nSell ${quantity} ${spreadData.shortOption.tradingsymbol} @ ${spreadData.shortOption.last_price}\n\nConfirm?`)) {
        try {
            const buyResult = await placeOrder({
                tradingsymbol: spreadData.longOption.tradingsymbol,
                exchange: 'NFO',
                transaction_type: 'BUY',
                quantity: quantity,
                product: 'MIS',
                order_type: 'MARKET'
            });
            
            if (buyResult.status === 'success') {
                const sellResult = await placeOrder({
                    tradingsymbol: spreadData.shortOption.tradingsymbol,
                    exchange: 'NFO',
                    transaction_type: 'SELL',
                    quantity: quantity,
                    product: 'MIS',
                    order_type: 'MARKET'
                });
                
                if (sellResult.status === 'success') {
                    window.tradeEaseApp.showToast('Vertical spread executed successfully!', 'success');
                }
            }
        } catch (error) {
            window.tradeEaseApp.showToast('Error executing spread: ' + error.message, 'error');
        }
    }
}

// Iron Condor Implementation
async function loadIronCondors() {
    try {
        const icIndexSelect = document.getElementById('ic-index-select');
        const icSpotPrice = document.getElementById('ic-spot-price');
        const icExpiry = document.getElementById('ic-expiry');
        const icWingWidth = document.getElementById('ic-wing-width');
        const icBodyWidth = document.getElementById('ic-body-width');
        const icQuantity = document.getElementById('ic-quantity');
        
        if (!icIndexSelect.value || !icExpiry.value || !icSpotPrice.value) {
            window.tradeEaseApp.showToast('Please fill in all required fields', 'error');
            return;
        }
        
        const loadingOverlay = window.tradeEaseApp.showLoadingState(
            document.getElementById('iron-condor-results'),
            'Calculating iron condors...'
        );
        
        const selectedIndex = icIndexSelect.value;
        const spotPrice = parseFloat(icSpotPrice.value);
        const wingWidth = parseInt(icWingWidth.value) || 200;
        const bodyWidth = parseInt(icBodyWidth.value) || 100;
        
        const options = window.tradeEaseApp.state.instruments.filter(instr => 
            instr.tradingsymbol.includes(selectedIndex) && 
            instr.expiry === icExpiry.value
        );
        
        const calls = options.filter(opt => opt.instrument_type === 'CE');
        const puts = options.filter(opt => opt.instrument_type === 'PE');
        
        const atmStrike = Math.round(spotPrice / 100) * 100;
        
        const putShortStrike = atmStrike - bodyWidth;
        const putLongStrike = putShortStrike - wingWidth;
        const callShortStrike = atmStrike + bodyWidth;
        const callLongStrike = callShortStrike + wingWidth;
        
        const putLong = puts.find(opt => opt.strike === putLongStrike);
        const putShort = puts.find(opt => opt.strike === putShortStrike);
        const callShort = calls.find(opt => opt.strike === callShortStrike);
        const callLong = calls.find(opt => opt.strike === callLongStrike);
        
        if (putLong && putShort && callShort && callLong && 
            putLong.last_price && putShort.last_price && 
            callShort.last_price && callLong.last_price) {
            
            const response = await window.tradeEaseApp.fetchWithCSRF('/api/strategies/iron-condor/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    spot: spotPrice,
                    put_long_strike: putLongStrike,
                    put_short_strike: putShortStrike,
                    call_short_strike: callShortStrike,
                    call_long_strike: callLongStrike,
                    expiry: icExpiry.value,
                    put_long_premium: putLong.last_price,
                    put_short_premium: putShort.last_price,
                    call_short_premium: callShort.last_price,
                    call_long_premium: callLong.last_price,
                    quantity: parseInt(icQuantity.value),
                    symbol: selectedIndex
                })
            });
            
            const data = await response.json();
            
            if (data.status === 'success') {
                optionChainState.ironCondor.condors = [{
                    ...data.data,
                    putLong,
                    putShort,
                    callShort,
                    callLong
                }];
                
                updateIronCondorDisplay(data.data);
            }
        }
        
        window.tradeEaseApp.hideLoadingState(loadingOverlay);
        
    } catch (error) {
        console.error('Error loading iron condors:', error);
        window.tradeEaseApp.showToast('Error calculating iron condor', 'error');
    }
}

function updateIronCondorDisplay(condorData) {
    document.getElementById('ic-net-credit').textContent = condorData.net_credit.toFixed(2);
    document.getElementById('ic-max-profit').textContent = condorData.max_profit.toFixed(2);
    document.getElementById('ic-max-loss').textContent = Math.abs(condorData.max_loss).toFixed(2);
    document.getElementById('ic-lower-breakeven').textContent = condorData.lower_breakeven.toFixed(2);
    document.getElementById('ic-upper-breakeven').textContent = condorData.upper_breakeven.toFixed(2);
    document.getElementById('ic-profit-zone').textContent = condorData.profit_zone_width.toFixed(2);
    document.getElementById('ic-probability').textContent = (condorData.probability_of_profit * 100).toFixed(1) + '%';
    
    const tbody = document.querySelector('#iron-condor-table tbody');
    tbody.innerHTML = '';
    
    condorData.positions.forEach(position => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${position.option_type}</td>
            <td>${position.transaction_type}</td>
            <td>${position.strike}</td>
            <td>${position.premium.toFixed(2)}</td>
            <td>${position.quantity}</td>
        `;
        tbody.appendChild(row);
    });
    
    if (condorData.adjustments && condorData.adjustments.length > 0) {
        const adjustmentsDiv = document.getElementById('ic-adjustments');
        adjustmentsDiv.innerHTML = '<h4>Suggested Adjustments:</h4>';
        condorData.adjustments.forEach(adj => {
            adjustmentsDiv.innerHTML += `
                <div class="alert alert-${adj.urgency === 'high' ? 'warning' : 'info'}">
                    <strong>${adj.action}</strong>: ${adj.reason}
                </div>
            `;
        });
    }
}

// Butterfly Spread Implementation
async function loadButterflies() {
    try {
        const bfIndexSelect = document.getElementById('bf-index-select');
        const bfSpotPrice = document.getElementById('bf-spot-price');
        const bfExpiry = document.getElementById('bf-expiry');
        const bfOptionType = document.getElementById('bf-option-type');
        const bfWingWidth = document.getElementById('bf-wing-width');
        const bfQuantity = document.getElementById('bf-quantity');
        
        if (!bfIndexSelect.value || !bfExpiry.value || !bfSpotPrice.value || !bfOptionType.value) {
            window.tradeEaseApp.showToast('Please fill in all required fields', 'error');
            return;
        }
        
        const loadingOverlay = window.tradeEaseApp.showLoadingState(
            document.getElementById('butterfly-results'),
            'Calculating butterfly spreads...'
        );
        
        const selectedIndex = bfIndexSelect.value;
        const spotPrice = parseFloat(bfSpotPrice.value);
        const wingWidth = parseInt(bfWingWidth.value) || 100;
        
        const options = window.tradeEaseApp.state.instruments.filter(instr => 
            instr.tradingsymbol.includes(selectedIndex) && 
            instr.expiry === bfExpiry.value &&
            instr.instrument_type === bfOptionType.value
        );
        
        const atmStrike = Math.round(spotPrice / 100) * 100;
        const lowerStrike = atmStrike - wingWidth;
        const upperStrike = atmStrike + wingWidth;
        
        const lowerOption = options.find(opt => opt.strike === lowerStrike);
        const middleOption = options.find(opt => opt.strike === atmStrike);
        const upperOption = options.find(opt => opt.strike === upperStrike);
        
        if (lowerOption && middleOption && upperOption &&
            lowerOption.last_price && middleOption.last_price && upperOption.last_price) {
            
            const response = await window.tradeEaseApp.fetchWithCSRF('/api/strategies/butterfly/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    spot: spotPrice,
                    lower_strike: lowerStrike,
                    middle_strike: atmStrike,
                    upper_strike: upperStrike,
                    expiry: bfExpiry.value,
                    lower_premium: lowerOption.last_price,
                    middle_premium: middleOption.last_price,
                    upper_premium: upperOption.last_price,
                    quantity: parseInt(bfQuantity.value),
                    option_type: bfOptionType.value,
                    symbol: selectedIndex
                })
            });
            
            const data = await response.json();
            
            if (data.status === 'success') {
                updateButterflyDisplay(data.data);
                drawButterflyPayoffChart(data.data);
            }
        }
        
        window.tradeEaseApp.hideLoadingState(loadingOverlay);
        
    } catch (error) {
        console.error('Error loading butterflies:', error);
        window.tradeEaseApp.showToast('Error calculating butterfly spread', 'error');
    }
}

function updateButterflyDisplay(butterflyData) {
    document.getElementById('bf-net-debit').textContent = Math.abs(butterflyData.net_debit).toFixed(2);
    document.getElementById('bf-max-profit').textContent = butterflyData.max_profit.toFixed(2);
    document.getElementById('bf-max-loss').textContent = Math.abs(butterflyData.max_loss).toFixed(2);
    document.getElementById('bf-lower-breakeven').textContent = butterflyData.lower_breakeven.toFixed(2);
    document.getElementById('bf-upper-breakeven').textContent = butterflyData.upper_breakeven.toFixed(2);
    document.getElementById('bf-profit-zone').textContent = butterflyData.profit_zone_width.toFixed(2);
    document.getElementById('bf-risk-reward').textContent = butterflyData.risk_reward_ratio.toFixed(2);
}

function drawButterflyPayoffChart(butterflyData) {
    const canvas = document.getElementById('butterfly-payoff-chart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    ctx.clearRect(0, 0, width, height);
    
    const spotRange = butterflyData.spot_range;
    const pnlRange = butterflyData.pnl_range;
    
    const minSpot = Math.min(...spotRange);
    const maxSpot = Math.max(...spotRange);
    const minPnl = Math.min(...pnlRange);
    const maxPnl = Math.max(...pnlRange);
    
    const xScale = width / (maxSpot - minSpot);
    const yScale = height / (maxPnl - minPnl);
    
    ctx.strokeStyle = '#4CAF50';
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    spotRange.forEach((spot, index) => {
        const x = (spot - minSpot) * xScale;
        const y = height - ((pnlRange[index] - minPnl) * yScale);
        
        if (index === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });
    
    ctx.stroke();
    
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(0, height - ((-minPnl) * yScale));
    ctx.lineTo(width, height - ((-minPnl) * yScale));
    ctx.stroke();
    ctx.setLineDash([]);
}

// Diagonal Spread Implementation
async function loadDiagonalSpreads() {
    try {
        const dsIndexSelect = document.getElementById('ds-index-select');
        const dsSpotPrice = document.getElementById('ds-spot-price');
        const dsNearExpiry = document.getElementById('ds-near-month-expiry');
        const dsFarExpiry = document.getElementById('ds-far-month-expiry');
        const dsOptionType = document.getElementById('ds-option-type');
        const dsSpreadType = document.getElementById('ds-spread-type');
        const dsQuantity = document.getElementById('ds-quantity');
        
        if (!dsIndexSelect.value || !dsNearExpiry.value || !dsFarExpiry.value || 
            !dsSpotPrice.value || !dsOptionType.value || !dsSpreadType.value) {
            window.tradeEaseApp.showToast('Please fill in all required fields', 'error');
            return;
        }
        
        const response = await window.tradeEaseApp.fetchWithCSRF('/api/strategies/diagonal-spread/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                spot: parseFloat(dsSpotPrice.value),
                near_strike: 22400,  // These would be selected by user in full implementation
                far_strike: 22600,
                near_expiry: dsNearExpiry.value,
                far_expiry: dsFarExpiry.value,
                near_premium: 100,  // Would come from real option data
                far_premium: 150,
                quantity: parseInt(dsQuantity.value),
                option_type: dsOptionType.value,
                spread_type: dsSpreadType.value,
                symbol: dsIndexSelect.value
            })
        });
        
        const data = await response.json();
        
        if (data.status === 'success') {
            updateDiagonalSpreadDisplay(data.data);
        }
        
    } catch (error) {
        console.error('Error loading diagonal spreads:', error);
        window.tradeEaseApp.showToast('Error calculating diagonal spread', 'error');
    }
}

// Ratio Spread Implementation
async function loadRatioSpreads() {
    try {
        const rsIndexSelect = document.getElementById('rs-index-select');
        const rsSpotPrice = document.getElementById('rs-spot-price');
        const rsExpiry = document.getElementById('rs-expiry');
        const rsOptionType = document.getElementById('rs-option-type');
        const rsLongQuantity = document.getElementById('rs-long-quantity');
        const rsShortQuantity = document.getElementById('rs-short-quantity');
        
        if (!rsIndexSelect.value || !rsExpiry.value || !rsSpotPrice.value || !rsOptionType.value) {
            window.tradeEaseApp.showToast('Please fill in all required fields', 'error');
            return;
        }
        
        const response = await window.tradeEaseApp.fetchWithCSRF('/api/strategies/ratio-spread/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                spot: parseFloat(rsSpotPrice.value),
                long_strike: 22400,  // These would be selected by user
                short_strike: 22600,
                expiry: rsExpiry.value,
                long_premium: 150,  // Would come from real option data
                short_premium: 75,
                long_quantity: parseInt(rsLongQuantity.value),
                short_quantity: parseInt(rsShortQuantity.value),
                option_type: rsOptionType.value,
                symbol: rsIndexSelect.value
            })
        });
        
        const data = await response.json();
        
        if (data.status === 'success') {
            updateRatioSpreadDisplay(data.data);
        }
        
    } catch (error) {
        console.error('Error loading ratio spreads:', error);
        window.tradeEaseApp.showToast('Error calculating ratio spread', 'error');
    }
}

function updateDiagonalSpreadDisplay(diagonalData) {
    const resultsDiv = document.getElementById('diagonal-spread-metrics');
    resultsDiv.innerHTML = `
        <div class="metrics-grid">
            <div class="metric-card">
                <div class="metric-title">Strategy</div>
                <div class="metric-value">${diagonalData.strategy}</div>
            </div>
            <div class="metric-card">
                <div class="metric-title">Net Cost</div>
                <div class="metric-value ${diagonalData.net_cost > 0 ? 'negative-value' : 'positive-value'}">
                    ${Math.abs(diagonalData.net_cost).toFixed(2)}
                </div>
            </div>
            <div class="metric-card">
                <div class="metric-title">Position Type</div>
                <div class="metric-value">${diagonalData.position_type}</div>
            </div>
            <div class="metric-card">
                <div class="metric-title">Favorable Direction</div>
                <div class="metric-value">${diagonalData.favorable_move_direction}</div>
            </div>
        </div>
    `;
}

function updateRatioSpreadDisplay(ratioData) {
    const resultsDiv = document.getElementById('ratio-spread-metrics');
    
    if (ratioData.risk_warnings && ratioData.risk_warnings.length > 0) {
        const warningsHtml = ratioData.risk_warnings.map(warning => 
            `<div class="alert alert-${warning.level}">${warning.message}</div>`
        ).join('');
        
        resultsDiv.innerHTML = warningsHtml + resultsDiv.innerHTML;
    }
    
    resultsDiv.innerHTML += `
        <div class="metrics-grid">
            <div class="metric-card">
                <div class="metric-title">Ratio</div>
                <div class="metric-value">${ratioData.ratio.toFixed(1)}:1</div>
            </div>
            <div class="metric-card">
                <div class="metric-title">Net Position</div>
                <div class="metric-value ${ratioData.net_position > 0 ? 'positive-value' : 'negative-value'}">
                    ${Math.abs(ratioData.net_position).toFixed(2)}
                </div>
            </div>
            <div class="metric-card">
                <div class="metric-title">Max Profit</div>
                <div class="metric-value positive-value">${ratioData.max_profit.toFixed(2)}</div>
            </div>
            <div class="metric-card">
                <div class="metric-title">Unlimited Risk</div>
                <div class="metric-value negative-value">${ratioData.unlimited_risk_direction}</div>
            </div>
        </div>
    `;
}

// Initialize strategy-specific event listeners
function initializeStrategyEventListeners() {
    // Vertical Spread
    const vsLoadBtn = document.getElementById('vs-load-spreads-btn');
    if (vsLoadBtn) {
        vsLoadBtn.removeEventListener('click', loadVerticalSpreads);
        vsLoadBtn.addEventListener('click', loadVerticalSpreads);
    }
    
    const vsIndexSelect = document.getElementById('vs-index-select');
    if (vsIndexSelect) {
        vsIndexSelect.addEventListener('change', () => {
            populateExpiryDropdowns('vertical-spread');
        });
    }
    
    // Iron Condor
    const icLoadBtn = document.getElementById('ic-load-spreads-btn');
    if (icLoadBtn) {
        icLoadBtn.removeEventListener('click', loadIronCondors);
        icLoadBtn.addEventListener('click', loadIronCondors);
    }
    
    const icIndexSelect = document.getElementById('ic-index-select');
    if (icIndexSelect) {
        icIndexSelect.addEventListener('change', () => {
            populateExpiryDropdowns('iron-condor');
        });
    }
    
    // Butterfly
    const bfLoadBtn = document.getElementById('bf-load-spreads-btn');
    if (bfLoadBtn) {
        bfLoadBtn.removeEventListener('click', loadButterflies);
        bfLoadBtn.addEventListener('click', loadButterflies);
    }
    
    const bfIndexSelect = document.getElementById('bf-index-select');
    if (bfIndexSelect) {
        bfIndexSelect.addEventListener('change', () => {
            populateExpiryDropdowns('butterfly');
        });
    }
    
    // Diagonal Spread
    const dsLoadBtn = document.getElementById('ds-load-spreads-btn');
    if (dsLoadBtn) {
        dsLoadBtn.removeEventListener('click', loadDiagonalSpreads);
        dsLoadBtn.addEventListener('click', loadDiagonalSpreads);
    }
    
    const dsIndexSelect = document.getElementById('ds-index-select');
    if (dsIndexSelect) {
        dsIndexSelect.addEventListener('change', () => {
            populateExpiryDropdowns('diagonal-spread');
        });
    }
    
    // Ratio Spread
    const rsLoadBtn = document.getElementById('rs-load-spreads-btn');
    if (rsLoadBtn) {
        rsLoadBtn.removeEventListener('click', loadRatioSpreads);
        rsLoadBtn.addEventListener('click', loadRatioSpreads);
    }
    
    const rsIndexSelect = document.getElementById('rs-index-select');
    if (rsIndexSelect) {
        rsIndexSelect.addEventListener('change', () => {
            populateExpiryDropdowns('ratio-spread');
        });
    }
}

// Update the initializeStrategyControls function
function initializeStrategyControls(strategy) {
    switch (strategy) {
        case 'calendar-spread':
            populateExpiryDropdowns('calendar-spread');
            break;
            
        case 'vertical-spread':
            populateExpiryDropdowns('vertical-spread');
            initializeStrategyEventListeners();
            break;
            
        case 'iron-condor':
            populateExpiryDropdowns('iron-condor');
            initializeStrategyEventListeners();
            break;
            
        case 'butterfly':
            populateExpiryDropdowns('butterfly');
            initializeStrategyEventListeners();
            break;
            
        case 'diagonal-spread':
            populateExpiryDropdowns('diagonal-spread');
            initializeStrategyEventListeners();
            break;
            
        case 'ratio-spread':
            populateExpiryDropdowns('ratio-spread');
            initializeStrategyEventListeners();
            break;
    }
}

// Add to the existing initOptionChain function
const existingInitOptionChain = initOptionChain;
initOptionChain = function() {
    existingInitOptionChain();
    initializeStrategyEventListeners();
};

// Place order API call
async function placeOrder(orderParams) {
    try {
        window.tradeEaseApp.updateStatus(`Placing ${orderParams.transaction_type} order for ${orderParams.quantity} ${orderParams.tradingsymbol}...`);
        
        const response = await window.tradeEaseApp.fetchWithCSRF('/api/orders/place/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Token ${window.tradeEaseApp.state.sessionToken}`
            },
            body: JSON.stringify(orderData)
        });
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Order placement error:', error);
        return {
            status: 'error',
            message: error.message
        };
    }
}

// Update strategy view
function updateStrategyView(strategy) {
    // Update description
    const descDiv = document.getElementById('strategy-description');
    if (descDiv && strategyDescriptions[strategy]) {
        descDiv.innerHTML = `
            <h2 class="card-title">${strategyDescriptions[strategy].emoji} ${strategyDescriptions[strategy].title}</h2>
            <p class="strategy-desc" style="color: var(--muted-foreground); line-height: 1.6;">
                ${strategyDescriptions[strategy].description}
            </p>
        `;
    }
    
    // Hide all control panels
    document.querySelectorAll('.strategy-control-panel').forEach(panel => {
        panel.style.display = 'none';
    });
    
    // Show the specific control panel
    const controlPanel = document.getElementById(`${strategy}-controls`);
    if (controlPanel) {
        controlPanel.style.display = 'block';
    }
    
    // Hide all result panels
    document.querySelectorAll('.strategy-result-panel').forEach(panel => {
        panel.style.display = 'none';
    });
    
    // Show the specific result panel
    const resultPanel = document.getElementById(`${strategy}-results`);
    if (resultPanel) {
        resultPanel.style.display = 'block';
    }
    
    // Initialize the specific strategy view
    initializeStrategyControls(strategy);
}

// Initialize strategy-specific controls
function initializeStrategyControls(strategy) {
    switch (strategy) {
        case 'calendar-spread':
            populateExpiryDropdowns('calendar-spread');
            break;
            
        case 'vertical-spread':
            populateExpiryDropdowns('vertical-spread');
            const vsLoadBtn = document.getElementById('vs-load-spreads-btn');
            if (vsLoadBtn) {
                vsLoadBtn.addEventListener('click', () => {
                    window.tradeEaseApp.showToast('Vertical spread analysis will be available in the next update', 'info');
                });
            }
            break;
            
        case 'iron-condor':
            populateExpiryDropdowns('iron-condor');
            const icLoadBtn = document.getElementById('ic-load-spreads-btn');
            if (icLoadBtn) {
                icLoadBtn.addEventListener('click', () => {
                    window.tradeEaseApp.showToast('Iron Condor analysis will be available in the next update', 'info');
                });
            }
            break;
            
        case 'butterfly':
            populateExpiryDropdowns('butterfly');
            const bfLoadBtn = document.getElementById('bf-load-spreads-btn');
            if (bfLoadBtn) {
                bfLoadBtn.addEventListener('click', () => {
                    window.tradeEaseApp.showToast('Butterfly analysis will be available in the next update', 'info');
                });
            }
            break;
            
        case 'diagonal-spread':
        case 'ratio-spread':
            window.tradeEaseApp.showToast(`${strategyDescriptions[strategy].title} analysis will be available in a future update`, 'info');
            setTimeout(() => {
                document.querySelector('[data-strategy="calendar-spread"]').click();
            }, 1000);
            break;
    }
}

// Update instrument price from WebSocket tick data
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
    
    // Update strategy-specific data based on active strategy
    const activeStrategy = document.querySelector('.strategy-tab.active')?.dataset.strategy;
    if (!activeStrategy) return;
    
    switch (activeStrategy) {
        case 'calendar-spread':
            // Update near month options
            const nearMonthIndex = optionChainState.calendarSpread.nearMonthOptions.findIndex(
                option => option.instrument_token === token
            );
            if (nearMonthIndex >= 0) {
                optionChainState.calendarSpread.nearMonthOptions[nearMonthIndex].last_price = newPrice;
            }
            
            // Update far month options
            const farMonthIndex = optionChainState.calendarSpread.farMonthOptions.findIndex(
                option => option.instrument_token === token
            );
            if (farMonthIndex >= 0) {
                optionChainState.calendarSpread.farMonthOptions[farMonthIndex].last_price = newPrice;
            }
            
            // If either was updated, recalculate spreads
            if (nearMonthIndex >= 0 || farMonthIndex >= 0) {
                calculateCalendarSpreads();
                updateCalendarSpreadTable();
            }
            break;
    }
    
    // Update any price cells in the table
    const priceCells = document.querySelectorAll(`[data-token="${token}"]`);
    priceCells.forEach(cell => {
        const oldPrice = parseFloat(cell.textContent) || 0;
        cell.textContent = newPrice.toFixed(2);
        
        // Add visual indicator for price change
        cell.classList.remove('price-up', 'price-down');
        
        if (newPrice > oldPrice) {
            cell.classList.add('price-up');
        } else if (newPrice < oldPrice) {
            cell.classList.add('price-down');
        }
    });
};

// Initialize the application
function initOptionChain() {
    // Initialize DOM elements
    initializeOptionChainElements();
    
    // Check for existing session token
    window.tradeEaseApp.checkSavedAuthToken().then(authenticated => {
        if (authenticated) {
            // Proceed to fetch instruments
            fetchInstruments();
            
            // Connect to WebSocket
            if (window.wsManager) {
                window.wsManager.connect();
            }
        } else {
            window.tradeEaseApp.showToast('Please login on the main page first');
        }
    });
    
    // Set up event listeners for Calendar Spread controls
    if (csIndexSelect) {
        csIndexSelect.addEventListener('change', () => {
            populateExpiryDropdowns('calendar-spread');
        });
    }
    
    if (csLoadSpreadsBtn) {
        csLoadSpreadsBtn.addEventListener('click', loadCalendarSpreads);
    }
    
    // Strategy tabs
    document.querySelectorAll('.strategy-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            // Remove active class from all tabs
            document.querySelectorAll('.strategy-tab').forEach(t => t.classList.remove('active'));
            
            // Add active class to clicked tab
            tab.classList.add('active');
            
            // Update strategy view
            updateStrategyView(tab.dataset.strategy);
        });
    });
    
    // Initialize the default strategy (calendar spread)
    updateStrategyView('calendar-spread');
    
    window.tradeEaseApp.updateStatus('Option Chain Analysis initialized');
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initOptionChain);

