/**
 * Socket.IO Client Composable for AI Streaming
 * 
 * Phase 2.2: Enhanced with robust connection management, cancel tokens,
 * and progress tracking with time estimation
 */

import { io, Socket } from 'socket.io-client';
import { ref, computed, onUnmounted, readonly } from 'vue';

// ============================================
// Types & Interfaces
// ============================================

interface StreamingEvent {
  type: 'chunk' | 'progress' | 'complete' | 'error';
  requestId: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

interface StreamingCallbacks {
  onChunk: (chunk: string) => void;
  onProgress: (tokens: number, total: number) => void;
  onComplete: (fullResponse: string, duration: number) => void;
  onError: (error: string, recoverable: boolean) => void;
  onCancel?: () => void;
}

interface UseAIStreamOptions {
  autoConnect?: boolean;
  reconnectionAttempts?: number;
  reconnectionDelay?: number;
  enableProgressTracking?: boolean;
}

/**
 * Connection state machine states
 */
type ConnectionState = 'idle' | 'connecting' | 'connected' | 'disconnecting' | 'error';

/**
 * Progress tracking data
 */
interface ProgressTracker {
  tokensGenerated: number;
  estimatedTotal: number;
  startTime: number;
  tokensPerSecond: number;
  estimatedTimeRemaining: number;
}

/**
 * Cancel token for stream cancellation
 */
interface CancelToken {
  isCancelled: boolean;
  reason?: string;
  requestId: string;
}

// ============================================
// Composable Implementation
// ============================================

export function useAIStream(options: UseAIStreamOptions = {}) {
  const {
    autoConnect = true,
    reconnectionAttempts = 5,
    reconnectionDelay = 1000,
    enableProgressTracking = true
  } = options;

  // Connection state
  const socket = ref<Socket | null>(null);
  const connectionState = ref<ConnectionState>('idle');
  const isConnected = computed(() => connectionState.value === 'connected');
  const isStreaming = ref(false);
  const currentRequestId = ref<string | null>(null);
  const connectionError = ref<string | null>(null);
  const retryCount = ref(0);
  
  // Progress tracking (Phase 2.2 Task 2.2.3)
  const progressTracker = ref<ProgressTracker>({
    tokensGenerated: 0,
    estimatedTotal: 200,
    startTime: 0,
    tokensPerSecond: 0,
    estimatedTimeRemaining: 0
  });
  
  const progressPercent = computed(() => {
    if (!enableProgressTracking) return 0;
    return Math.min(100, (progressTracker.value.tokensGenerated / progressTracker.value.estimatedTotal) * 100);
  });
  
  const formattedTimeRemaining = computed(() => {
    const seconds = progressTracker.value.estimatedTimeRemaining;
    if (seconds < 1) return 'Less than 1 second';
    if (seconds < 60) return `${Math.round(seconds)} seconds`;
    return `${Math.floor(seconds / 60)} min ${Math.round(seconds % 60)} sec`;
  });
  
  // Cancel token (Phase 2.2 Task 2.2.2)
  let currentCancelToken: CancelToken | null = null;
  
  // Store callbacks for the current stream
  let currentCallbacks: StreamingCallbacks | null = null;
  let fullResponse = '';
  let chunkCount = 0;

  // ============================================
  // Progress Tracking Functions
  // ============================================
  
  function startProgressTracking() {
    progressTracker.value = {
      tokensGenerated: 0,
      estimatedTotal: 200,
      startTime: Date.now(),
      tokensPerSecond: 0,
      estimatedTimeRemaining: 0
    };
  }
  
  function updateProgress(tokensAdded: number = 1) {
    progressTracker.value.tokensGenerated += tokensAdded;
    
    const elapsed = (Date.now() - progressTracker.value.startTime) / 1000;
    progressTracker.value.tokensPerSecond = elapsed > 0 
      ? progressTracker.value.tokensGenerated / elapsed 
      : 0;
    
    const remaining = progressTracker.value.estimatedTotal - progressTracker.value.tokensGenerated;
    progressTracker.value.estimatedTimeRemaining = progressTracker.value.tokensPerSecond > 0
      ? remaining / progressTracker.value.tokensPerSecond
      : 0;
  }

  // ============================================
  // Connection Management (Phase 2.2 Task 2.2.1)
  // ============================================

  function connect() {
    if (socket.value?.connected) {
      console.log('[useAIStream] Already connected');
      return;
    }

    console.log('[useAIStream] Connecting to Socket.IO server...');
    connectionState.value = 'connecting';
    connectionError.value = null;
    
    socket.value = io({
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts,
      reconnectionDelay,
      reconnectionDelayMax: reconnectionDelay * Math.pow(2, Math.min(retryCount.value, 4)),
      timeout: 30000,
      autoConnect: true
    });

    // Connection event handlers
    socket.value.on('connect', () => {
      console.log('[useAIStream] Connected:', socket.value?.id);
      connectionState.value = 'connected';
      connectionError.value = null;
      retryCount.value = 0;
    });

    socket.value.on('disconnect', (reason) => {
      console.log('[useAIStream] Disconnected:', reason);
      connectionState.value = 'idle';
      
      if (isStreaming.value) {
        console.log('[useAIStream] Lost connection during stream');
        currentCallbacks?.onError?.('Connection lost', true);
        isStreaming.value = false;
        
        // Attempt reconnection for recoverable disconnections
        if (reason === 'transport close' || reason === 'ping timeout') {
          console.log('[useAIStream] Attempting reconnection...');
          retryCount.value++;
        }
      }
    });

    socket.value.on('connect_error', (error) => {
      console.error('[useAIStream] Connection error:', error.message);
      connectionState.value = 'error';
      connectionError.value = error.message;
      retryCount.value++;
    });

    // AI streaming event handlers
    socket.value.on('ai-chunk', (event: StreamingEvent) => {
      if (event.requestId !== currentRequestId.value) return;
      if (currentCancelToken?.isCancelled) return; // Skip if cancelled
      
      const chunk = event.payload?.chunk as string || '';
      fullResponse += chunk;
      chunkCount++;
      
      // Update progress tracking
      if (enableProgressTracking) {
        updateProgress(chunk.split(/\s+/).length);
      }
      
      console.log(`[useAIStream] Chunk ${chunkCount}: "${chunk.slice(0, 30)}..."`);
      currentCallbacks?.onChunk?.(chunk);
      currentCallbacks?.onProgress?.(chunkCount, event.payload?.totalLength as number || 100);
    });

    socket.value.on('ai-complete', (event: StreamingEvent) => {
      if (event.requestId !== currentRequestId.value) return;
      
      console.log('[useAIStream] Stream complete:', event.requestId);
      isStreaming.value = false;
      
      const duration = (event.payload?.totalDuration as number) || 0;
      currentCallbacks?.onComplete?.(fullResponse, duration);
      
      currentRequestId.value = null;
      currentCallbacks = null;
    });

    socket.value.on('ai-error', (event: StreamingEvent) => {
      if (event.requestId !== currentRequestId.value) return;
      
      console.error('[useAIStream] Stream error:', event.payload?.message);
      isStreaming.value = false;
      
      currentCallbacks?.onError?.(
        event.payload?.message as string || 'Unknown error',
        event.payload?.recoverable as boolean ?? true
      );
      
      currentRequestId.value = null;
      currentCallbacks = null;
    });
  }

  // Disconnect from server
  function disconnect() {
    if (socket.value) {
      console.log('[useAIStream] Disconnecting...');
      connectionState.value = 'disconnecting';
      socket.value.disconnect();
      socket.value = null;
      connectionState.value = 'idle';
    }
  }

  // Start a streaming request
  function streamAI(
    requestId: string,
    useCase: string,
    prompt: string,
    callbacks: StreamingCallbacks
  ): Promise<{ cancel: () => void }> {
    return new Promise((resolve, reject) => {
      if (!socket.value?.connected) {
        console.log('[useAIStream] Not connected, attempting to connect...');
        connect();
        
        // Wait for connection with timeout
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, 10000);
        
        const checkConnection = () => {
          if (socket.value?.connected) {
            clearTimeout(timeout);
            startStream(requestId, useCase, prompt, callbacks, resolve, reject);
          } else {
            socket.value?.once('connect', () => {
              clearTimeout(timeout);
              startStream(requestId, useCase, prompt, callbacks, resolve, reject);
            });
          }
        };
        
        checkConnection();
      } else {
        startStream(requestId, useCase, prompt, callbacks, resolve, reject);
      }
    });
  }

