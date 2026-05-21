/**
 * Orbicorp API Client
 * Frontend'den backend'e bağlantı için kullanılır
 */

class OrbicorpAPI {
  constructor(baseUrl = 'http://localhost:3001/api/v1') {
    this.baseUrl = baseUrl;
    this.accessToken = localStorage.getItem('orbicorp_access_token');
    this.refreshToken = localStorage.getItem('orbicorp_refresh_token');
    
    console.log('OrbicorpAPI initialized:', {
      hasAccessToken: !!this.accessToken,
      hasRefreshToken: !!this.refreshToken,
      accessTokenPreview: this.accessToken ? this.accessToken.substring(0, 20) + '...' : null
    });
  }

  // ==========================================
  // Token Management
  // ==========================================

  setTokens(accessToken, refreshToken) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    localStorage.setItem('orbicorp_access_token', accessToken);
    localStorage.setItem('orbicorp_refresh_token', refreshToken);
  }

  clearTokens() {
    this.accessToken = null;
    this.refreshToken = null;
    localStorage.removeItem('orbicorp_access_token');
    localStorage.removeItem('orbicorp_refresh_token');
    
    // Redirect to login if in iframe or main page
    const isInIframe = window.parent !== window;
    if (isInIframe) {
      window.parent.location.href = 'orbicorp-login.html';
    } else if (!window.location.pathname.includes('login')) {
      window.location.href = 'orbicorp-login.html';
    }
  }

  isAuthenticated() {
    return !!this.accessToken;
  }

  // ==========================================
  // Base Request Method
  // ==========================================

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    
    const headers = {
      ...options.headers,
    };

    // Only set Content-Type for requests with body
    if (options.body) {
      headers['Content-Type'] = 'application/json';
    }

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }
    
    console.log('API Request:', {
      url,
      method: options.method || 'GET',
      hasToken: !!this.accessToken
    });

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      // Token expired - try refresh
      if (response.status === 401 && this.refreshToken) {
        const refreshed = await this.refreshAccessToken();
        if (refreshed) {
          headers['Authorization'] = `Bearer ${this.accessToken}`;
          const retryResponse = await fetch(url, { ...options, headers });
          return this.handleResponse(retryResponse);
        }
      }

      return this.handleResponse(response);
    } catch (error) {
      console.error('API Request Error:', error);
      throw error;
    }
  }

  async handleResponse(response) {
    const data = await response.json();
    
    if (!response.ok) {
      const error = new Error(data.message || 'API Error');
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  }

  async refreshAccessToken() {
    try {
      const response = await fetch(`${this.baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: this.refreshToken }),
      });

      if (!response.ok) {
        this.clearTokens();
        return false;
      }

      const data = await response.json();
      this.setTokens(data.data.accessToken, data.data.refreshToken);
      return true;
    } catch {
      this.clearTokens();
      return false;
    }
  }

  // ==========================================
  // Auth Endpoints
  // ==========================================

  async login(email, password) {
    const data = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    
    if (data.success) {
      this.setTokens(data.data.accessToken, data.data.refreshToken);
    }
    
    return data;
  }

  async register(email, password, firstName, lastName, companyName) {
    const data = await this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, firstName, lastName, companyName }),
    });
    
    if (data.success) {
      this.setTokens(data.data.accessToken, data.data.refreshToken);
    }
    
    return data;
  }

  async logout() {
    try {
      await this.request('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken: this.refreshToken }),
      });
    } finally {
      this.clearTokens();
    }
  }

  async getMe() {
    return this.request('/auth/me');
  }

  // ==========================================
  // Agents Endpoints
  // ==========================================

  async getAgents(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/agents${query ? '?' + query : ''}`);
  }

  async getAgent(id) {
    return this.request(`/agents/${id}`);
  }

  async createAgent(data) {
    return this.request('/agents', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateAgent(id, data) {
    return this.request(`/agents/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteAgent(id) {
    return this.request(`/agents/${id}`, {
      method: 'DELETE',
    });
  }

  async pauseAgent(id) {
    return this.request(`/agents/${id}/pause`, {
      method: 'POST',
    });
  }

  async resumeAgent(id) {
    return this.request(`/agents/${id}/resume`, {
      method: 'POST',
    });
  }

  async getAgentStats(id) {
    return this.request(`/agents/${id}/stats`);
  }

  // ==========================================
  // Sessions Endpoints
  // ==========================================

  async getSessions(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/sessions${query ? '?' + query : ''}`);
  }

  async createSession(agentId, channel = 'webchat') {
    return this.request('/sessions', {
      method: 'POST',
      body: JSON.stringify({ agentId, channel }),
    });
  }

  async getSession(id) {
    return this.request(`/sessions/${id}`);
  }

  async endSession(id) {
    return this.request(`/sessions/${id}/end`, {
      method: 'POST',
    });
  }

  async deleteSession(id) {
    return this.request(`/sessions/${id}`, {
      method: 'DELETE',
    });
  }

  async getMessages(sessionId, params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/sessions/${sessionId}/messages${query ? '?' + query : ''}`);
  }

  // Alias for getMessages
  async getSessionMessages(sessionId, params = {}) {
    return this.getMessages(sessionId, params);
  }

  async sendMessage(sessionId, content) {
    return this.request(`/sessions/${sessionId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  }

  // ==========================================
  // Streaming Chat (SSE)
  // ==========================================

  async *chatStream(sessionId, message, attachments = []) {
    // Build URL with message and attachments
    let url = `${this.baseUrl}/sessions/${sessionId}/chat/stream?message=${encodeURIComponent(message)}`;
    if (attachments && attachments.length > 0) {
      url += `&attachments=${encodeURIComponent(JSON.stringify(attachments))}`;
    }
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Stream error: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let currentEvent = 'message';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEvent = line.slice(7).trim();
          continue;
        }
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            // Map backend events to frontend expected format
            if (currentEvent === 'chunk' && data.content) {
              yield { type: 'content', content: data.content };
            } else if (currentEvent === 'tool_calling') {
              yield { type: 'tool_calling', tool: data };
            } else if (currentEvent === 'tool_result') {
              yield { type: 'tool_result', tool: data };
            } else if (currentEvent === 'done') {
              yield { type: 'done', messageId: data.messageId, tokens: data.tokens, cost: data.cost };
            } else if (currentEvent === 'error') {
              yield { type: 'error', error: data.error };
            } else if (currentEvent === 'start') {
              yield { type: 'start', sessionId: data.sessionId };
            }
          } catch {
            // Skip malformed JSON
          }
        }
        if (line === '') { currentEvent = 'message'; }
      }
    }
  }

  // ==========================================
  // File Upload
  // ==========================================

  async uploadFile(file) {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetch(`${this.baseUrl}/uploads`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
      },
      body: formData,
    });
    
    return response.json();
  }

  // ==========================================
  // Users Endpoints
  // ==========================================

  async getUsers(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/users${query ? '?' + query : ''}`);
  }

  async getUser(id) {
    return this.request(`/users/${id}`);
  }

  async createUser(data) {
    return this.request('/users', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateUser(id, data) {
    return this.request(`/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteUser(id) {
    return this.request(`/users/${id}`, {
      method: 'DELETE',
    });
  }

  async changePassword(currentPassword, newPassword) {
    return this.request('/users/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  }

  async getUserStats() {
    return this.request('/users/stats');
  }

  // ==========================================
  // Company Endpoints
  // ==========================================

  async getCompany() {
    return this.request('/company');
  }

  async updateCompany(data) {
    return this.request('/company', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async updateBranding(data) {
    return this.request('/company/branding', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async getCompanyStats() {
    return this.request('/company/stats');
  }

  async getLLMConfig() {
    return this.request('/company/llm-config');
  }

  async updateLLMConfig(provider, apiKey) {
    return this.request('/company/llm-config', {
      method: 'PUT',
      body: JSON.stringify({ provider, apiKey }),
    });
  }

  async removeLLMConfig(provider) {
    return this.request(`/company/llm-config/${provider}`, {
      method: 'DELETE',
    });
  }

  // ==========================================
  // Agents - Main Agent
  // ==========================================

  async getMainAgent() {
    return this.request('/agents/main');
  }

  // ==========================================
  // LLM Endpoints
  // ==========================================

  async getLLMStatus() {
    return this.request('/llm/status');
  }

  async getLLMProviders() {
    return this.request('/llm/providers');
  }

  async testLLM(provider, model) {
    return this.request('/llm/test', {
      method: 'POST',
      body: JSON.stringify({ provider, model }),
    });
  }

  async benchmarkLLM(prompt) {
    return this.request('/llm/benchmark', {
      method: 'POST',
      body: JSON.stringify({ prompt }),
    });
  }

  // ==========================================
  // Workflows
  // ==========================================

  async getWorkflows(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/workflows${query ? '?' + query : ''}`);
  }

  async getWorkflow(id) {
    return this.request(`/workflows/${id}`);
  }

  async createWorkflow(data) {
    return this.request('/workflows', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateWorkflow(id, data) {
    return this.request(`/workflows/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteWorkflow(id) {
    return this.request(`/workflows/${id}`, {
      method: 'DELETE',
    });
  }

  async activateWorkflow(id) {
    return this.request(`/workflows/${id}/activate`, {
      method: 'POST',
    });
  }

  async pauseWorkflow(id) {
    return this.request(`/workflows/${id}/pause`, {
      method: 'POST',
    });
  }

  async runWorkflow(id, triggerData = {}) {
    return this.request(`/workflows/${id}/run`, {
      method: 'POST',
      body: JSON.stringify({ triggerData }),
    });
  }

  async getWorkflowStats() {
    return this.request('/workflows/stats');
  }

  // ==========================================
  // Tasks
  // ==========================================

  async getTasks(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/tasks${query ? '?' + query : ''}`);
  }

  async getTask(id) {
    return this.request(`/tasks/${id}`);
  }

  async createTask(data) {
    return this.request('/tasks', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateTask(id, data) {
    return this.request(`/tasks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteTask(id) {
    return this.request(`/tasks/${id}`, {
      method: 'DELETE',
    });
  }

  async startTask(id) {
    return this.request(`/tasks/${id}/start`, {
      method: 'POST',
    });
  }

  async cancelTask(id) {
    return this.request(`/tasks/${id}/cancel`, {
      method: 'POST',
    });
  }

  async approveTaskStep(id, stepId, approved) {
    return this.request(`/tasks/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ stepId, approved }),
    });
  }

  async addTaskLog(id, level, message) {
    return this.request(`/tasks/${id}/log`, {
      method: 'POST',
      body: JSON.stringify({ level, message }),
    });
  }

  async updateTaskStep(id, stepId, status, output = null) {
    return this.request(`/tasks/${id}/step`, {
      method: 'PUT',
      body: JSON.stringify({ stepId, status, output }),
    });
  }

  async getTaskStats() {
    return this.request('/tasks/stats');
  }

  // ==========================================
  // Communication Channels
  // ==========================================

  async getChannels() {
    return this.request('/channels');
  }

  async getChannelsDropdown() {
    return this.request('/channels/dropdown');
  }

  async getChannel(id) {
    return this.request(`/channels/${id}`);
  }

  async createChannel(data) {
    return this.request('/channels', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateChannel(id, data) {
    return this.request(`/channels/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteChannel(id) {
    return this.request(`/channels/${id}`, {
      method: 'DELETE',
    });
  }

  async testChannel(id) {
    return this.request(`/channels/${id}/test`, {
      method: 'POST',
    });
  }

  // ==========================================
  // Notifications
  // ==========================================

  async getNotifications(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/notifications${query ? '?' + query : ''}`);
  }

  async getPendingApprovals() {
    return this.request('/notifications/pending');
  }

  async getNotificationCount() {
    return this.request('/notifications/count');
  }

  async getNotification(id) {
    return this.request(`/notifications/${id}`);
  }

  async markNotificationRead(id) {
    return this.request(`/notifications/${id}/read`, {
      method: 'POST',
    });
  }

  async markAllNotificationsRead() {
    return this.request('/notifications/read-all', {
      method: 'POST',
    });
  }

  async respondToNotification(id, response, comment = null) {
    return this.request(`/notifications/${id}/respond`, {
      method: 'POST',
      body: JSON.stringify({ response, comment }),
    });
  }

  // ==========================================
  // Dashboard
  // ==========================================

  async getDashboardStats() {
    return this.request('/dashboard/stats');
  }

  async getDashboardActivity() {
    return this.request('/dashboard/activity');
  }

  async getTopAgents(limit = 5) {
    return this.request(`/dashboard/top-agents?limit=${limit}`);
  }

  async getModelUsage() {
    return this.request('/dashboard/model-usage');
  }
}

// Global instance
window.orbicorpAPI = new OrbicorpAPI();

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = OrbicorpAPI;
}
