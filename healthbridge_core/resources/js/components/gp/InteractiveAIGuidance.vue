<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import axios from 'axios';

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
}

interface Props {
    sessionCouchId: string;
    patientContext?: {
        age?: number;
        chief_complaint?: string;
        triage_priority?: string;
        vitals?: Record<string, any>;
        danger_signs?: string[];
    };
}

const props = defineProps<Props>();

// State
const messages = ref<Message[]>([]);
const question = ref('');
const isLoading = ref(false);
const error = ref<string | null>(null);
const messagesContainer = ref<HTMLElement | null>(null);

// Predefined AI actions
const predefinedActions = [
    {
        id: 'differential',
        label: 'Suggest Differentials',
        task: 'specialist_review',
        icon: '🔍',
        description: 'Get differential diagnosis suggestions',
    },
    {
        id: 'treatment',
        label: 'Treatment Options',
        task: 'clinical_summary',
        icon: '💊',
        description: 'Explore treatment options',
    },
    {
        id: 'handoff',
        label: 'Handoff Summary',
        task: 'handoff_report',
        icon: '📋',
        description: 'Generate SBAR handoff report',
    },
    {
        id: 'triage_explain',
        label: 'Explain Triage',
        task: 'explain_triage',
        icon: '🚦',
        description: 'Explain triage classification',
    },
];

// Generate unique ID
const generateId = (): string => {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Scroll to bottom of messages
const scrollToBottom = async () => {
    await nextTick();
    if (messagesContainer.value) {
        messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
    }
};

// Add message
const addMessage = (role: 'user' | 'assistant', content: string): Message => {
    const message: Message = {
        id: generateId(),
        role,
        content,
        timestamp: new Date(),
    };
    messages.value.push(message);
    scrollToBottom();
    return message;
};

// Execute predefined action
const executeAction = async (action: typeof predefinedActions[0]) => {
    isLoading.value = true;
    error.value = null;

    // Add user message
    addMessage('user', action.label);

    try {
        const response = await axios.post('/api/ai/medgemma', {
            task: action.task,
            sessionId: props.sessionCouchId,
            context: props.patientContext,
        });

        if (response.data.success) {
            addMessage('assistant', response.data.response);
        } else {
            throw new Error(response.data.error || 'AI request failed');
        }
    } catch (err: any) {
        console.error('AI action failed:', err);
        error.value = err.response?.data?.message || err.message || 'Failed to get AI response';
        addMessage('assistant', 'Sorry, I encountered an error processing your request. Please try again.');
    } finally {
        isLoading.value = false;
    }
};

// Send free-text question
const sendQuestion = async () => {
    if (!question.value.trim() || isLoading.value) return;

    const userQuestion = question.value.trim();
    question.value = '';
    isLoading.value = true;
    error.value = null;

    // Add user message
    addMessage('user', userQuestion);

    try {
        const response = await axios.post('/api/ai/medgemma', {
            task: 'clinical_summary', // Use clinical_summary as base for free-text
            sessionId: props.sessionCouchId,
            context: {
                ...props.patientContext,
                question: userQuestion,
            },
        });

        if (response.data.success) {
            addMessage('assistant', response.data.response);
        } else {
            throw new Error(response.data.error || 'AI request failed');
        }
    } catch (err: any) {
        console.error('AI question failed:', err);
        error.value = err.response?.data?.message || err.message || 'Failed to get AI response';
        addMessage('assistant', 'Sorry, I encountered an error processing your question. Please try again.');
    } finally {
        isLoading.value = false;
    }
};

// Clear conversation
const clearConversation = () => {
    messages.value = [];
    error.value = null;
};

// Format time
const formatTime = (date: Date): string => {
    return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
    });
};
</script>

<template>
    <Card class="h-full flex flex-col">
        <CardHeader class="pb-3 flex-shrink-0">
            <div class="flex items-center justify-between">
                <div>
                    <CardTitle class="text-base">AI Clinical Support</CardTitle>
                    <p class="text-xs text-muted-foreground mt-1">
                        Decision support tool - not for diagnosis
                    </p>
                </div>
                <Button
                    v-if="messages.length > 0"
                    variant="ghost"
                    size="sm"
                    @click="clearConversation"
                >
                    Clear
                </Button>
            </div>
        </CardHeader>

        <CardContent class="flex-1 flex flex-col overflow-hidden p-0">
            <!-- Quick Action Buttons -->
            <div class="p-4 border-b flex-shrink-0">
                <div class="text-xs font-medium text-muted-foreground mb-2">Quick Actions</div>
                <div class="flex flex-wrap gap-2">
                    <Button
                        v-for="action in predefinedActions"
                        :key="action.id"
                        variant="outline"
                        size="sm"
                        :disabled="isLoading"
                        @click="executeAction(action)"
                    >
                        <span class="mr-1">{{ action.icon }}</span>
                        {{ action.label }}
                    </Button>
                </div>
            </div>

            <!-- Messages Area -->
            <div
                ref="messagesContainer"
                class="flex-1 overflow-y-auto p-4 space-y-4"
            >
                <!-- Welcome Message -->
                <div v-if="messages.length === 0" class="text-center py-8 text-muted-foreground">
                    <svg class="h-12 w-12 mx-auto mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    <p class="text-sm">Select a quick action or ask a clinical question</p>
                </div>

                <!-- Messages -->
                <div
                    v-for="message in messages"
                    :key="message.id"
                    :class="[
                        'flex',
                        message.role === 'user' ? 'justify-end' : 'justify-start'
                    ]"
                >
                    <div
                        :class="[
                            'max-w-[85%] rounded-lg px-3 py-2',
                            message.role === 'user'
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted'
                        ]"
                    >
                        <div class="text-sm whitespace-pre-wrap">{{ message.content }}</div>
                        <div
                            :class="[
                                'text-xs mt-1',
                                message.role === 'user'
                                    ? 'text-primary-foreground/70'
                                    : 'text-muted-foreground'
                            ]"
                        >
                            {{ formatTime(message.timestamp) }}
                        </div>
                    </div>
                </div>

                <!-- Loading Indicator -->
                <div v-if="isLoading" class="flex justify-start">
                    <div class="bg-muted rounded-lg px-3 py-2">
                        <div class="flex items-center gap-2">
                            <div class="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full"></div>
                            <span class="text-sm text-muted-foreground">Thinking...</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Error Alert -->
            <div v-if="error" class="px-4 pb-2">
                <Alert variant="destructive">
                    <AlertDescription class="text-xs">{{ error }}</AlertDescription>
                </Alert>
            </div>

            <!-- Input Area -->
            <div class="p-4 border-t flex-shrink-0">
                <form @submit.prevent="sendQuestion" class="flex gap-2">
                    <Input
                        v-model="question"
                        placeholder="Ask a clinical question..."
                        :disabled="isLoading"
                        class="flex-1"
                    />
                    <Button type="submit" :disabled="isLoading || !question.trim()">
                        <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                        </svg>
                    </Button>
                </form>
            </div>

            <!-- Disclaimer -->
            <div class="px-4 pb-3 flex-shrink-0">
                <div class="flex items-start gap-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded border border-yellow-200 dark:border-yellow-800">
                    <svg class="h-3 w-3 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span class="text-xs text-yellow-800 dark:text-yellow-200">
                        <strong>Support Only:</strong> AI provides decision support, not diagnoses.
                        Always use clinical judgment.
                    </span>
                </div>
            </div>
        </CardContent>
    </Card>
</template>
