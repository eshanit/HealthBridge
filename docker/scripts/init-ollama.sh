#!/bin/bash
# =============================================================================
# UtanoBridge - Ollama Model Initialization Script
# Pulls required AI models on first deployment
# =============================================================================

set -e

echo "🤖 Initializing Ollama AI Models..."

# Wait for Ollama to be ready
echo "⏳ Waiting for Ollama service..."
until curl -s http://ollama:11434/api/tags > /dev/null 2>&1; do
    sleep 2
done
echo "✅ Ollama is ready!"

# Default model (can be overridden via environment)
MODEL="${OLLAMA_MODEL:-gemma3:4b}"

echo "📥 Pulling model: $MODEL"
curl -s -X POST http://ollama:11434/api/pull \
    -H "Content-Type: application/json" \
    -d "{\"name\": \"$MODEL\"}" | while read -r line; do
    echo "   $line"
done

echo "✅ Model $MODEL pulled successfully!"

# List available models
echo "📋 Available models:"
curl -s http://ollama:11434/api/tags | python3 -c "import sys, json; data = json.load(sys.stdin); [print(f\"   - {m['name']}\") for m in data.get('models', [])]" 2>/dev/null || \
    curl -s http://ollama:11434/api/tags

echo "🎉 Ollama initialization complete!"
