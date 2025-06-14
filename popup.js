// Popup JavaScript for EmailMind Chrome Extension

class EmailMindPopup {
    constructor() {
        this.isAuthenticated = false;
        this.currentUser = null;
        this.emailData = [];
        this.chatHistory = [];
        
        this.init();
    }

    async init() {
        this.setupEventListeners();
        await this.checkAuthStatus();
        this.loadSettings();
        this.loadChatHistory();
    }

    setupEventListeners() {
        // Tab navigation
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });

        // Gmail connection
        document.getElementById('connect-gmail').addEventListener('click', () => {
            this.connectGmail();
        });

        // Chat functionality
        document.getElementById('send-btn').addEventListener('click', () => {
            this.sendMessage();
        });

        document.getElementById('chat-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Settings toggles
        document.querySelectorAll('.toggle-switch').forEach(toggle => {
            toggle.addEventListener('click', (e) => {
                this.toggleSetting(e.target);
            });
        });

        // Settings dropdowns
        document.querySelectorAll('.select-input').forEach(select => {
            select.addEventListener('change', (e) => {
                this.saveSetting(e.target.id, e.target.value);
            });
        });

        // Disconnect button
        document.getElementById('disconnect-btn').addEventListener('click', () => {
            this.disconnectGmail();
        });

        // Email actions
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('action-btn')) {
                this.handleEmailAction(e.target);
            }
        });
    }

    switchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        // Update tab content
        document.querySelectorAll('.tab-pane').forEach(pane => {
            pane.classList.remove('active');
        });
        document.getElementById(tabName).classList.add('active');

        // Load tab-specific data
        if (tabName === 'summary' && this.isAuthenticated) {
            this.loadEmailSummary();
        }
    }

    async checkAuthStatus() {
        try {
            // Check if user is authenticated with Gmail
            const result = await this.sendMessageToBackground({
                action: 'checkAuth'
            });

            if (result.authenticated) {
                this.isAuthenticated = true;
                this.currentUser = result.user;
                this.showAuthenticatedUI();
                await this.loadEmailSummary();
            } else {
                this.showUnauthenticatedUI();
            }
        } catch (error) {
            console.error('Error checking auth status:', error);
            this.showUnauthenticatedUI();
        }
    }

    async connectGmail() {
        const connectBtn = document.getElementById('connect-gmail');
        connectBtn.disabled = true;
        connectBtn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right: 8px;"></i>Connecting...';

        try {
            const result = await this.sendMessageToBackground({
                action: 'authenticate'
            });

            if (result.success) {
                this.isAuthenticated = true;
                this.currentUser = result.user;
                this.showAuthenticatedUI();
                await this.loadEmailSummary();
                this.showNotification('Successfully connected to Gmail!', 'success');
            } else {
                throw new Error(result.error || 'Authentication failed');
            }
        } catch (error) {
            console.error('Gmail connection error:', error);
            this.showNotification('Failed to connect to Gmail. Please try again.', 'error');
        } finally {
            connectBtn.disabled = false;
            connectBtn.innerHTML = '<i class="fab fa-google" style="margin-right: 8px;"></i>Connect Gmail';
        }
    }

    async disconnectGmail() {
        if (confirm('Are you sure you want to disconnect your Gmail account?')) {
            try {
                await this.sendMessageToBackground({
                    action: 'disconnect'
                });
                
                this.isAuthenticated = false;
                this.currentUser = null;
                this.emailData = [];
                this.showUnauthenticatedUI();
                this.showNotification('Gmail account disconnected', 'info');
            } catch (error) {
                console.error('Disconnect error:', error);
                this.showNotification('Error disconnecting account', 'error');
            }
        }
    }

    showAuthenticatedUI() {
        document.getElementById('auth-section').style.display = 'none';
        document.getElementById('summary-section').style.display = 'block';
        
        // Enable chat
        document.getElementById('chat-input').disabled = false;
        document.getElementById('send-btn').disabled = false;
    }

    showUnauthenticatedUI() {
        document.getElementById('auth-section').style.display = 'block';
        document.getElementById('summary-section').style.display = 'none';
        
        // Disable chat
        document.getElementById('chat-input').disabled = true;
        document.getElementById('send-btn').disabled = true;
        
        // Clear email list
        document.getElementById('email-list').innerHTML = '';
    }

    async loadEmailSummary() {
        if (!this.isAuthenticated) return;

        const loadingSection = document.getElementById('loading-section');
        const summarySection = document.getElementById('summary-section');
        
        loadingSection.style.display = 'block';
        summarySection.style.display = 'none';

        try {
            const result = await this.sendMessageToBackground({
                action: 'getEmailSummary'
            });

            if (result.success) {
                this.emailData = result.emails || [];
                this.renderEmailSummary(result);
            } else {
                throw new Error(result.error || 'Failed to load emails');
            }
        } catch (error) {
            console.error('Error loading email summary:', error);
            this.showEmptyState('summary', 'Error loading emails', 'Please try refreshing or check your connection.');
        } finally {
            loadingSection.style.display = 'none';
            summarySection.style.display = 'block';
        }
    }

    renderEmailSummary(data) {
        const { emails = [], stats = {} } = data;

        // Update stats
        document.getElementById('total-emails').textContent = stats.total || emails.length;
        document.getElementById('important-emails').textContent = stats.important || 0;
        document.getElementById('action-items').textContent = stats.actionItems || 0;
        document.getElementById('last-updated').textContent = this.formatLastUpdated(stats.lastUpdated);

        // Render email list
        const emailList = document.getElementById('email-list');
        
        if (emails.length === 0) {
            emailList.innerHTML = this.getEmptyStateHTML('No emails found', 'Your inbox is all caught up!');
            return;
        }

        emailList.innerHTML = emails.map(email => this.renderEmailItem(email)).join('');
    }

    renderEmailItem(email) {
        const priorityClass = this.getPriorityClass(email.priority);
        const timeAgo = this.formatTimeAgo(email.timestamp);
        
        return `
            <div class="email-item" data-email-id="${email.id}">
                <div class="email-priority ${priorityClass}"></div>
                <div class="email-sender">${this.escapeHtml(email.sender)}</div>
                <div class="email-subject">${this.escapeHtml(email.subject)}</div>
                <div class="email-summary">${this.escapeHtml(email.summary)}</div>
                <div class="email-actions">
                    <button class="action-btn" data-action="open" data-email-id="${email.id}">
                        <i class="fas fa-external-link-alt"></i> Open
                    </button>
                    <button class="action-btn" data-action="archive" data-email-id="${email.id}">
                        <i class="fas fa-archive"></i> Archive
                    </button>
                    ${email.hasActionItems ? '<button class="action-btn" data-action="remind" data-email-id="' + email.id + '"><i class="fas fa-bell"></i> Remind</button>' : ''}
                </div>
                <div style="font-size: 10px; color: #adb5bd; margin-top: 8px;">${timeAgo}</div>
            </div>
        `;
    }

    async sendMessage() {
        const input = document.getElementById('chat-input');
        const message = input.value.trim();
        
        if (!message || !this.isAuthenticated) return;

        // Add user message to chat
        this.addChatMessage('user', message);
        input.value = '';

        // Show typing indicator
        const typingId = this.addChatMessage('assistant', 'Thinking...', true);

        try {
            const response = await this.sendMessageToBackground({
                action: 'chatQuery',
                message: message,
                context: this.emailData
            });

            // Remove typing indicator
            this.removeChatMessage(typingId);

            if (response.success) {
                this.addChatMessage('assistant', response.answer);
                this.saveChatHistory();
            } else {
                this.addChatMessage('assistant', 'Sorry, I encountered an error processing your request. Please try again.');
            }
        } catch (error) {
            console.error('Chat error:', error);
            this.removeChatMessage(typingId);
            this.addChatMessage('assistant', 'Sorry, I\'m having trouble connecting right now. Please try again later.');
        }
    }

    addChatMessage(sender, content, isTemporary = false) {
        const messagesContainer = document.getElementById('chat-messages');
        const messageId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        
        const messageElement = document.createElement('div');
        messageElement.className = `message ${sender}`;
        messageElement.id = messageId;
        
        const avatar = sender === 'user' ? 'You' : 'AI';
        messageElement.innerHTML = `
            <div class="message-avatar">${avatar}</div>
            <div class="message-content">${this.escapeHtml(content)}</div>
        `;
        
        messagesContainer.appendChild(messageElement);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        
        if (!isTemporary) {
            this.chatHistory.push({ sender, content, timestamp: Date.now() });
        }
        
        return messageId;
    }

    removeChatMessage(messageId) {
        const element = document.getElementById(messageId);
        if (element) {
            element.remove();
        }
    }

    async handleEmailAction(button) {
        const action = button.dataset.action;
        const emailId = button.dataset.emailId;
        
        try {
            const result = await this.sendMessageToBackground({
                action: 'emailAction',
                emailAction: action,
                emailId: emailId
            });

            if (result.success) {
                this.showNotification(`Email ${action}d successfully`, 'success');
                
                // Update UI based on action
                if (action === 'archive') {
                    const emailItem = document.querySelector(`[data-email-id="${emailId}"]`);
                    if (emailItem) {
                        emailItem.style.opacity = '0.5';
                        emailItem.style.pointerEvents = 'none';
                    }
                }
            }
        } catch (error) {
            console.error('Email action error:', error);
            this.showNotification('Action failed. Please try again.', 'error');
        }
    }

    toggleSetting(toggle) {
        toggle.classList.toggle('active');
        const settingId = toggle.id;
        const isActive = toggle.classList.contains('active');
        
        this.saveSetting(settingId, isActive);
    }

    saveSetting(key, value) {
        chrome.storage.sync.set({ [key]: value }, () => {
            console.log(`Setting ${key} saved:`, value);
        });
    }

    loadSettings() {
        const settingKeys = [
            'user-role', 'summary-time', 'include-newsletters', 
            'focus-actions', 'desktop-notifications', 'priority-alerts'
        ];

        chrome.storage.sync.get(settingKeys, (result) => {
            settingKeys.forEach(key => {
                const element = document.getElementById(key);
                if (!element) return;

                if (element.classList.contains('toggle-switch')) {
                    if (result[key] !== undefined) {
                        element.classList.toggle('active', result[key]);
                    }
                } else if (element.tagName === 'SELECT') {
                    if (result[key]) {
                        element.value = result[key];
                    }
                }
            });
        });
    }

    loadChatHistory() {
        chrome.storage.local.get(['chatHistory'], (result) => {
            this.chatHistory = result.chatHistory || [];
            
            // Render recent chat messages (last 10)
            const recentMessages = this.chatHistory.slice(-10);
            const messagesContainer = document.getElementById('chat-messages');
            
            // Clear default message if there are saved messages
            if (recentMessages.length > 0) {
                messagesContainer.innerHTML = '';
                recentMessages.forEach(msg => {
                    this.addChatMessage(msg.sender, msg.content);
                });
            }
        });
    }

    saveChatHistory() {
        chrome.storage.local.set({ 
            chatHistory: this.chatHistory.slice(-50) // Keep only last 50 messages
        });
    }

    async sendMessageToBackground(message) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(message, (response) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve(response);
                }
            });
        });
    }

    showNotification(message, type = 'info') {
        // Create a simple toast notification
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 16px;
            border-radius: 4px;
            color: white;
            font-size: 12px;
            z-index: 10000;
            opacity: 0;
            transition: opacity 0.3s ease;
        `;
        
        switch (type) {
            case 'success':
                toast.style.background = '#28a745';
                break;
            case 'error':
                toast.style.background = '#dc3545';
                break;
            case 'warning':
                toast.style.background = '#ffc107';
                toast.style.color = '#333';
                break;
            default:
                toast.style.background = '#6c757d';
        }
        
        toast.textContent = message;
        document.body.appendChild(toast);
        
        // Animate in
        setTimeout(() => toast.style.opacity = '1', 100);
        
        // Remove after 3 seconds
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => document.body.removeChild(toast), 300);
        }, 3000);
    }

    showEmptyState(section, title, description) {
        const container = section === 'summary' ? 
            document.getElementById('email-list') : 
            document.getElementById('chat-messages');
            
        container.innerHTML = this.getEmptyStateHTML(title, description);
    }

    getEmptyStateHTML(title, description) {
        return `
            <div class="empty-state">
                <i class="fas fa-inbox"></i>
                <h3>${title}</h3>
                <p>${description}</p>
            </div>
        `;
    }

    // Utility functions
    getPriorityClass(priority) {
        switch (priority) {
            case 'high': return 'priority-high';
            case 'medium': return 'priority-medium';
            case 'low': return 'priority-low';
            default: return 'priority-low';
        }
    }

    formatTimeAgo(timestamp) {
        const now = Date.now();
        const diff = now - timestamp;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes} min ago`;
        if (hours < 24) return `${hours}h ago`;
        return `${days}d ago`;
    }

    formatLastUpdated(timestamp) {
        if (!timestamp) return 'Never';
        return this.formatTimeAgo(timestamp);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new EmailMindPopup();
});