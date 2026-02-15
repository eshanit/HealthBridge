/**
 * AI Streaming Types
 * 
 * Type definitions for WebSocket-based AI streaming architecture
 * Supports Ollama streaming API and integrates with Phase 1 type system
 */

import type { AIUseCase } from './explainability';

/**
 * Streaming connection states
 */
export type StreamingState = 
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'streaming'
  | 'paused'
  | 'error'
  | 'reconnecting';

/**
 * Streaming events from server to client
 */
export interface StreamingEvent {
  type: StreamingEventType;
  requestId: string;
  timestamp: string;
  payload: StreamingPayload;
}

export type StreamingEventType =
  | 'connection_established'
  | 'chunk'
  | 'progress'
  | 'complete'
  | 'error'
  | 'heartbeat';

/**
 * Chunk payload for incremental AI response
 */
export interface ChunkPayload {
  chunk: string;
  totalLength: number;
  chunkIndex: number;
  isFirst: boolean;
  isLast: boolean;
}

/**
 * Progress update payload
 */
export interface ProgressPayload {
  status: 'generating' | 'processing' | 'finalizing';
  progress: number; // 0-100
  message: string;
}

/**
 * Complete payload with full response
 */
export interface CompletePayload {
  fullResponse: string;
  confidence: number;
  modelVersion: string;
  duration: number; // ms
}

/**
 * Error payload
 */
export interface ErrorPayload {
  code: string;
  message: string;
  recoverable: boolean;
}

/**
 * Union of all streaming payloads
 */
export type StreamingPayload = 
  | ChunkPayload
  | ProgressPayload
  | CompletePayload
  | ErrorPayload;

/**
 * Streaming request from client to server
 */
export interface StreamingRequest {
  requestId: string;
  useCase: AIUseCase;
  sessionId: string;
  schemaId: string;
  formId?: string;
  timestamp: string;
  payload: {
    prompt: string;
    context?: Record<string, unknown>;
    config?: StreamingConfig;
  };
}

/**
 * Streaming configuration
 */
export interface StreamingConfig {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean; // Should always be true for streaming
  keepAlive?: number;
}

/**
 * WebSocket connection options
 */
export interface StreamingOptions {
  autoConnect?: boolean;
  autoReconnect?: boolean;
  maxRetries?: number;
  retryDelay?: number;
  heartbeatInterval?: number;
  timeout?: number;
}

/**
 * Streaming state with reactive refs
 */
export interface StreamingStateRef {
  state: StreamingState;
  isConnected: boolean;
  isStreaming: boolean;
  progress: number;
  error: string | null;
  connectionAttempts: number;
}

/**
 * Streaming result with full response
 */
export interface StreamingResult {
  requestId: string;
  fullResponse: string;
  confidence: number;
  modelVersion: string;
  duration: number;
  chunks: number;
  success: boolean;
  error?: string;
}

/**
 * Audit logging for streaming interactions
 */
export interface StreamingAuditLog {
  id: string;
  requestId: string;
  sessionId: string;
  useCase: AIUseCase;
  state: StreamingState;
  chunksReceived: number;
  totalDuration: number;
  confidence: number;
  modelVersion: string;
  reconnectAttempts: number;
  errorCount: number;
  timestamp: string;
  nurseAction?: 'viewed' | 'dismissed' | 'followed' | 'overridden';
}

/**
 * Ollama streaming response format
 * Based on Ollama REST API /api/generate streaming response
 */
export interface OllamaStreamResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

/**
 * Ollama chat streaming response format
 * Based on Ollama REST API /api/chat streaming response
 */
export interface OllamaChatStreamResponse {
  model: string;
  created_at: string;
  message: {
    role: 'assistant';
    content: string;
  };
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}
