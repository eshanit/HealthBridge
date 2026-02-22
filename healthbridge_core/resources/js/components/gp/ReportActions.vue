<script setup lang="ts">
import { ref, computed } from 'vue';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface Props {
    sessionCouchId: string;
    patientCpt?: string;
    patientName?: string;
    hasReferral?: boolean;
    workflowState?: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
    (e: 'reportGenerated', type: string, data: ReportResult): void;
    (e: 'error', message: string): void;
}>();

interface ReportResult {
    success: boolean;
    pdf?: string;
    html?: string;
    filename?: string;
    mime_type?: string;
    size?: number;
    error?: string;
}

// State
const isGenerating = ref(false);
const isDownloading = ref(false);
const showPreview = ref(false);
const previewHtml = ref('');
const previewType = ref('');
const lastGeneratedReport = ref<ReportResult | null>(null);
const storedReports = ref<StoredReport[]>([]);
const notification = ref<{ type: 'success' | 'error'; message: string } | null>(null);

interface StoredReport {
    id: string;
    type: string;
    filename: string;
    generated_at: string;
    generated_by: string;
    size: number;
}

// Simple notification helper
const showNotification = (type: 'success' | 'error', message: string) => {
    notification.value = { type, message };
    setTimeout(() => {
        notification.value = null;
    }, 3000);
};

// Report types
const reportTypes = [
    {
        id: 'discharge',
        label: 'Discharge Summary',
        icon: '📄',
        description: 'Complete discharge summary with treatment plan',
        color: 'bg-green-500',
    },
    {
        id: 'handover',
        label: 'Clinical Handover (SBAR)',
        icon: '📋',
        description: 'SBAR format handover for shift change',
        color: 'bg-blue-500',
    },
    {
        id: 'referral',
        label: 'Referral Report',
        icon: '🏥',
        description: 'Referral documentation for specialist',
        color: 'bg-purple-500',
        disabled: !props.hasReferral,
    },
    {
        id: 'comprehensive',
        label: 'Comprehensive Report',
        icon: '📊',
        description: 'Full clinical report with AI content',
        color: 'bg-orange-500',
    },
];

// Computed
const canGenerate = computed(() => {
    return props.sessionCouchId && !isGenerating.value;
});

// Methods
const getCsrfToken = (): string => {
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.getAttribute('content') || '' : '';
};

