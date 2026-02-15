/**
 * Socket.IO Server Plugin for Nuxt 4
 * 
 * Enables real-time WebSocket communication for AI streaming
 * Uses Socket.IO with polling as fallback for compatibility
 */

import { Server } from 'socket.io';
import type { NitroApp } from 'nitropack';

interface StreamingRequest {
  requestId: string;
  useCase: string;
  prompt: string;
  config?: Record<string, unknown>;
}

interface StreamingEvent {
  type: 'chunk' | 'progress' | 'complete' | 'error';
  requestId: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

// Active streaming sessions
const activeStreams = new Map<string, {
  socketId: string;
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}>();

let io: Server | null = null;

export default defineNitroPlugin((nitroApp: NitroApp) => {
  console.log('[Socket.IO] Initializing Socket.IO server...');
  
  // Create Socket.IO server with CORS
  io = new Server({
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    },
    transports: ['websocket', 'polling'],
    allowUpgrades: true,
    pingTimeout: 60000,
    pingInterval: 25000
  });
  
  // Handle connections
  io.on('connection', (socket) => {
    console.log(`[Socket.IO] Client connected: ${socket.id}`);
    
    // Handle AI streaming request
    socket.on('ai-stream', async (data: StreamingRequest, callback?: (response: { success?: boolean; error?: string }) => void) => {
      console.log(`[Socket.IO] Stream request: ${data.requestId}, useCase: ${data.useCase}`);
      
      // Store the promise resolvers for this stream
      let resolveStream: ((value: unknown) => void) | null = null;
      let rejectStream: ((reason?: unknown) => void) | null = null;
      
      const streamPromise = new Promise((resolve, reject) => {
        resolveStream = resolve;
        rejectStream = reject;
      });
      
      activeStreams.set(data.requestId, {
        socketId: socket.id,
        resolve: resolveStream!,
        reject: rejectStream!
      });
      
      try {
        // Make HTTP request to Ollama streaming endpoint
        const response = await fetch('http://localhost:11434/api/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'gemma3:4b',
            prompt: data.prompt,
            stream: true,
            options: {
              temperature: 0.7,
              num_predict: 500
            }
          })
        });
        
        if (!response.ok) {
          throw new Error(`Ollama error: ${response.statusText}`);
        }
        
        // Get the reader for streaming response
        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('No response body from Ollama');
        }
        
        const decoder = new TextDecoder();
        let buffer = '';
        let chunkIndex = 0;
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          
          for (const line of lines) {
            if (!line.trim()) continue;
            
            try {
              const parsed = JSON.parse(line);
              
              if (parsed.response) {
                chunkIndex++;
                
                // Send chunk to client
                const event: StreamingEvent = {
                  type: 'chunk',
                  requestId: data.requestId,
                  timestamp: new Date().toISOString(),
                  payload: {
                    chunk: parsed.response,
                    totalLength: parsed.response.length,
                    chunkIndex,
                    isFirst: chunkIndex === 1,
                    isLast: parsed.done
                  }
                };
                socket.emit('ai-chunk', event);
              }
              
              if (parsed.done) {
                // Send complete event
                const completeEvent: StreamingEvent = {
                  type: 'complete',
                  requestId: data.requestId,
                  timestamp: new Date().toISOString(),
                  payload: {
                    done: true,
                    totalDuration: parsed.total_duration || 0
                  }
                };
                socket.emit('ai-complete', completeEvent);
                
                activeStreams.delete(data.requestId);
                resolveStream!({ success: true, requestId: data.requestId });
                callback?.({ success: true });
                return;
              }
            } catch (e) {
              // Skip invalid JSON lines
            }
          }
        }
        
        // Send complete if we exit the loop without done
        const completeEvent: StreamingEvent = {
          type: 'complete',
          requestId: data.requestId,
          timestamp: new Date().toISOString(),
          payload: { done: true }
        };
        socket.emit('ai-complete', completeEvent);
        activeStreams.delete(data.requestId);
        resolveStream!({ success: true, requestId: data.requestId });
        callback?.({ success: true });
        
      } catch (error) {
        console.error(`[Socket.IO] Stream error: ${error}`);
        
        // Send error to client
        const errorEvent: StreamingEvent = {
          type: 'error',
          requestId: data.requestId,
          timestamp: new Date().toISOString(),
          payload: {
            message: error instanceof Error ? error.message : 'Unknown error',
            recoverable: false
          }
        };
        socket.emit('ai-error', errorEvent);
        
        activeStreams.delete(data.requestId);
        rejectStream!(error);
        callback?.({ error: error instanceof Error ? error.message : 'Unknown error' });
      }
    });
    
    // Handle cancel request
    socket.on('ai-cancel', (data: { requestId: string }) => {
      console.log(`[Socket.IO] Cancel request: ${data.requestId}`);
      const stream = activeStreams.get(data.requestId);
      if (stream) {
        stream.reject(new Error('Cancelled by user'));
        activeStreams.delete(data.requestId);
      }
    });
    
    // Handle disconnect
    socket.on('disconnect', () => {
      console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
      
      // Cancel any active streams for this socket
      for (const [requestId, stream] of activeStreams) {
        if (stream.socketId === socket.id) {
          stream.reject(new Error('Client disconnected'));
          activeStreams.delete(requestId);
        }
      }
    });
  });
  
  // Attach Socket.IO to HTTP server for Nuxt
  const originalListen = (nitroApp as any).listen || ((nitroApp as any).server?.listen);
  
  // Initialize Socket.IO HTTP handler
  console.log('[Socket.IO] Server plugin ready. Attach to HTTP server in production.');
  
  // Export io for use in other plugins
  (nitroApp as any).$io = io;
  
  console.log('[Socket.IO] Server initialized successfully');
  
  return () => {
    console.log('[Socket.IO] Cleaning up...');
    io?.disconnectSockets();
    io?.close();
  };
});

// Helper function to attach Socket.IO to a Node.js HTTP server
export function attachSocketIO(server: any) {
  if (io) {
    io.attach(server, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST']
      }
    });
    console.log('[Socket.IO] Attached to HTTP server');
  }
}
