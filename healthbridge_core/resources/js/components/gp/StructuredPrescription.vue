<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';

interface Medication {
    id: string;
    name: string;
    dose: string;
    route: string;
    frequency: string;
    duration: string;
    instructions?: string;
}

interface Props {
    sessionCouchId: string;
    initialMedications?: Medication[];
}

const props = withDefaults(defineProps<Props>(), {
    initialMedications: () => [],
});

const emit = defineEmits<{
    (e: 'update', medications: Medication[]): void;
    (e: 'save', medications: Medication[]): void;
    (e: 'tabChange', tab: string): void;
}>();

// Local state
const medications = ref<Medication[]>([...props.initialMedications]);
const isAddingNew = ref(false);
const isSaving = ref(false);

// New medication form
const newMed = ref<Omit<Medication, 'id'>>({
    name: '',
    dose: '',
    route: 'oral',
    frequency: '',
    duration: '',
    instructions: '',
});

// Route options
const routeOptions = [
    { value: 'oral', label: 'Oral' },
    { value: 'iv', label: 'IV' },
    { value: 'im', label: 'IM (Intramuscular)' },
    { value: 'sc', label: 'SC (Subcutaneous)' },
    { value: 'topical', label: 'Topical' },
    { value: 'inhalation', label: 'Inhalation' },
    { value: 'nasal', label: 'Nasal' },
    { value: 'rectal', label: 'Rectal' },
];

// Frequency options
const frequencyOptions = [
    { value: 'once', label: 'Once' },
    { value: 'bd', label: 'Twice daily (BD)' },
    { value: 'tds', label: 'Three times daily (TDS)' },
    { value: 'qds', label: 'Four times daily (QDS)' },
    { value: 'q4h', label: 'Every 4 hours' },
    { value: 'q6h', label: 'Every 6 hours' },
    { value: 'q8h', label: 'Every 8 hours' },
    { value: 'daily', label: 'Once daily' },
    { value: 'weekly', label: 'Once weekly' },
    { value: 'prn', label: 'As needed (PRN)' },
];

// Duration options
const durationOptions = [
    { value: '3 days', label: '3 days' },
    { value: '5 days', label: '5 days' },
    { value: '7 days', label: '7 days' },
    { value: '10 days', label: '10 days' },
    { value: '14 days', label: '14 days' },
    { value: '21 days', label: '21 days' },
    { value: '28 days', label: '28 days' },
    { value: '30 days', label: '30 days' },
    { value: 'ongoing', label: 'Ongoing' },
];

