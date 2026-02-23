/**
 * Server Authentication Service
 * 
 * Manages authentication with the UtanoBridge Core server.
 * Provides Sanctum token acquisition, storage, and refresh.
 * 
 * This service bridges local PIN authentication with server-side
 * token-based authentication for API access.
 * 
 * @module services/serverAuth
 */

import { ref, computed } from 'vue';
import { useLocalStorage } from '@vueuse/core';

// ============================================
// Types
// ============================================

export interface ServerAuthConfig {
  baseUrl: string;
  tokenEndpoint: string;
  refreshEndpoint: string;
  userEndpoint: string;
}

export interface ServerToken {
  token: string;
  expiresAt: number;
  refreshToken?: string;
}

export interface ServerUser {
  id: number;
  email: string;
  name: string;
  role: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
  deviceName?: string;
}

export interface AuthResponse {
  token: string;
  user: ServerUser;
  expiresAt?: number;
}

// ============================================
// Configuration
// ============================================

const DEFAULT_CONFIG: ServerAuthConfig = {
  baseUrl: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000',
  tokenEndpoint: '/api/auth/login',
  refreshEndpoint: '/api/auth/refresh',
  userEndpoint: '/api/auth/user',
};

// ============================================
// State
// ============================================

const _serverToken = useLocalStorage<ServerToken | null>('healthbridge_server_token', null);
const _serverUser = useLocalStorage<ServerUser | null>('healthbridge_server_user', null);
const _isServerAuthenticated = computed(() => {
  if (!_serverToken.value) return false;
  if (_serverToken.value.expiresAt && Date.now() > _serverToken.value.expiresAt) {
    return false;
  }
  return true;
});

// ============================================
// Server Auth Service
// ============================================

/**
 * Server Authentication Service
 * 
 * Provides methods for authenticating with the UtanoBridge Core server
 * and managing Sanctum tokens.
 */
export class ServerAuthService {
  private config: ServerAuthConfig;

  constructor(config: Partial<ServerAuthConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get the current server token
   */
  getToken(): ServerToken | null {
    return _serverToken.value;
  }

  /**
   * Get the Bearer token string for Authorization header
   */
  getBearerToken(): string | null {
    if (!_serverToken.value) return null;
    if (_serverToken.value.expiresAt && Date.now() > _serverToken.value.expiresAt) {
      return null;
    }
    return `Bearer ${_serverToken.value.token}`;
  }

  /**
   * Get the current server user
   */
  getUser(): ServerUser | null {
    return _serverUser.value;
  }

  /**
   * Check if authenticated with server
   */
  isAuthenticated(): boolean {
    return _isServerAuthenticated.value;
  }

  /**
   * Login to the server
   * 
   * @param credentials Login credentials
   * @returns Authentication response
   */
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    const url = `${this.config.baseUrl}${this.config.tokenEndpoint}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        email: credentials.email,
        password: credentials.password,
        device_name: credentials.deviceName || 'nurse_mobile',
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Login failed' }));
      throw new Error(error.message || `Server returned ${response.status}`);
    }

    const data: AuthResponse = await response.json();
    
    // Store the token
    _serverToken.value = {
      token: data.token,
      expiresAt: data.expiresAt || Date.now() + (24 * 60 * 60 * 1000), // Default 24 hours
    };

    // Store the user
    _serverUser.value = data.user;

    console.log('[ServerAuth] Login successful', { userId: data.user.id, role: data.user.role });

    return data;
  }

  /**
   * Logout from the server
   */
  async logout(): Promise<void> {
    const token = this.getBearerToken();
    
    if (token) {
      try {
        const url = `${this.config.baseUrl}/api/auth/logout`;
        await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': token,
            'Accept': 'application/json',
          },
        });
      } catch (error) {
        console.warn('[ServerAuth] Logout request failed:', error);
      }
    }

    // Clear local state
    _serverToken.value = null;
    _serverUser.value = null;

    console.log('[ServerAuth] Logged out');
  }

  /**
   * Refresh the server token
   */
  async refreshToken(): Promise<ServerToken> {
    const currentToken = _serverToken.value;
    
    if (!currentToken) {
      throw new Error('No token to refresh');
    }

    const url = `${this.config.baseUrl}${this.config.refreshEndpoint}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${currentToken.token}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      // Token refresh failed - clear state
      _serverToken.value = null;
      _serverUser.value = null;
      throw new Error('Token refresh failed');
    }

