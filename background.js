// Background Service Worker for EmailMind Chrome Extension

class EmailMindBackground {
    constructor() {
        this.authToken = null;
        this.userProfile = null;
        this.lastSummaryTime = null;
        this.apiBaseUrl = 'http://localhost:3000/api'; // Your backend URL
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupAlarms();
        this.loadStoredData();
    }

    setupEventListeners() {
        // Handle messages from popup
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            this.handleMessage(request, sender, sendResponse);
            return true; // Will respond asynchronously
        });

        // Handle extension install/startup
        chrome.runtime.onStartup.addListener(() => {
            this.onStartup();
        });

        chrome.runtime.onInstalled.addListener((details) => {
            this.onInstalled(details);
        });

        // Handle alarms for daily summaries
        chrome.alarms.onAlarm.addListener((alarm) => {
            this.handleAlarm(alarm);
        });

        // Handle auth token changes
        chrome.identity.onSignInChanged.addListener((account, signedIn) => {
            if (!signedIn) {
                this.handleSignOut();
            }
        });
    }

    async setupAlarms() {
        // Setup daily summary alarm
        const settings = await this.getStorageData(['summary-time']);
        const summaryTime = settings['summary-time'] || '08:00';
        
        chrome.alarms.create('dailySummary', {
            when: this.getNextAlarmTime(summaryTime),
            periodInMinutes: 24 * 60 // Daily
        });
    }

    async handleMessage(request, sender, sendResponse) {
        try {
            let response;

            switch (request.action) {
                case 'checkAuth':
                    response = await this.checkAuthStatus();
                    break;
                
                case 'authenticate':
                    response = await this.authenticate();
                    break;
                
                case 'disconnect':
                    response = await this.disconnect();
                    break;
                
                case 'getEmailSummary':
                    response = await this.getEmailSummary();
                    break;
                
                case 'chatQuery':
                    response = await this.handleChatQuery(request.message, request.context);
                    break;
                
                case 'emailAction':
                    response = await this.handleEmailAction(request.emailAction, request.emailId);
                    break;
                
                default:
                    response = { success: false, error: 'Unknown action' };
            }

            sendResponse(response);
        } catch (error) {
            console.error('Background message handler error:', error);
            sendResponse({ success: false, error: error.message });
        }
    }

    async checkAuthStatus() {
        try {
            if (this.authToken) {
                // Verify token is still valid
                const isValid = await this.verifyToken();
                if (isValid) {
                    return {
                        authenticated: true,
                        user: this.userProfile
                    };
                }
            }

            // Try to get cached token
            const token = await this.getCachedToken();
            if (token) {
                this.authToken = token;
                const profile = await this.getUserProfile();
                if (profile) {
                    this.userProfile = profile;
                    return {
                        authenticated: true,
                        user: profile
                    };
                }
            }

            return { authenticated: false };
        } catch (error) {
            console.error('Auth status check error:', error);
            return { authenticated: false };
        }
    }

    async authenticate() {
        try {
            // Use Chrome Identity API for OAuth
            const token = await new Promise((resolve, reject) => {
                chrome.identity.getAuthToken(
                    { 
                        interactive: true,
                        scopes: [
                            'https://www.googleapis.com/auth/gmail.readonly',
                            'https://www.googleapis.com/auth/userinfo.email',
                            'https://www.googleapis.com/auth/userinfo.profile'
                        ]
                    },
                    (token) => {
                        if (chrome.runtime.lastError) {
                            reject(chrome.runtime.lastError);
                        } else {
                            resolve(token);
                        }
                    }
                );
            });

            this.authToken = token;
            
            // Get user profile
            const profile = await this.getUserProfile();
            this.userProfile = profile;

            // Store auth data
            await this.storeAuthData(token, profile);

            // Schedule initial summary
            this.scheduleNextSummary();

            return {
                success: true,
                user: profile
            };
        } catch (error) {
            console.error('Authentication error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async disconnect() {
        try {
            // Revoke Chrome Identity token
            if (this.authToken) {
                await new Promise((resolve) => {
                    chrome.identity.removeCachedAuthToken(
                        { token: this.authToken },
                        () => resolve()
                    );
                });
            }

            // Clear stored data
            await this.clearAuthData();
            
            this.authToken = null;
            this.userProfile = null;

            // Clear alarms
            chrome.alarms.clear('dailySummary');

            return { success: true };
        } catch (error) {
            console.error('Disconnect error:', error);
            return { success: false, error: error.message };
        }
    }

    async getEmailSummary() {
        try {
            if (!this.authToken) {
                throw new Error('Not authenticated');
            }

            // Get emails from Gmail API
            const emails = await this.fetchEmails();
            
            // Get user persona settings
            const persona = await this.getPersonaSettings();
            
            // Process and summarize emails
            const processedEmails = await this.processEmails(emails, persona);
            
            // Generate statistics
            const stats = this.generateStats(processedEmails);
            
            // Store summary data
            await this.storeSummaryData(processedEmails, stats);

            return {
                success: true,
                emails: processedEmails,
                stats: {
                    ...stats,
                    lastUpdated: Date.now()
                }
            };
        } catch (error) {
            console.error('Email summary error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async fetchEmails() {
        const response = await fetch(
            `https://www.googleapis.com/gmail/v1/users/me/messages?q=in:inbox&maxResults=50`,
            {
                headers: {
                    'Authorization': `Bearer ${this.authToken}`
                }
            }
        );

        if (!response.ok) {
            throw new Error(`Gmail API error: ${response.status}`);
        }

        const data = await response.json();
        const messages = data.messages || [];

        // Get full message details
        const emailPromises = messages.slice(0, 20).map(async (msg) => {
            const msgResponse = await fetch(
                `https://www.googleapis.com/gmail/v1/users/me/messages/${msg.id}`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.authToken}`
                    }
                }
            );
            
            if (msgResponse.ok) {
                return await msgResponse.json();
            }
            return null;
        });

        const fullMessages = await Promise.all(emailPromises);
        return fullMessages.filter(msg => msg !== null);
    }

    async processEmails(messages, persona) {
        const processedEmails = [];

        for (const message of messages) {
            try {
                const emailData = this.parseGmailMessage(message);
                
                // Apply persona-based filtering
                if (this.shouldIncludeEmail(emailData, persona)) {
                    // Generate AI summary
                    const summary = await this.generateEmailSummary(emailData, persona);
                    
                    processedEmails.push({
                        id: message.id,
                        threadId: message.threadId,
                        sender: emailData.sender,
                        subject: emailData.subject,
                        snippet: emailData.snippet,
                        summary: summary.text,
                        priority: summary.priority,
                        hasActionItems: summary.hasActionItems,
                        actionItems: summary.actionItems,
                        timestamp: parseInt(message.internalDate),
                        labels: message.labelIds || []
                    });
                }
            } catch (error) {
                console.error('Error processing email:', error);
            }
        }

        return processedEmails.sort((a, b) => b.timestamp - a.timestamp);
    }

    parseGmailMessage(message) {
        const headers = message.payload?.headers || [];
        const getHeader = (name) => {
            const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
            return header?.value || '';
        };

        let body = '';
        if (message.payload?.body?.data) {
            body = atob(message.payload.body.data.replace(/-/g, '+').replace(/_/g, '/'));
        } else if (message.payload?.parts) {
            // Handle multipart messages
            const textPart = message.payload.parts.find(part => 
                part.mimeType === 'text/plain' || part.mimeType === 'text/html'
            );
            if (textPart?.body?.data) {
                body = atob(textPart.body.data.replace(/-/g, '+').replace(/_/g, '/'));
            }
        }

        return {
            sender: getHeader('From'),
            subject: getHeader('Subject'),
            snippet: message.snippet || '',
            body: body.substring(0, 2000), // Limit body length
            date: getHeader('Date')
        };
    }

    shouldIncludeEmail(emailData, persona) {
        // Apply persona-based filtering logic
        const settings = persona.settings || {};
        
        // Skip newsletters if disabled
        if (!settings.includeNewsletters && this.isNewsletter(emailData)) {
            return false;
        }

        // Always include high-priority senders
        if (persona.importantContacts?.some(contact => 
            emailData.sender.toLowerCase().includes(contact.toLowerCase())
        )) {
            return true;
        }

        // Skip known promotional emails
        if (this.isPromotional(emailData)) {
            return false;
        }

        return true;
    }

    isNewsletter(emailData) {
        const newsletterKeywords = ['newsletter', 'unsubscribe', 'marketing', 'promotional'];
        const text = (emailData.subject + ' ' + emailData.snippet).toLowerCase();
        return newsletterKeywords.some(keyword => text.includes(keyword));
    }

    isPromotional(emailData) {
        const promoKeywords = ['sale', 'discount', 'offer', 'deal', 'promotion'];
        const text = (emailData.subject + ' ' + emailData.snippet).toLowerCase();
        return promoKeywords.some(keyword => text.includes(keyword));
    }

    async generateEmailSummary(emailData, persona) {
        try {
            // Call your backend AI service
            const response = await fetch(`${this.apiBaseUrl}/summarize`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.authToken}`
                },
                body: JSON.stringify({
                    email: emailData,
                    persona: persona
                })
            });

            if (response.ok) {
                return await response.json();
            }

            // Fallback to simple summary
            return this.generateFallbackSummary(emailData);
        } catch (error) {
            console.error('AI summary error:', error);
            return this.generateFallbackSummary(emailData);
        }
    }

    generateFallbackSummary(emailData) {
        const hasActionItems = this.detectActionItems(emailData);
        
        return {
            text: emailData.snippet || 'No preview available',
            priority: this.determinePriority(emailData),
            hasActionItems: hasActionItems.length > 0,
            actionItems: hasActionItems
        };
    }

    detectActionItems(emailData) {
        const actionKeywords = [
            'please review', 'action required', 'urgent', 'deadline',
            'need your', 'waiting for', 'please confirm', 'asap'
        ];
        
        const text = (emailData.subject + ' ' + emailData.body).toLowerCase();
        return actionKeywords.filter(keyword => text.includes(keyword));
    }

    determinePriority(emailData) {
        const text = (emailData.subject + ' ' + emailData.body).toLowerCase();
        
        if (text.includes('urgent') || text.includes('asap') || text.includes('immediate')) {
            return 'high';
        }
        
        if (text.includes('important') || text.includes('deadline') || text.includes('action required')) {
            return 'medium';
        }
        
        return 'low';
    }

    generateStats(emails) {
        return {
            total: emails.length,
            important: emails.filter(e => e.priority === 'high' || e.priority === 'medium').length,
            actionItems: emails.filter(e => e.hasActionItems).length,
            unread: emails.length // Simplified - in real implementation, check read status
        };
    }

    async handleChatQuery(message, context) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.authToken}`
                },
                body: JSON.stringify({
                    query: message,
                    context: context,
                    userProfile: this.userProfile
                })
            });

            if (response.ok) {
                const data = await response.json();
                return {
                    success: true,
                    answer: data.answer
                };
            }

            return {
                success: false,
                error: 'Failed to process query'
            };
        } catch (error) {
            console.error('Chat query error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async handleEmailAction(action, emailId) {
        try {
            if (action === 'open') {
                // Open Gmail in new tab
                chrome.tabs.create({
                    url: `https://mail.google.com/mail/u/0/#inbox/${emailId}`
                });
                return { success: true };
            }

            if (action === 'archive') {
                const response = await fetch(
                    `https://www.googleapis.com/gmail/v1/users/me/messages/${emailId}/modify`,
                    {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${this.authToken}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            removeLabelIds: ['INBOX']
                        })
                    }
                );

                return { success: response.ok };
            }

            return { success: false, error: 'Unknown action' };
        } catch (error) {
            console.error('Email action error:', error);
            return { success: false, error: error.message };
        }
    }

    async handleAlarm(alarm) {
        if (alarm.name === 'dailySummary') {
            try {
                await this.generateDailySummary();
                this.showNotification('Your daily email summary is ready!');
            } catch (error) {
                console.error('Daily summary error:', error);
            }
        }
    }

    async generateDailySummary() {
        const summary = await this.getEmailSummary();
        if (summary.success) {
            this.lastSummaryTime = Date.now();
            await this.setStorageData({ lastSummaryTime: this.lastSummaryTime });
        }
        return summary;
    }

    showNotification(message) {
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon48.png',
            title: 'EmailMind',
            message: message
        });
    }

    // Utility methods
    async getUserProfile() {
        try {
            const response = await fetch(
                'https://www.googleapis.com/oauth2/v1/userinfo',
                {
                    headers: {
                        'Authorization': `Bearer ${this.authToken}`
                    }
                }
            );

            if (response.ok) {
                return await response.json();
            }
            
            throw new Error('Failed to get user profile');
        } catch (error) {
            console.error('Get user profile error:', error);
            return null;
        }
    }

    async verifyToken() {
        try {
            const response = await fetch(
                `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${this.authToken}`
            );
            return response.ok;
        } catch (error) {
            return false;
        }
    }

    async getPersonaSettings() {
        const data = await this.getStorageData([
            'user-role', 'include-newsletters', 'focus-actions', 'importantContacts'
        ]);
        
        return {
            role: data['user-role'] || 'other',
            settings: {
                includeNewsletters: data['include-newsletters'] || false,
                focusActions: data['focus-actions'] || true
            },
            importantContacts: data['importantContacts'] || []
        };
    }

    async getCachedToken() {
        return new Promise((resolve) => {
            chrome.identity.getAuthToken({ interactive: false }, (token) => {
                resolve(chrome.runtime.lastError ? null : token);
            });
        });
    }

    async storeAuthData(token, profile) {
        await this.setStorageData({
            authToken: token,
            userProfile: profile,
            authTime: Date.now()
        });
    }

    async clearAuthData() {
        await chrome.storage.local.remove(['authToken', 'userProfile', 'authTime', 'lastSummaryTime']);
    }

    async storeSummaryData(emails, stats) {
        await this.setStorageData({
            lastSummary: {
                emails,
                stats,
                timestamp: Date.now()
            }
        });
    }

    async loadStoredData() {
        const data = await this.getStorageData(['authToken', 'userProfile', 'lastSummaryTime']);
        this.authToken = data.authToken;
        this.userProfile = data.userProfile;
        this.lastSummaryTime = data.lastSummaryTime;
    }

    scheduleNextSummary() {
        // Schedule next summary based on user preferences
        chrome.storage.sync.get(['summary-time'], (result) => {
            const summaryTime = result['summary-time'] || '08:00';
            const nextTime = this.getNextAlarmTime(summaryTime);
            
            chrome.alarms.create('dailySummary', {
                when: nextTime,
                periodInMinutes: 24 * 60
            });
        });
    }

    getNextAlarmTime(timeString) {
        const [hours, minutes] = timeString.split(':').map(Number);
        const now = new Date();
        const scheduledTime = new Date();
        
        scheduledTime.setHours(hours, minutes, 0, 0);
        
        // If the time has passed today, schedule for tomorrow
        if (scheduledTime <= now) {
            scheduledTime.setDate(scheduledTime.getDate() + 1);
        }
        
        return scheduledTime.getTime();
    }

    async onStartup() {
        await this.loadStoredData();
        this.setupAlarms();
    }

    async onInstalled(details) {
        if (details.reason === 'install') {
            // Show welcome notification
            this.showNotification('Welcome to EmailMind! Click the extension icon to get started.');
            
            // Open options page or welcome tab
            chrome.tabs.create({
                url: chrome.runtime.getURL('popup.html')
            });
        }
    }

    handleSignOut() {
        this.authToken = null;
        this.userProfile = null;
        this.clearAuthData();
    }

    // Storage utilities
    async getStorageData(keys) {
        return new Promise((resolve) => {
            chrome.storage.local.get(keys, resolve);
        });
    }

    async setStorageData(data) {
        return new Promise((resolve) => {
            chrome.storage.local.set(data, resolve);
        });
    }
}

// Initialize background service
const emailMindBackground = new EmailMindBackground();