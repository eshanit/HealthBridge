<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface Patient {
    id: string;
    cpt: string;
    name: string;
    age: number;
    gender: string;
    triage_color: 'RED' | 'YELLOW' | 'GREEN';
    status: string;
    referral_source: string;
    waiting_minutes: number;
    danger_signs: string[];
    vitals?: {
        rr?: number;
        hr?: number;
        temp?: number;
        spo2?: number;
    };
}

interface ConversationMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
    task?: string;
}

interface Props {
    patient: Patient;
}

const props = defineProps<Props>();

const emit = defineEmits<{
    (e: 'aiTask', task: string): void;
}>();

// AI Tasks available for GP
const aiTasks = [
    {
        id: 'explain_triage',
        label: 'Explain Triage Classification',
        description: 'Understand why this patient was classified as ' + props.patient.triage_color,
        icon: '🔍',
    },
    {
        id: 'clinical_summary',
        label: 'Generate Clinical Summary',
        description: 'Get a comprehensive summary of the patient\'s condition',
        icon: '📋',
    },
    {
        id: 'specialist_review',
        label: 'Specialist Review Summary',
        description: 'Generate a summary for specialist consultation',
        icon: '👨‍⚕️',
    },
    {
        id: 'red_case_analysis',
        label: 'RED Case Analysis',
        description: 'Detailed analysis for emergency cases',
        icon: '🚨',
        requiresRed: true,
    },
    {
        id: 'handoff_report',
        label: 'Handoff Report (SBAR)',
        description: 'Generate SBAR-style handoff for shift change',
        icon: '🔄',
    },
];

// State
const selectedTask = ref<string | null>(null);
const isLoading = ref(false);
const aiResponse = ref<string | null>(null);
const aiError = ref<string | null>(null);

// Conversation memory state
const conversationId = ref<string | null>(null);
const conversationHistory = ref<ConversationMessage[]>([]);
const showHistory = ref(false);
const rememberConversation = ref(true);

// Load conversation history from sessionStorage on mount
// Using sessionStorage for clinical data security - data is cleared when tab closes
onMounted(() => {
    loadConversationHistory();
});

// Watch for patient changes
watch(() => props.patient.id, (newPatientId, oldPatientId) => {
    if (oldPatientId && newPatientId !== oldPatientId) {
        // Save current conversation before switching
        if (conversationHistory.value.length > 0) {
            saveConversationHistory(oldPatientId);
        }
        // Reset state and load new patient's conversation
        selectedTask.value = null;
        aiResponse.value = null;
        aiError.value = null;
        isLoading.value = false;
        loadConversationHistory();
    }
});

// Computed
const availableTasks = computed(() => {
    return aiTasks.filter(task => {
        if (task.requiresRed && props.patient.triage_color !== 'RED') {
            return false;
        }
        return true;
    });
});

const hasConversationHistory = computed(() => {
    return conversationHistory.value.length > 0;
});

// Methods
const loadConversationHistory = () => {
    if (!rememberConversation.value) {
        conversationHistory.value = [];
        conversationId.value = null;
        return;
    }

    try {
        const storageKey = `ai_conversation_${props.patient.id}`;
        const stored = sessionStorage.getItem(storageKey);
        
        if (stored) {
            const data = JSON.parse(stored);
            conversationId.value = data.conversationId;
            conversationHistory.value = data.messages || [];
        } else {
            conversationHistory.value = [];
            conversationId.value = null;
        }
    } catch (error) {
        console.error('Failed to load conversation history:', error);
        conversationHistory.value = [];
        conversationId.value = null;
    }
};

const saveConversationHistory = (patientId: string = props.patient.id) => {
    if (!rememberConversation.value) {
        return;
    }

    try {
        const storageKey = `ai_conversation_${patientId}`;
        const data = {
            conversationId: conversationId.value,
            patientId: patientId,
            messages: conversationHistory.value,
            updatedAt: new Date().toISOString(),
        };
        sessionStorage.setItem(storageKey, JSON.stringify(data));
    } catch (error) {
        console.error('Failed to save conversation history:', error);
    }
};

const clearConversationHistory = () => {
    const storageKey = `ai_conversation_${props.patient.id}`;
    sessionStorage.removeItem(storageKey);
    conversationHistory.value = [];
    conversationId.value = null;
    aiResponse.value = null;
};

