// Content Script for Gmail Integration
// This script runs on Gmail pages to provide enhanced functionality

class GmailContentScript {
    constructor() {
        this.isGmailLoaded = false;
        this.emailMindPanel = null;
        this.summarizeButtons = [];
        
        this.init();
    }

    init() {
        // Wait for Gmail to load
        this.waitForGmail(() => {
            this.isGmailLoaded = true;
            this.enhanceGmailUI();
            this.observeGmailChanges();
        });
    }

    waitForGmail(callback) {
        // Gmail uses dynamic loading, so we need to wait for it to be ready
        const checkGmail = () => {
            if (document.querySelector('[role="main"]') && 
                document.querySelector('[data-thread-id]') || 
                document.querySelector('.nH')) {
                callback();
            } else {
                setTimeout(checkGmail, 500);
            }
        };
        
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', checkGmail);
        } else {
            checkGmail();
        }
    }

    enhanceGmailUI() {
        this.addEmailMindPanel();
        this.addSummarizeButtons();
        this.addQuickActions();
    }

    addEmailMindPanel() {
        // Create a collapsible sidebar panel
        const sidebar = this.createSidebarPanel();
        
        // Find Gmail's sidebar or create our own container
        const gmailSidebar = document.querySelector('.bkL') || 
                            document.querySelector('.aeF');
        
        if (gmailSidebar) {
            gmailSidebar.appendChild(sidebar);
        } else {
            // Fallback: add to main container
            const mainContainer = document.querySelector('[role="main"]');
            if (mainContainer) {
                mainContainer.appendChild(sidebar);
            }
        }
    }

    createSidebarPanel() {
        const panel = document.createElement('div');
        panel.id = 'emailmind-panel';
        panel.className = 'emailmind-sidebar-panel';
        
        panel.innerHTML = `
            <div class="emailmind-panel-header">
                <div class="emailmind-panel-title">
                    <i class="emailmind-icon">🧠</i>
                    <span>EmailMind</span>
                </div>
                <button class="emailmind-panel-toggle" id="emailmind-toggle">
                    <i class="emailmind-chevron">▼</i>
                </button>
            </div>
            <div class="emailmind-panel-content" id="emailmind-panel-content">
                <div class="emailmind-section">
                    <h4>Today's Summary</h4>
                    <div class="emailmind-summary-stats">
                        <div class="emailmind-stat">
                            <span class="emailmind-stat-number" id="em-total">0</span>
                            <span class="emailmind-stat-label">Total</span>
                        </div>
                        <div class="emailmind-stat">
                            <span class="emailmind-stat-number" id="em-important">0</span>
                            <span class="emailmind-stat-label">Important</span>
                        </div>
                        <div class="emailmind-stat">
                            <span class="emailmind-stat-number" id="em-actions">0</span>
                            <span class="emailmind-stat-label">Actions</span>
                        </div>
                    </div>
                </div>
                
                <div class="emailmind-section">
                    <h4>Quick Actions</h4>
                    <div class="emailmind-actions">
                        <button class="emailmind-action-btn" id="em-refresh">
                            <i>🔄</i> Refresh Summary
                        </button>
                        <button class="emailmind-action-btn" id="em-focus-mode">
                            <i>🎯</i> Focus Mode
                        </button>
                    </div>
                </div>
                
                <div class="emailmind-section">
                    <h4>Ask EmailMind</h4>
                    <div class="emailmind-chat-mini">
                        <input type="text" id="em-quick-query" placeholder="Ask about your emails...">
                        <button id="em-quick-send">Ask</button>
                    </div>
                </div>
            </div>
        `;
        
        this.setupPanelEvents(panel);
        return panel;
    }

    setupPanelEvents(panel) {
        // Toggle panel
        const toggle = panel.querySelector('#emailmind-toggle');
        const content = panel.querySelector('#emailmind-panel-content');
        const chevron = panel.querySelector('.emailmind-chevron');
        
        toggle.addEventListener('click', () => {
            const isCollapsed = content.style.display === 'none';
            content.style.display = isCollapsed ? 'block' : 'none';
            chevron.textContent = isCollapsed ? '▼' : '▶';
        });

        // Refresh summary
        panel.querySelector('#em-refresh').addEventListener('click', () => {
            this.refreshSummary();
        });

        // Focus mode
        panel.querySelector('#em-focus-mode').addEventListener('click', () => {
            this.toggleFocusMode();
        });

        // Quick query
        const queryInput = panel.querySelector('#em-quick-query');
        const sendBtn = panel.querySelector('#em-quick-send');
        
        const handleQuery = () => {
            const query = queryInput.value.trim();
            if (query) {
                this.handleQuickQuery(query);
                queryInput.value = '';
            }
        };
        
        sendBtn.addEventListener('click', handleQuery);
        queryInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleQuery();
            }
        });

        // Load initial data
        this.loadPanelData();
    }

    addSummarizeButtons() {
        // Add summarize buttons to email threads
        const observer = new MutationObserver(() => {
            this.addButtonsToVisibleEmails();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Initial button addition
        setTimeout(() => this.addButtonsToVisibleEmails(), 1000);
    }

    addButtonsToVisibleEmails() {
        // Find email conversation threads
        const conversations = document.querySelectorAll('[data-thread-id]');
        
        conversations.forEach(conversation => {
            if (!conversation.querySelector('.emailmind-summarize-btn')) {
                this.addSummarizeButtonToConversation(conversation);
            }
        });

        // Also add to individual emails in list view
        const emails = document.querySelectorAll('tr[jsaction*="click"]');
        emails.forEach(email => {
            if (!email.querySelector('.emailmind-quick-summary')) {
                this.addQuickSummaryToEmail(email);
            }
        });
    }

    addSummarizeButtonToConversation(conversation) {
        const toolbar = conversation.querySelector('.hG') || 
                       conversation.querySelector('.ar9');
        
        if (toolbar) {
            const button = document.createElement('button');
            button.className = 'emailmind-summarize-btn';
            button.innerHTML = `
                <i>🧠</i>
                <span>Summarize Thread</span>
            `;
            button.title = 'Summarize this email thread with EmailMind';
            
            button.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.summarizeThread(conversation);
            });
            
            toolbar.appendChild(button);
            this.summarizeButtons.push(button);
        }
    }

    addQuickSummaryToEmail(emailRow) {
        const subjectCell = emailRow.querySelector('.bog') || 
                           emailRow.querySelector('[data-tooltip]');
        
        if (subjectCell) {
            const summarySpan = document.createElement('span');
            summarySpan.className = 'emailmind-quick-summary';
            summarySpan.innerHTML = ' <i title="Get AI summary">🧠</i>';
            
            summarySpan.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.showQuickSummary(emailRow);
            });
            
            subjectCell.appendChild(summarySpan);
        }
    }

    addQuickActions() {
        // Add keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Ctrl/Cmd + Shift + S for quick summarize
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'S') {
                e.preventDefault();
                this.summarizeCurrentView();
            }
            
            // Ctrl/Cmd + Shift + M for EmailMind panel
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'M') {
                e.preventDefault();
                this.togglePanel();
            }
        });
    }

    async summarizeThread(conversation) {
        const threadId = conversation.getAttribute('data-thread-id');
        if (!threadId) return;

        const button = conversation.querySelector('.emailmind-summarize-btn');
        const originalText = button.innerHTML;
        
        button.innerHTML = '<i>⏳</i> <span>Summarizing...</span>';
        button.disabled = true;

        try {
            const response = await this.sendMessageToBackground({
                action: 'summarizeThread',
                threadId: threadId
            });

            if (response.success) {
                this.showSummaryModal(response.summary, 'Thread Summary');
            } else {
                this.showError('Failed to summarize thread');
            }
        } catch (error) {
            console.error('Summarize thread error:', error);
            this.showError('Error summarizing thread');
        } finally {
            button.innerHTML = originalText;
            button.disabled = false;
        }
    }

    async showQuickSummary(emailRow) {
        const messageId = this.extractMessageId(emailRow);
        if (!messageId) return;

        try {
            const response = await this.sendMessageToBackground({
                action: 'summarizeEmail',
                messageId: messageId
            });

            if (response.success) {
                this.showSummaryTooltip(emailRow, response.summary);
            }
        } catch (error) {
            console.error('Quick summary error:', error);
        }
    }

    showSummaryModal(summary, title) {
        // Create modal overlay
        const modal = document.createElement('div');
        modal.className = 'emailmind-modal-overlay';
        modal.innerHTML = `
            <div class="emailmind-modal">
                <div class="emailmind-modal-header">
                    <h3>${title}</h3>
                    <button class="emailmind-modal-close">&times;</button>
                </div>
                <div class="emailmind-modal-content">
                    <div class="emailmind-summary-text">${summary}</div>
                </div>
                <div class="emailmind-modal-footer">
                    <button class="emailmind-btn-secondary" id="em-copy-summary">Copy</button>
                    <button class="emailmind-btn-primary" id="em-close-modal">Close</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Event listeners
        modal.querySelector('.emailmind-modal-close').addEventListener('click', () => {
            modal.remove();
        });
        
        modal.querySelector('#em-close-modal').addEventListener('click', () => {
            modal.remove();
        });
        
        modal.querySelector('#em-copy-summary').addEventListener('click', () => {
            navigator.clipboard.writeText(summary);
            this.showToast('Summary copied to clipboard');
        });
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    showSummaryTooltip(element, summary) {
        const tooltip = document.createElement('div');
        tooltip.className = 'emailmind-tooltip';
        tooltip.innerHTML = `
            <div class="emailmind-tooltip-content">
                ${summary}
            </div>
        `;
        
        document.body.appendChild(tooltip);
        
        // Position tooltip
        const rect = element.getBoundingClientRect();
        tooltip.style.top = (rect.bottom + 10) + 'px';
        tooltip.style.left = rect.left + 'px';
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            tooltip.remove();
        }, 5000);
    }

    async refreshSummary() {
        const refreshBtn = document.querySelector('#em-refresh');
        const originalText = refreshBtn.innerHTML;
        
        refreshBtn.innerHTML = '<i>⏳</i> Refreshing...';
        refreshBtn.disabled = true;

        try {
            const response = await this.sendMessageToBackground({
                action: 'getEmailSummary'
            });

            if (response.success) {
                this.updatePanelStats(response.stats);
                this.showToast('Summary refreshed');
            }
        } catch (error) {
            console.error('Refresh error:', error);
            this.showError('Failed to refresh summary');
        } finally {
            refreshBtn.innerHTML = originalText;
            refreshBtn.disabled = false;
        }
    }

    toggleFocusMode() {
        const focusBtn = document.querySelector('#em-focus-mode');
        const isActive = focusBtn.classList.contains('active');
        
        if (isActive) {
            this.disableFocusMode();
            focusBtn.classList.remove('active');
            focusBtn.innerHTML = '<i>🎯</i> Focus Mode';
        } else {
            this.enableFocusMode();
            focusBtn.classList.add('active');
            focusBtn.innerHTML = '<i>✨</i> Exit Focus';
        }
    }

    enableFocusMode() {
        // Hide low-priority emails and promotional content
        document.body.classList.add('emailmind-focus-mode');
        this.showToast('Focus mode enabled - showing only important emails');
    }

    disableFocusMode() {
        document.body.classList.remove('emailmind-focus-mode');
        this.showToast('Focus mode disabled');
    }

    async handleQuickQuery(query) {
        const queryInput = document.querySelector('#em-quick-query');
        queryInput.placeholder = 'Processing...';
        queryInput.disabled = true;

        try {
            const response = await this.sendMessageToBackground({
                action: 'chatQuery',
                message: query
            });

            if (response.success) {
                this.showSummaryModal(response.answer, 'EmailMind Answer');
            } else {
                this.showError('Failed to process query');
            }
        } catch (error) {
            console.error('Query error:', error);
            this.showError('Error processing query');
        } finally {
            queryInput.placeholder = 'Ask about your emails...';
            queryInput.disabled = false;
        }
    }

    async loadPanelData() {
        try {
            const response = await this.sendMessageToBackground({
                action: 'getEmailSummary'
            });

            if (response.success) {
                this.updatePanelStats(response.stats);
            }
        } catch (error) {
            console.error('Load panel data error:', error);
        }
    }

    updatePanelStats(stats) {
        document.getElementById('em-total').textContent = stats.total || 0;
        document.getElementById('em-important').textContent = stats.important || 0;
        document.getElementById('em-actions').textContent = stats.actionItems || 0;
    }

    observeGmailChanges() {
        // Observe Gmail DOM changes to maintain our enhancements
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    // Re-add buttons if Gmail navigation occurred
                    setTimeout(() => this.addButtonsToVisibleEmails(), 100);
                }
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    // Utility functions
    extractMessageId(element) {
        // Try to extract message ID from various Gmail elements
        const threadId = element.getAttribute('data-thread-id');
        const messageId = element.getAttribute('data-message-id');
        return messageId || threadId;
    }

    togglePanel() {
        const panel = document.getElementById('emailmind-panel');
        if (panel) {
            panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        }
    }

    summarizeCurrentView() {
        // Summarize currently visible emails
        const visibleEmails = document.querySelectorAll('[data-thread-id]:not([style*="display: none"])');
        if (visibleEmails.length > 0) {
            this.summarizeThread(visibleEmails[0]);
        }
    }

    showToast(message) {
        const toast = document.createElement('div');
        toast.className = 'emailmind-toast';
        toast.textContent = message;
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.classList.add('show');
        }, 100);
        
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    showError(message) {
        const toast = document.createElement('div');
        toast.className = 'emailmind-toast error';
        toast.textContent = message;
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.classList.add('show');
        }, 100);
        
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 4000);
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
}

// Initialize content script when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new GmailContentScript();
    });
} else {
    new GmailContentScript();
}