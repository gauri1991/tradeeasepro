// Common JavaScript utilities and functions
class TradeEaseApp {
    constructor() {
        this.state = {
            isAuthenticated: false,
            sessionToken: null,
            wsConnection: null,
            wsConnected: false,
            instruments: [],
            selectedInstruments: [],
            searchResults: [],
            selectedSearchItem: null
        };

        // Ensure CSRF token is available
        this.ensureCsrfToken();
    }

    // Enhanced CSRF token handling
    ensureCsrfToken() {
        // Try to get CSRF token from cookie
        let token = this.getCsrfToken();
        
        if (!token) {
            console.warn('CSRF token not found in cookies, fetching...');
            // Make a GET request to get CSRF token
            fetch('/api/auth-status/', {
                credentials: 'same-origin'  // Include cookies
            }).then(() => {
                token = this.getCsrfToken();
                console.log('CSRF token after fetch:', token);
            }).catch(err => {
                console.error('Error fetching CSRF token:', err);
            });
        } else {
            console.log('CSRF token found:', token);
        }
    }


    // Common utility functions
    updateStatus(message) {
        const timestamp = new Date().toLocaleTimeString();
        console.log(`[${timestamp}] ${message}`);
        
        // Update status output if it exists
        const statusOutput = document.getElementById('status-output');
        if (statusOutput) {
            statusOutput.textContent = `[${timestamp}] ${message}\n${statusOutput.textContent}`;
        }
        
        // Also log to WebSocket debug if available
        if (window.addWsDebugLog) {
            window.addWsDebugLog(`✨ ${message}`);
        }
    }