const executeTask = async (taskId: string) => {
    selectedTask.value = taskId;
    isLoading.value = true;
    aiResponse.value = null;
    aiError.value = null;
    
    try {
        // Build request with conversation context
        const requestBody: Record<string, unknown> = {
            task: taskId,
            patient_id: props.patient.id,
            context: {
                triage_color: props.patient.triage_color,
                danger_signs: props.patient.danger_signs,
                vitals: props.patient.vitals,
                age: props.patient.age,
                gender: props.patient.gender,
            },
        };

        // Include conversation ID if we have one (for RemembersConversations trait)
        if (rememberConversation.value && conversationId.value) {
            requestBody.conversation_id = conversationId.value;
        }

        // Include conversation history for context
        if (rememberConversation.value && conversationHistory.value.length > 0) {
            requestBody.history = conversationHistory.value.slice(-10); // Last 10 messages
        }

        const response = await fetch('/api/ai/medgemma', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
            },
            body: JSON.stringify(requestBody),
        });
        
        if (response.ok) {
            const data = await response.json();
            aiResponse.value = data.output || data.explanation || JSON.stringify(data, null, 2);
            
            // Update conversation ID from response
            if (data.conversation_id) {
                conversationId.value = data.conversation_id;
            }

            // Add to conversation history
            if (rememberConversation.value) {
                const taskLabel = aiTasks.find(t => t.id === taskId)?.label || taskId;
                
                // Add user message (the task request)
                conversationHistory.value.push({
                    id: `msg_${Date.now()}_user`,
                    role: 'user',
                    content: taskLabel,
                    timestamp: new Date().toISOString(),
                    task: taskId,
                });

                // Add assistant message (the response)
                conversationHistory.value.push({
                    id: `msg_${Date.now()}_assistant`,
                    role: 'assistant',
                    content: aiResponse.value ?? '',
                    timestamp: new Date().toISOString(),
                    task: taskId,
                });

                // Save to sessionStorage
                saveConversationHistory();
            }

            emit('aiTask', taskId);
        } else {
            const errorData = await response.json().catch(() => ({}));
            aiError.value = errorData.error || 'Failed to get AI response. Please try again.';
        }
    } catch (error) {
        console.error('AI task failed:', error);
        aiError.value = 'An error occurred. Please try again.';
    } finally {
        isLoading.value = false;
    }
};

const formatResponse = (response: string): string => {
    // Basic markdown-like formatting
    return response
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/\n/g, '<br>');
};

const formatTimestamp = (timestamp: string): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};
</script>