const generateReport = async (type: string) => {
    if (!canGenerate.value) return;

    isGenerating.value = true;
    previewType.value = type;

    try {
        const response = await fetch(`/gp/reports/sessions/${props.sessionCouchId}/${type}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-CSRF-TOKEN': getCsrfToken(),
            },
            body: JSON.stringify({
                patient_cpt: props.patientCpt,
            }),
        });

        const result: ReportResult = await response.json();

        if (result.success) {
            lastGeneratedReport.value = result;
            
            showNotification('success', `${getTypeLabel(type)} has been generated successfully.`);

            emit('reportGenerated', type, result);

            // Refresh stored reports list
            await loadStoredReports();
        } else {
            throw new Error(result.error || 'Failed to generate report');
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to generate report';
        
        showNotification('error', message);

        emit('error', message);
    } finally {
        isGenerating.value = false;
    }
};

const downloadReport = async (type: string) => {
    isDownloading.value = true;

    try {
        const response = await fetch(`/gp/reports/sessions/${props.sessionCouchId}/download/${type}`);
        
        if (!response.ok) {
            throw new Error('Failed to download report');
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `${type}_report_${props.sessionCouchId.slice(-8)}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        URL.revokeObjectURL(url);

        showNotification('success', 'Your PDF is being downloaded.');
    } catch (error) {
        showNotification('error', 'Failed to download the report.');
    } finally {
        isDownloading.value = false;
    }
};

const previewReport = async (type: string) => {
    isGenerating.value = true;
    previewType.value = type;

    try {
        const response = await fetch(`/gp/reports/sessions/${props.sessionCouchId}/preview/${type}`);
        const result = await response.json();

        if (result.success) {
            previewHtml.value = result.html;
            showPreview.value = true;
        } else {
            throw new Error(result.error || 'Failed to generate preview');
        }
    } catch (error) {
        showNotification('error', 'Failed to generate preview.');
    } finally {
        isGenerating.value = false;
    }
};

const downloadStoredReport = async (reportId: string, filename: string) => {
    try {
        const response = await fetch(`/gp/reports/stored/${reportId}`);
        
        if (!response.ok) {
            throw new Error('Failed to download report');
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        URL.revokeObjectURL(url);
    } catch (error) {
        showNotification('error', 'Failed to download the stored report.');
    }
};

const loadStoredReports = async () => {
    try {
        const response = await fetch(`/gp/reports/sessions/${props.sessionCouchId}/stored`);
        const result = await response.json();

        if (result.success) {
            storedReports.value = result.reports;
        }
    } catch (error) {
        console.error('Failed to load stored reports:', error);
    }
};

const getTypeLabel = (type: string): string => {
    const report = reportTypes.find(r => r.id === type);
    return report?.label || type;
};

const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleString();
};

// Load stored reports on mount
loadStoredReports();
</script>

<template>
    <Card>
        <CardHeader class="pb-3">
            <CardTitle class="text-lg flex items-center justify-between">
                <span class="flex items-center gap-2">
                    <svg class="h-5 w-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Reports
                </span>
                <DropdownMenu>
                    <DropdownMenuTrigger as-child>
                        <Button size="sm" :disabled="!canGenerate">
                            <svg class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                            </svg>
                            Generate
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" class="w-64">
                        <DropdownMenuLabel>Select Report Type</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            v-for="report in reportTypes"
                            :key="report.id"
                            :disabled="report.disabled"
                            @click="generateReport(report.id)"
                            class="flex items-start gap-3 p-3"
                        >
                            <div :class="cn('w-8 h-8 rounded-md flex items-center justify-center text-white text-sm', report.color)">
                                {{ report.icon }}
                            </div>
                            <div class="flex-1">
                                <div class="font-medium">{{ report.label }}</div>
                                <div class="text-xs text-muted-foreground">{{ report.description }}</div>
                            </div>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </CardTitle>
        </CardHeader>
        <CardContent>
            <!-- Notification -->
            <div v-if="notification" :class="cn(
                'mb-4 p-3 rounded-lg text-sm',
                notification.type === 'success' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200'
            )">
                {{ notification.message }}
            </div>

            <!-- Loading State -->
            <div v-if="isGenerating" class="flex items-center justify-center py-8">
                <div class="flex flex-col items-center gap-3">
                    <div class="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
                    <p class="text-sm text-muted-foreground">Generating {{ getTypeLabel(previewType) }}...</p>
                </div>
            </div>

            <!-- Quick Actions -->
            <div v-else class="space-y-4">
                <!-- Quick Generate Buttons -->
                <div class="grid grid-cols-2 gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        @click="generateReport('discharge')"
                        class="justify-start"
                    >
                        <span class="mr-2">📄</span>
                        Discharge
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        @click="generateReport('handover')"
                        class="justify-start"
                    >
                        <span class="mr-2">📋</span>
                        Handover
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        @click="generateReport('referral')"
                        :disabled="!hasReferral"
                        class="justify-start"
                    >
                        <span class="mr-2">🏥</span>
                        Referral
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        @click="generateReport('comprehensive')"
                        class="justify-start"
                    >
                        <span class="mr-2">📊</span>
                        Full Report
                    </Button>
                </div>

                <!-- Last Generated Report -->
                <div v-if="lastGeneratedReport" class="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-sm font-medium text-green-800 dark:text-green-200">
                                {{ getTypeLabel(previewType) }} Generated
                            </p>
                            <p class="text-xs text-green-600 dark:text-green-400">
                                {{ formatFileSize(lastGeneratedReport.size || 0) }}
                            </p>
                        </div>
                        <div class="flex gap-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                @click="previewReport(previewType)"
                            >
                                Preview
                            </Button>
                            <Button
                                variant="default"
                                size="sm"
                                @click="downloadReport(previewType)"
                            >
                                Download
                            </Button>
                        </div>
                    </div>
                </div>

                <!-- Stored Reports -->
                <div v-if="storedReports.length > 0" class="space-y-2">
                    <h4 class="text-sm font-medium text-muted-foreground">Previous Reports</h4>
                    <div class="space-y-1">
                        <div
                            v-for="report in storedReports"
                            :key="report.id"
                            class="flex items-center justify-between p-2 rounded-md bg-muted/50 hover:bg-muted transition-colors"
                        >
                            <div class="flex items-center gap-2">
                                <span class="text-lg">
                                    {{ report.type === 'discharge' ? '📄' : report.type === 'handover' ? '📋' : report.type === 'referral' ? '🏥' : '📊' }}
                                </span>
                                <div>
                                    <p class="text-sm font-medium">{{ getTypeLabel(report.type) }}</p>
                                    <p class="text-xs text-muted-foreground">
                                        {{ formatDate(report.generated_at) }} by {{ report.generated_by }}
                                    </p>
                                </div>
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                @click="downloadStoredReport(report.id, report.filename)"
                            >
                                <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                            </Button>
                        </div>
                    </div>
                </div>

                <!-- Empty State -->
                <div v-else class="text-center py-4 text-muted-foreground">
                    <svg class="h-8 w-8 mx-auto mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p class="text-sm">No reports generated yet</p>
                </div>
            </div>

            <!-- Preview Dialog -->
            <Dialog v-model:open="showPreview">
                <DialogContent class="max-w-4xl max-h-[80vh] overflow-hidden">
                    <DialogHeader>
                        <DialogTitle>{{ getTypeLabel(previewType) }} Preview</DialogTitle>
                        <DialogDescription>
                            Preview of the report for {{ patientName || patientCpt }}
                        </DialogDescription>
                    </DialogHeader>
                    <div class="overflow-auto h-[60vh] border rounded-lg">
                        <iframe
                            v-if="previewHtml"
                            :srcdoc="previewHtml"
                            class="w-full h-full border-0"
                        />
                    </div>
                    <div class="flex justify-end gap-2 mt-4">
                        <Button variant="outline" @click="showPreview = false">
                            Close
                        </Button>
                        <Button @click="downloadReport(previewType)">
                            <svg class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            Download PDF
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </CardContent>
    </Card>
</template>