    showToast(message, type = 'info') {
        // Create enhanced toast notification
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 1rem 1.5rem;
            background: linear-gradient(135deg, var(--card), #fdfdfd);
            border: 1px solid var(--border);
            border-radius: var(--radius);
            box-shadow: var(--shadow-lg);
            z-index: 1000;
            font-weight: 500;
            max-width: 300px;
            animation: slideIn 0.3s ease-out;
            font-size: 0.875rem;
        `;
        
        const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️';
        toast.innerHTML = `<span style="margin-right: 0.5rem;">${icon}</span>${message}`;
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease-in forwards';
            setTimeout(() => {
                if (document.body.contains(toast)) {
                    document.body.removeChild(toast);
                }
            }, 300);
        }, 3000);
    }

    getCsrfToken() {
        // Multiple methods to get CSRF token
        
        // Method 1: From cookie
        const cookieValue = this.getCsrfTokenFromCookie();
        if (cookieValue) {
            return cookieValue;
        }
        
        // Method 2: From meta tag (if you add it to template)
        const metaToken = document.querySelector('meta[name="csrf-token"]');
        if (metaToken) {
            return metaToken.getAttribute('content');
        }
        
        // Method 3: From hidden input (if you add it to template)
        const hiddenInput = document.querySelector('input[name="csrfmiddlewaretoken"]');
        if (hiddenInput) {
            return hiddenInput.value;
        }
        
        console.warn('No CSRF token found!');
        return '';
    }
    
    getCsrfTokenFromCookie() {
        const name = 'csrftoken';
        let cookieValue = null;
        if (document.cookie && document.cookie !== '') {
            const cookies = document.cookie.split(';');
            for (let i = 0; i < cookies.length; i++) {
                const cookie = cookies[i].trim();
                if (cookie.substring(0, name.length + 1) === (name + '=')) {
                    cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                    break;
                }
            }
        }
        return cookieValue;
    }
    // Enhanced fetch wrapper that ensures CSRF token
    async fetchWithCSRF(url, options = {}) {
        const token = this.getCsrfToken();
        
        if (!token) {
            console.error('No CSRF token available for request to:', url);
            throw new Error('CSRF token not available');
        }
        
        // Ensure headers object exists
        if (!options.headers) {
            options.headers = {};
        }
        
        // Add CSRF token to headers
        options.headers['X-CSRFToken'] = token;
        
        // Ensure credentials are included
        options.credentials = 'same-origin';
        
        console.log('Making request with CSRF token:', token);
        
        return fetch(url, options);
    }

    showLoadingState(element, message = 'Loading...') {
        const overlay = document.createElement('div');
        overlay.className = 'loading-overlay';
        overlay.innerHTML = `
            <div class="loading-spinner"></div>
            <div class="loading-text">${message}</div>
        `;
        element.style.position = 'relative';
        element.appendChild(overlay);
        return overlay;
    }

    hideLoadingState(overlay) {
        if (overlay && overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
        }
    }

    // Update connection indicator
    updateConnectionStatus() {
        const connectionBadge = document.getElementById('connection-badge');
        if (!connectionBadge) return;

        if (this.state.isAuthenticated) {
            connectionBadge.textContent = 'Authenticated';
            connectionBadge.className = 'text-success';
        } else {
            connectionBadge.textContent = 'Not Authenticated';
            connectionBadge.className = 'text-danger';
        }
    }

    // Check for saved auth token on page load
    async checkSavedAuthToken() {
        try {
            this.updateStatus('Checking for saved auth token...');
            
            const response = await fetch('/api/auth-status/');
            const data = await response.json();
            
            if (data.status === 'authenticated' && data.access_token) {
                this.state.sessionToken = data.access_token;
                this.state.isAuthenticated = true;
                
                this.updateStatus('Found valid authentication token');
                this.updateConnectionStatus();
                return true;
            } else {
                this.state.sessionToken = null;
                this.state.isAuthenticated = false;
                
                this.updateStatus(data.message || 'No valid authentication token found');
                this.updateConnectionStatus();
                return false;
            }
        } catch (error) {
            console.error('Error checking auth status:', error);
            this.updateStatus(`Error: ${error.message}`);
            
            this.state.sessionToken = null;
            this.state.isAuthenticated = false;
            this.updateConnectionStatus();
            return false;
        }
    }

    // Format date for display
    formatDate(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', { 
            day: '2-digit', 
            month: 'short', 
            year: 'numeric' 
        });
    }

    // Debounce function for search performance
    debounce(func, wait) {
        let timeout;
        return function() {
            const context = this;
            const args = arguments;
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                func.apply(context, args);
            }, wait);
        };
    }
}

// WebSocket Debug Logging
window.addWsDebugLog = function(message) {
    const wsDebugLog = document.getElementById('ws-debug-log');
    if (!wsDebugLog) return;
    
    const timestamp = new Date().toLocaleTimeString();
    
    // Format JSON for better readability if message is JSON
    let formattedMessage = message;
    if (typeof message === 'string' && message.includes('Tick data:')) {
        try {
            const tickData = JSON.parse(message.replace('Tick data: ', ''));
            formattedMessage = `Tick data received:
    Token: ${tickData.instrument_token}
    Last Price: ${tickData.last_price}
    ${tickData.volume_traded ? 'Volume: ' + tickData.volume_traded : ''}
    ${tickData.oi ? 'OI: ' + tickData.oi : ''}`;
        } catch (e) {
            // If parsing fails, use the original message
        }
    }
    
    // Prepend the new log entry
    const newEntry = document.createElement('div');
    newEntry.className = 'log-entry';
    newEntry.innerHTML = `<span class="log-time">[${timestamp}]</span> <span class="log-msg">${formattedMessage}</span>`;
    
    // Style based on content type
    if (message.includes('Error')) {
        newEntry.style.color = 'var(--danger)';
    } else if (message.includes('Tick data')) {
        newEntry.style.color = 'var(--success)';
    } else if (message.includes('Subscribed')) {
        newEntry.style.color = 'var(--info)';
    }
    
    wsDebugLog.insertBefore(newEntry, wsDebugLog.firstChild);
    
    // Keep only the latest 20 entries
    while (wsDebugLog.children.length > 20) {
        wsDebugLog.removeChild(wsDebugLog.lastChild);
    }
    
    // Auto-scroll if enabled
    const autoScrollCheckbox = document.getElementById('auto-scroll');
    if (autoScrollCheckbox && autoScrollCheckbox.checked) {
        wsDebugLog.scrollTop = 0;
    }
};

// Create global app instance
window.tradeEaseApp = new TradeEaseApp();

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Set up clear log button if it exists
    const clearWsLogBtn = document.getElementById('clear-ws-log');
    if (clearWsLogBtn) {
        clearWsLogBtn.addEventListener('click', () => {
            const wsDebugLog = document.getElementById('ws-debug-log');
            if (wsDebugLog) {
                wsDebugLog.innerHTML = '<div style="color: var(--success); font-weight: 600;">🚀 WebSocket debug log cleared</div>';
            }
        });
    }

    // Check for saved auth token
    window.tradeEaseApp.checkSavedAuthToken();
});