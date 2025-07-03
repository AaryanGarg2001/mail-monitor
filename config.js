// config.js - Extension Configuration
const CONFIG = {
    // Backend API Configuration
    API_BASE_URL: 'http://localhost:3000/api',
    
    // OAuth Configuration
    OAUTH_SCOPES: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile'
    ],
    
    // Google API Endpoints
    GMAIL_API_BASE: 'https://www.googleapis.com/gmail/v1',
    GOOGLE_API_BASE: 'https://www.googleapis.com/oauth2/v1',
    
    // Extension Settings
    DEFAULT_SUMMARY_TIME: '08:00',
    MAX_EMAILS_PER_SUMMARY: 20,
    CHAT_HISTORY_LIMIT: 50,
    
    // Storage Keys
    STORAGE_KEYS: {
      AUTH_TOKEN: 'authToken',
      USER_PROFILE: 'userProfile',
      PERSONA_SETTINGS: 'personaSettings',
      CHAT_HISTORY: 'chatHistory',
      LAST_SUMMARY: 'lastSummary',
      EXTENSION_SETTINGS: 'extensionSettings'
    },
    
    // API Endpoints
    ENDPOINTS: {
      AUTH_CHECK: '/auth/check',
      SUMMARIZE: '/emails/summarize',
      CHAT: '/chat/query',
      EMAIL_ACTION: '/emails/action',
      USER_PROFILE: '/user/profile'
    },
    
    // Development Settings
    DEBUG: true,
    LOG_LEVEL: 'info'
  };
  
  // Export for different module systems
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
  } else if (typeof window !== 'undefined') {
    window.CONFIG = CONFIG;
  }