  // Internal function to start streaming
  function startStream(
    requestId: string,
    useCase: string,
    prompt: string,
    callbacks: StreamingCallbacks,
    resolve: (value: { cancel: () => void }) => void,
    reject: (error: Error) => void
  ) {
    console.log('[useAIStream] Starting stream:', requestId);
    
    // Reset state
    fullResponse = '';
    chunkCount = 0;
    currentRequestId.value = requestId;
    currentCallbacks = callbacks;
    isStreaming.value = true;
    
    // Initialize progress tracking
    if (enableProgressTracking) {
      startProgressTracking();
    }
    
    // Create cancel token (Phase 2.2 Task 2.2.2)
    currentCancelToken = {
      isCancelled: false,
      requestId
    };
    
    // Provide cancel function
    const cancel = () => {
      if (currentCancelToken && !currentCancelToken.isCancelled) {
        currentCancelToken.isCancelled = true;
        currentCancelToken.reason = 'User cancelled';
        cancelStream();
      }
    };
    
    // Send stream request
    socket.value?.emit('ai-stream', {
      requestId,
      useCase,
      prompt,
      config: {
        model: 'gemma3:4b',
        temperature: 0.7,
        maxTokens: 500
      }
    }, (response: { success?: boolean; error?: string }) => {
      if (response?.error) {
        console.error('[useAIStream] Stream request error:', response.error);
        isStreaming.value = false;
        reject(new Error(response.error));
      } else {
        console.log('[useAIStream] Stream request accepted');
        resolve({ cancel });
      }
    });
  }

