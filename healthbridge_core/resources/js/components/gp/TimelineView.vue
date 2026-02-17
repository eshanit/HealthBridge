<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import axios from 'axios';

interface TimelineEvent {
    id: string;
    type: 'state_change' | 'ai_request' | 'comment' | 'form' | 'referral';
    title: string;
    description: string;
    user: string | null;
    timestamp: string;
    metadata?: Record<string, any>;
}

interface Props {
    sessionCouchId: string;
}

const props = defineProps<Props>();

const timeline = ref<TimelineEvent[]>([]);
const isLoading = ref(false);
const error = ref<string | null>(null);

// Event type icons and colors
const eventConfig = {
    state_change: {
        icon: '🔄',
        color: 'bg-blue-500',
        label: 'Status Change',
    },
    ai_request: {
        icon: '🤖',
        color: 'bg-purple-500',
        label: 'AI Request',
    },
    comment: {
        icon: '💬',
        color: 'bg-green-500',
        label: 'Comment',
    },
    form: {
        icon: '📋',
        color: 'bg-orange-500',
        label: 'Form',
    },
    referral: {
        icon: '📤',
        color: 'bg-red-500',
        label: 'Referral',
    },
};

// Format timestamp
const formatTime = (timestamp: string): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
};

// Format full date
const formatFullDate = (timestamp: string): string => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
};

// Group timeline by date
const groupedTimeline = computed(() => {
    const groups: Record<string, TimelineEvent[]> = {};
    
    timeline.value.forEach(event => {
        const date = new Date(event.timestamp).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
        
        if (!groups[date]) {
            groups[date] = [];
        }
        groups[date].push(event);
    });
    
    return Object.entries(groups).map(([date, events]) => ({
        date,
        events,
    }));
});

// Fetch timeline
const fetchTimeline = async () => {
    isLoading.value = true;
    error.value = null;
    
    try {
        const response = await axios.get(`/gp/sessions/${props.sessionCouchId}/timeline`);
        timeline.value = response.data.timeline || [];
    } catch (err) {
        console.error('Failed to fetch timeline:', err);
        error.value = 'Failed to load timeline';
    } finally {
        isLoading.value = false;
    }
};

// Refresh timeline
const refresh = () => {
    fetchTimeline();
};

// Initial load
onMounted(() => {
    fetchTimeline();
});

// Expose refresh method
defineExpose({ refresh });
</script>

<template>
    <Card class="h-full">
        <CardHeader class="pb-3">
            <div class="flex items-center justify-between">
                <CardTitle class="text-base">Patient Timeline</CardTitle>
                <Button variant="ghost" size="sm" @click="refresh" :disabled="isLoading">
                    <svg
                        :class="['h-4 w-4', isLoading && 'animate-spin']"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                        />
                    </svg>
                </Button>
            </div>
        </CardHeader>
        <CardContent class="overflow-y-auto max-h-[500px]">
            <!-- Loading State -->
            <div v-if="isLoading && timeline.length === 0" class="flex justify-center py-8">
                <div class="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full"></div>
            </div>

            <!-- Error State -->
            <div v-else-if="error" class="text-center py-8 text-destructive">
                <svg class="h-12 w-12 mx-auto mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <p class="text-sm">{{ error }}</p>
                <Button variant="outline" size="sm" class="mt-2" @click="refresh">
                    Try Again
                </Button>
            </div>

            <!-- Empty State -->
            <div v-else-if="timeline.length === 0" class="text-center py-8 text-muted-foreground">
                <svg class="h-12 w-12 mx-auto mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p class="text-sm">No timeline events yet</p>
            </div>

            <!-- Timeline -->
            <div v-else class="space-y-6">
                <div v-for="group in groupedTimeline" :key="group.date">
                    <!-- Date Header -->
                    <div class="sticky top-0 bg-background z-10 py-1">
                        <span class="text-xs font-medium text-muted-foreground bg-muted px-2 py-1 rounded">
                            {{ group.date }}
                        </span>
                    </div>

                    <!-- Events -->
                    <div class="relative pl-6 mt-3 space-y-4">
                        <!-- Vertical Line -->
                        <div class="absolute left-[7px] top-0 bottom-0 w-0.5 bg-border"></div>

                        <div
                            v-for="event in group.events"
                            :key="event.id"
                            class="relative"
                        >
                            <!-- Event Dot -->
                            <div
                                :class="[
                                    'absolute left-0 top-1.5 w-3 h-3 rounded-full border-2 border-background',
                                    eventConfig[event.type].color
                                ]"
                            ></div>

                            <!-- Event Content -->
                            <div class="pl-4">
                                <div class="flex items-start justify-between gap-2">
                                    <div class="flex-1">
                                        <div class="flex items-center gap-2">
                                            <span class="text-sm font-medium">
                                                {{ eventConfig[event.type].icon }} {{ event.title }}
                                            </span>
                                            <Badge variant="outline" class="text-xs">
                                                {{ eventConfig[event.type].label }}
                                            </Badge>
                                        </div>
                                        <p class="text-sm text-muted-foreground mt-0.5">
                                            {{ event.description }}
                                        </p>
                                        <div class="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                                            <span v-if="event.user">by {{ event.user }}</span>
                                            <span :title="formatFullDate(event.timestamp)">
                                                {{ formatTime(event.timestamp) }}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <!-- Metadata -->
                                <div v-if="event.metadata" class="mt-2 pl-2 border-l-2 border-muted">
                                    <div v-if="event.type === 'ai_request'" class="text-xs text-muted-foreground space-y-0.5">
                                        <div v-if="event.metadata.model">Model: {{ event.metadata.model }}</div>
                                        <div v-if="event.metadata.latency_ms">Latency: {{ event.metadata.latency_ms }}ms</div>
                                    </div>
                                    <div v-else-if="event.type === 'referral'" class="text-xs text-muted-foreground space-y-0.5">
                                        <div v-if="event.metadata.specialty">Specialty: {{ event.metadata.specialty }}</div>
                                        <div v-if="event.metadata.priority">Priority: {{ event.metadata.priority }}</div>
                                    </div>
                                    <div v-else-if="event.type === 'form'" class="text-xs text-muted-foreground space-y-0.5">
                                        <div v-if="event.metadata.is_complete !== undefined">
                                            Status: {{ event.metadata.is_complete ? 'Complete' : 'In Progress' }}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </CardContent>
    </Card>
</template>