    const data = await response.json();
    
    _serverToken.value = {
      token: data.token,
      expiresAt: data.expiresAt || Date.now() + (24 * 60 * 60 * 1000),
    };

    console.log('[ServerAuth] Token refreshed');

    return _serverToken.value;
  }

  /**
   * Fetch the current user from the server
   */
  async fetchUser(): Promise<ServerUser> {
    const token = this.getBearerToken();
    
    if (!token) {
      throw new Error('Not authenticated');
    }

    const url = `${this.config.baseUrl}${this.config.userEndpoint}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': token,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch user');
    }

    const user: ServerUser = await response.json();
    _serverUser.value = user;

    return user;
  }

  /**
   * Check if token needs refresh (within 5 minutes of expiry)
   */
  needsRefresh(): boolean {
    if (!_serverToken.value) return false;
    if (!_serverToken.value.expiresAt) return false;
    
    // Refresh if within 5 minutes of expiry
    const fiveMinutes = 5 * 60 * 1000;
    return Date.now() > (_serverToken.value.expiresAt - fiveMinutes);
  }

  /**
   * Validate token with server (makes a lightweight request)
   * Returns true if token is valid, false otherwise
   */
  async validateToken(): Promise<boolean> {
    if (!_serverToken.value) return false;
    
    try {
      const response = await this.authenticatedFetch(this.config.userEndpoint!);
      return response.ok;
    } catch (error) {
      console.warn('[ServerAuth] Token validation failed:', error);
      return false;
    }
  }

  /**
   * Ensure valid token (refresh if needed, validate with server)
   */
  async ensureValidToken(): Promise<string> {
    if (!this.isAuthenticated()) {
      throw new Error('Not authenticated with server');
    }

    if (this.needsRefresh()) {
      try {
        await this.refreshToken();
      } catch (refreshError) {
        // Refresh failed, clear token and throw
        _serverToken.value = null;
        _serverUser.value = null;
        throw new Error('Token refresh failed - please re-login');
      }
    }

    const token = this.getBearerToken();
    if (!token) {
      throw new Error('Failed to get valid token');
    }

    return token;
  }

  /**
   * Make an authenticated request to the server
   */
  async authenticatedFetch(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const token = await this.ensureValidToken();
    
    const url = endpoint.startsWith('http') 
      ? endpoint 
      : `${this.config.baseUrl}${endpoint}`;

    return fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': token,
        'Accept': 'application/json',
      },
    });
  }
}

// ============================================
// Singleton Instance
// ============================================

let _instance: ServerAuthService | null = null;

/**
 * Get the server auth service instance
 */
export function getServerAuthService(): ServerAuthService {
  if (!_instance) {
    _instance = new ServerAuthService();
  }
  return _instance;
}

/**
 * Composable for server authentication
 */
export function useServerAuth() {
  const service = getServerAuthService();

  return {
    // State
    token: computed(() => _serverToken.value),
    user: computed(() => _serverUser.value),
    isAuthenticated: computed(() => _isServerAuthenticated.value),

    // Actions
    login: (credentials: LoginCredentials) => service.login(credentials),
    logout: () => service.logout(),
    refreshToken: () => service.refreshToken(),
    fetchUser: () => service.fetchUser(),
    ensureValidToken: () => service.ensureValidToken(),
    validateToken: () => service.validateToken(),
    authenticatedFetch: (endpoint: string, options?: RequestInit) => 
      service.authenticatedFetch(endpoint, options),
    
    // Helpers
    getBearerToken: () => service.getBearerToken(),
    needsRefresh: () => service.needsRefresh(),
  };
}