<template>
    <div class="space-y-4">
        <!-- Warning Banner -->
        <div class="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
            <div class="flex items-start gap-3">
                <svg class="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                    <h4 class="font-medium text-yellow-800 dark:text-yellow-200">AI Support Only</h4>
                    <p class="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                        AI outputs are for clinical decision support only. They should not replace clinical judgment.
                        All AI suggestions must be verified by a qualified healthcare provider.
                    </p>
                </div>
            </div>
        </div>

        <!-- Conversation Memory Toggle -->
        <Card>
            <CardContent class="p-4">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-3">
                        <svg class="h-5 w-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                        <div>
                            <div class="font-medium text-sm">Remember Conversation</div>
                            <div class="text-xs text-muted-foreground">AI will remember context from previous queries (session only)</div>
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        <label class="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" v-model="rememberConversation" class="sr-only peer" @change="!rememberConversation && clearConversationHistory()">
                            <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary"></div>
                        </label>
                        <Button 
                            v-if="hasConversationHistory" 
                            variant="ghost" 
                            size="sm" 
                            @click="clearConversationHistory"
                            title="Clear conversation history"
                        >
                            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>

        <!-- Conversation History -->
        <Card v-if="hasConversationHistory && showHistory">
            <CardHeader class="pb-2">
                <CardTitle class="text-lg flex items-center justify-between">
                    <span>Conversation History</span>
                    <Badge variant="outline">{{ conversationHistory.length }} messages</Badge>
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div class="space-y-3 max-h-60 overflow-y-auto">
                    <div 
                        v-for="message in conversationHistory" 
                        :key="message.id"
                        :class="cn(
                            'p-3 rounded-lg text-sm',
                            message.role === 'user' 
                                ? 'bg-primary/10 ml-4' 
                                : 'bg-muted mr-4'
                        )"
                    >
                        <div class="flex items-center gap-2 mb-1">
                            <Badge :variant="message.role === 'user' ? 'default' : 'secondary'" class="text-xs">
                                {{ message.role === 'user' ? 'You' : 'AI' }}
                            </Badge>
                            <span class="text-xs text-muted-foreground">{{ formatTimestamp(message.timestamp) }}</span>
                        </div>
                        <div 
                            class="prose prose-sm dark:prose-invert max-w-none"
                            v-html="formatResponse(message.content.slice(0, 200) + (message.content.length > 200 ? '...' : ''))"
                        />
                    </div>
                </div>
            </CardContent>
        </Card>

        <!-- AI Tasks -->
        <Card>
            <CardHeader class="pb-2">
                <CardTitle class="text-lg flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        <span>🤖</span>
                        <span>AI Clinical Tasks</span>
                        <Badge variant="outline">MedGemma</Badge>
                    </div>
                    <Button 
                        v-if="hasConversationHistory"
                        variant="ghost" 
                        size="sm"
                        @click="showHistory = !showHistory"
                    >
                        {{ showHistory ? 'Hide' : 'Show' }} History
                    </Button>
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div class="grid gap-2">
                    <Button
                        v-for="task in availableTasks"
                        :key="task.id"
                        :variant="selectedTask === task.id ? 'default' : 'outline'"
                        class="justify-start h-auto py-3"
                        :disabled="isLoading"
                        @click="executeTask(task.id)"
                    >
                        <div class="flex items-start gap-3 text-left">
                            <span class="text-xl">{{ task.icon }}</span>
                            <div>
                                <div class="font-medium">{{ task.label }}</div>
                                <div class="text-xs text-muted-foreground font-normal">
                                    {{ task.description }}
                                </div>
                            </div>
                        </div>
                    </Button>
                </div>
            </CardContent>
        </Card>

        <!-- Loading State -->
        <Card v-if="isLoading">
            <CardContent class="p-6">
                <div class="flex items-center justify-center gap-3">
                    <svg class="animate-spin h-5 w-5 text-primary" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span class="text-muted-foreground">Processing AI request...</span>
                </div>
            </CardContent>
        </Card>

        <!-- AI Response -->
        <Card v-if="aiResponse && !isLoading">
            <CardHeader class="pb-2">
                <CardTitle class="text-lg flex items-center justify-between">
                    <span>AI Response</span>
                    <div class="flex items-center gap-2">
                        <Badge variant="secondary">Support Only</Badge>
                        <Button variant="ghost" size="sm" @click="aiResponse = null">
                            Clear
                        </Button>
                    </div>
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div
                    class="prose prose-sm dark:prose-invert max-w-none"
                    v-html="formatResponse(aiResponse)"
                />
                
                <!-- Audit Link -->
                <div class="mt-4 pt-4 border-t">
                    <Button variant="outline" size="sm" as-child>
                        <a :href="`/audit/ai?patient=${patient.id}`" target="_blank">
                            <svg class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            View AI Audit Log
                        </a>
                    </Button>
                </div>
            </CardContent>
        </Card>

        <!-- Error State -->
        <Card v-if="aiError" class="border-red-200 dark:border-red-800">
            <CardContent class="p-4">
                <div class="flex items-center gap-3 text-red-600 dark:text-red-400">
                    <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>{{ aiError }}</span>
                </div>
            </CardContent>
        </Card>

        <!-- Model Information -->
        <Card>
            <CardHeader class="pb-2">
                <CardTitle class="text-lg">Model Information</CardTitle>
            </CardHeader>
            <CardContent>
                <div class="grid grid-cols-2 gap-4 text-sm">
                    <div>
                        <span class="text-muted-foreground">Model:</span>
                        <span class="ml-2 font-medium">MedGemma 1.5</span>
                    </div>
                    <div>
                        <span class="text-muted-foreground">Provider:</span>
                        <span class="ml-2 font-medium">Ollama (Local)</span>
                    </div>
                    <div>
                        <span class="text-muted-foreground">Last Updated:</span>
                        <span class="ml-2 font-medium">February 2026</span>
                    </div>
                    <div>
                        <span class="text-muted-foreground">Status:</span>
                        <Badge variant="default" class="ml-2">Operational</Badge>
                    </div>
                </div>
            </CardContent>
        </Card>
    </div>
</template>