// Generate unique ID
const generateId = (): string => {
    return `med_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Add medication
const addMedication = () => {
    if (!newMed.value.name || !newMed.value.dose) {
        return;
    }

    const medication: Medication = {
        id: generateId(),
        ...newMed.value,
    };

    medications.value.push(medication);
    
    // Reset form
    newMed.value = {
        name: '',
        dose: '',
        route: 'oral',
        frequency: '',
        duration: '',
        instructions: '',
    };
    
    isAddingNew.value = false;
    emit('update', medications.value);
};

// Remove medication
const removeMedication = (id: string) => {
    medications.value = medications.value.filter(m => m.id !== id);
    emit('update', medications.value);
};

// Get CSRF token from meta tag
const getCsrfToken = (): string => {
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.getAttribute('content') || '' : '';
};

// Save prescription and navigate to Reports tab
const saveTreatmentPlan = async () => {
    if (medications.value.length === 0) {
        return;
    }
    
    isSaving.value = true;
    
    try {
        const response = await fetch(`/gp/prescriptions/sessions/${props.sessionCouchId}/save-and-redirect`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-CSRF-TOKEN': getCsrfToken(),
            },
            body: JSON.stringify({
                medications: medications.value.map(med => ({
                    name: med.name,
                    dose: med.dose,
                    route: med.route,
                    frequency: med.frequency,
                    duration: med.duration,
                    instructions: med.instructions,
                })),
            }),
        });

        const result = await response.json();

        if (result.success) {
            emit('save', medications.value);
            // Navigate to Reports tab
            emit('tabChange', 'reports');
        } else {
            console.error('Failed to save prescription:', result.error || result.message);
            // Show error to user
            alert('Failed to save prescription: ' + (result.error || result.message));
        }
    } catch (error) {
        console.error('Failed to save prescription:', error);
    } finally {
        isSaving.value = false;
    }
};

// Get route label
const getRouteLabel = (value: string): string => {
    return routeOptions.find(r => r.value === value)?.label || value;
};

// Get frequency label
const getFrequencyLabel = (value: string): string => {
    return frequencyOptions.find(f => f.value === value)?.label || value;
};

// Watch for external changes
watch(() => props.initialMedications, (newMeds) => {
    medications.value = [...newMeds];
}, { deep: true });
</script>

<template>
    <div class="space-y-4">
        <!-- Medications Table -->
        <div v-if="medications.length > 0" class="rounded-md border">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead class="w-[200px]">Medication</TableHead>
                        <TableHead class="w-[100px]">Dose</TableHead>
                        <TableHead class="w-[120px]">Route</TableHead>
                        <TableHead class="w-[150px]">Frequency</TableHead>
                        <TableHead class="w-[100px]">Duration</TableHead>
                        <TableHead class="w-[50px]"></TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    <TableRow v-for="med in medications" :key="med.id">
                        <TableCell class="font-medium">{{ med.name }}</TableCell>
                        <TableCell>{{ med.dose }}</TableCell>
                        <TableCell>
                            <Badge variant="outline">{{ getRouteLabel(med.route) }}</Badge>
                        </TableCell>
                        <TableCell>{{ getFrequencyLabel(med.frequency) }}</TableCell>
                        <TableCell>{{ med.duration }}</TableCell>
                        <TableCell>
                            <Button
                                variant="ghost"
                                size="sm"
                                class="h-8 w-8 p-0 text-destructive hover:text-destructive"
                                @click="removeMedication(med.id)"
                            >
                                <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                            </Button>
                        </TableCell>
                    </TableRow>
                </TableBody>
            </Table>
        </div>

        <!-- Empty State -->
        <div v-else class="text-center py-8 text-muted-foreground border rounded-md">
            <svg class="h-12 w-12 mx-auto mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
            <p class="text-sm">No medications prescribed yet</p>
            <p class="text-xs mt-1">Click "Add Medication" to start a prescription</p>
        </div>

        <!-- Add Medication Form -->
        <Card v-if="isAddingNew">
            <CardHeader>
                <CardTitle class="text-base">Add Medication</CardTitle>
            </CardHeader>
            <CardContent>
                <form @submit.prevent="addMedication" class="space-y-4">
                    <div class="grid grid-cols-2 gap-4">
                        <div class="space-y-2">
                            <Label for="med-name">Medication Name *</Label>
                            <Input
                                id="med-name"
                                v-model="newMed.name"
                                placeholder="e.g., Amoxicillin"
                                required
                            />
                        </div>
                        <div class="space-y-2">
                            <Label for="med-dose">Dose *</Label>
                            <Input
                                id="med-dose"
                                v-model="newMed.dose"
                                placeholder="e.g., 250mg"
                                required
                            />
                        </div>
                    </div>

                    <div class="grid grid-cols-3 gap-4">
                        <div class="space-y-2">
                            <Label for="med-route">Route</Label>
                            <Select v-model="newMed.route">
                                <SelectTrigger id="med-route">
                                    <SelectValue placeholder="Select route" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem
                                        v-for="option in routeOptions"
                                        :key="option.value"
                                        :value="option.value"
                                    >
                                        {{ option.label }}
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div class="space-y-2">
                            <Label for="med-frequency">Frequency</Label>
                            <Select v-model="newMed.frequency">
                                <SelectTrigger id="med-frequency">
                                    <SelectValue placeholder="Select frequency" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem
                                        v-for="option in frequencyOptions"
                                        :key="option.value"
                                        :value="option.value"
                                    >
                                        {{ option.label }}
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div class="space-y-2">
                            <Label for="med-duration">Duration</Label>
                            <Select v-model="newMed.duration">
                                <SelectTrigger id="med-duration">
                                    <SelectValue placeholder="Select duration" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem
                                        v-for="option in durationOptions"
                                        :key="option.value"
                                        :value="option.value"
                                    >
                                        {{ option.label }}
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div class="space-y-2">
                        <Label for="med-instructions">Special Instructions</Label>
                        <Input
                            id="med-instructions"
                            v-model="newMed.instructions"
                            placeholder="e.g., Take with food, Shake well before use"
                        />
                    </div>

                    <div class="flex justify-end gap-2">
                        <Button type="button" variant="outline" @click="isAddingNew = false">
                            Cancel
                        </Button>
                        <Button type="submit" :disabled="!newMed.name || !newMed.dose">
                            Add Medication
                        </Button>
                    </div>
                </form>
            </CardContent>
        </Card>

        <!-- Action Buttons -->
        <div class="flex justify-between items-center">
            <Button
                v-if="!isAddingNew"
                variant="outline"
                @click="isAddingNew = true"
            >
                <svg class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                </svg>
                Add Medication
            </Button>
            <div v-else></div>

            <Button
                v-if="medications.length > 0"
                @click="saveTreatmentPlan"
                :disabled="isSaving"
            >
                <svg v-if="isSaving" class="animate-spin h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                {{ isSaving ? 'Saving...' : 'Save Prescription' }}
            </Button>
        </div>
    </div>
</template>
