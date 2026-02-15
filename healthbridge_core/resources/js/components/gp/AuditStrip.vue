<script setup lang="ts">
import { computed } from 'vue';
import { cn } from '@/lib/utils';

interface AuditEntry {
    timestamp: string;
    action: string;
    user: string;
    details: string;
}

interface Props {
    entries: AuditEntry[];
}

const props = defineProps<Props>();

// Format timestamp for display
const formatTime = (timestamp: string): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });
};

// Get the most recent entries (last 3)
const recentEntries = computed(() => {
    return props.entries.slice(0, 3);
});

// Get action icon
const getActionIcon = (action: string): string => {
    if (action.toLowerCase().includes('ai')) return '🤖';
    if (action.toLowerCase().includes('state')) return '🔄';
    if (action.toLowerCase().includes('patient')) return '👤';
    if (action.toLowerCase().includes('referral')) return '📋';
    if (action.toLowerCase().includes('override')) return '⚠️';
    return '📝';
};

// Get action color
const getActionColor = (action: string): string => {
    if (action.toLowerCase().includes('ai')) return 'text-purple-600 dark:text-purple-400';
    if (action.toLowerCase().includes('state')) return 'text-blue-600 dark:text-blue-400';
    if (action.toLowerCase().includes('override')) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-muted-foreground';
};
</script>

<template>
    <div class="border-t border-sidebar-border/70 bg-muted/30">
        <div class="px-4 py-2">
            <!-- Activity Log -->
            <div class="flex items-center gap-6 overflow-x-auto">
                <!-- Recent Entries -->
                <div
                    v-for="(entry, index) in recentEntries"
                    :key="index"
                    class="flex items-center gap-2 text-sm whitespace-nowrap"
                >
                    <span class="text-xs text-muted-foreground">{{ formatTime(entry.timestamp) }}</span>
                    <span>{{ getActionIcon(entry.action) }}</span>
                    <span :class="cn('font-medium', getActionColor(entry.action))">
                        {{ entry.action }}
                    </span>
                    <span class="text-muted-foreground">|</span>
                    <span class="text-muted-foreground">{{ entry.user }}</span>
                </div>

                <!-- Empty State -->
                <div
                    v-if="recentEntries.length === 0"
                    class="flex items-center gap-2 text-sm text-muted-foreground"
                >
                    <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>No recent activity</span>
                </div>
            </div>

            <!-- Status Indicators -->
            <div class="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                <div class="flex items-center gap-1">
                    <div class="w-2 h-2 rounded-full bg-green-500"></div>
                    <span>System Online</span>
                </div>
                <div class="flex items-center gap-1">
                    <div class="w-2 h-2 rounded-full bg-blue-500"></div>
                    <span>AI Gateway Active</span>
                </div>
                <div class="flex items-center gap-1">
                    <div class="w-2 h-2 rounded-full bg-green-500"></div>
                    <span>Sync Connected</span>
                </div>
            </div>
        </div>
    </div>
</template>