  // Cancel current stream (Phase 2.2 Task 2.2.2)
  function cancelStream() {
    if (currentRequestId.value && socket.value?.connected) {
      console.log('[useAIStream] Cancelling stream:', currentRequestId.value);
      socket.value.emit('ai-cancel', { requestId: currentRequestId.value });
      isStreaming.value = false;
      
      // Clear cancel token
      if (currentCancelToken) {
        currentCancelToken.isCancelled = true;
      }
      
      currentCallbacks?.onCancel?.();
      currentRequestId.value = null;
      currentCallbacks = null;
      currentCancelToken = null;
    }
  }
  
  // Create a new cancel token
  function createCancelToken(): CancelToken {
    return {
      isCancelled: false,
      requestId: currentRequestId.value || ''
    };
  }
  
  // Check if current stream is cancelled
  function isCancelled(): boolean {
    return currentCancelToken?.isCancelled ?? false;
  }

  // Auto-connect if enabled
  if (autoConnect) {
    connect();
  }

  // Cleanup on unmount
  onUnmounted(() => {
    disconnect();
  });

  return {
    // Connection state
    socket,
    connectionState: readonly(connectionState),
    isConnected: readonly(isConnected),
    isStreaming: readonly(isStreaming),
    currentRequestId: readonly(currentRequestId),
    connectionError: readonly(connectionError),
    retryCount: readonly(retryCount),
    
    // Progress tracking (Phase 2.2 Task 2.2.3)
    progressTracker: readonly(progressTracker),
    progressPercent: readonly(progressPercent),
    formattedTimeRemaining: readonly(formattedTimeRemaining),
    
    // Methods
    connect,
    disconnect,
    streamAI,
    cancelStream,
    createCancelToken,
    isCancelled
  };
}
