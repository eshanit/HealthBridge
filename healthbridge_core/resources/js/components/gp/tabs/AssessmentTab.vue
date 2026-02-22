<script setup lang="ts">
import { ref, reactive } from 'vue';
import { router } from '@inertiajs/vue3';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

interface Patient {
    id: string;
    cpt: string;
    name: string;
    age: number | null;
    gender: string | null;
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

interface Props {
    patient: Patient;
    readOnly?: boolean;
    sessionCouchId?: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
    (e: 'tabChange', tab: string): void;
}>();

// Form state
const assessment = reactive({
    chief_complaint: '',
    history_present_illness: '',
    past_medical_history: '',
    allergies: '',
    current_medications: '',
    review_of_systems: '',
    physical_exam: '',
    assessment_notes: '',
});

const symptoms = ref<string[]>([]);
const examFindings = ref<string[]>([]);
const isSaving = ref(false);

// Common symptoms for pediatric patients
const commonSymptoms = [
    'Fever',
    'Cough',
    'Difficulty breathing',
    'Diarrhea',
    'Vomiting',
    'Poor feeding',
    'Lethargy',
    'Seizures',
    'Rash',
    'Abdominal pain',
];

// Common exam findings
const commonExamFindings = [
    'Chest indrawing',
    'Stridor',
    'Wheezing',
    'Cyanosis',
    'Dehydration',
    'Pallor',
    'Jaundice',
    'Lymphadenopathy',
    'Hepatomegaly',
    'Splenomegaly',
];

const toggleSymptom = (symptom: string) => {
    const index = symptoms.value.indexOf(symptom);
    if (index > -1) {
        symptoms.value.splice(index, 1);
    } else {
        symptoms.value.push(symptom);
    }
};

const toggleExamFinding = (finding: string) => {
    const index = examFindings.value.indexOf(finding);
    if (index > -1) {
        examFindings.value.splice(index, 1);
    } else {
        examFindings.value.push(finding);
    }
};

const saveAssessment = async () => {
    if (!props.sessionCouchId) {
        console.error('No session CouchDB ID provided');
        return;
    }
    
    isSaving.value = true;
    
    router.post(`/gp/sessions/${props.sessionCouchId}/assessment`, {
        ...assessment,
        symptoms: symptoms.value,
        exam_findings: examFindings.value,
    }, {
        preserveScroll: true,
        onSuccess: () => {
            // Emit event to change to diagnostics tab
            emit('tabChange', 'diagnostics');
        },
        onFinish: () => {
            isSaving.value = false;
        },
    });
};
</script>

<template>
    <div class="space-y-4">
        <!-- Chief Complaint -->
        <Card>
            <CardHeader class="pb-2">
                <CardTitle class="text-lg">Chief Complaint</CardTitle>
            </CardHeader>
            <CardContent>
                <Textarea
                    v-model="assessment.chief_complaint"
                    placeholder="Enter the main reason for the visit..."
                    rows="2"
                    :disabled="readOnly"
                />
            </CardContent>
        </Card>

        <!-- Symptoms -->
        <Card>
            <CardHeader class="pb-2">
                <CardTitle class="text-lg">Symptoms</CardTitle>
            </CardHeader>
            <CardContent>
                <div class="flex flex-wrap gap-2 mb-3">
                    <Button
                        v-for="symptom in commonSymptoms"
                        :key="symptom"
                        :variant="symptoms.includes(symptom) ? 'default' : 'outline'"
                        size="sm"
                        :disabled="readOnly"
                        @click="toggleSymptom(symptom)"
                    >
                        {{ symptom }}
                    </Button>
                </div>
                <div class="text-sm text-muted-foreground">
                    Selected: {{ symptoms.length > 0 ? symptoms.join(', ') : 'None' }}
                </div>
            </CardContent>
        </Card>

        <!-- History of Present Illness -->
        <Card>
            <CardHeader class="pb-2">
                <CardTitle class="text-lg">History of Present Illness</CardTitle>
            </CardHeader>
            <CardContent>
                <Textarea
                    v-model="assessment.history_present_illness"
                    placeholder="Describe the onset, duration, progression, and associated symptoms..."
                    rows="4"
                    :disabled="readOnly"
                />
            </CardContent>
        </Card>

        <!-- Physical Exam -->
        <Card>
            <CardHeader class="pb-2">
                <CardTitle class="text-lg">Physical Examination</CardTitle>
            </CardHeader>
            <CardContent>
                <div class="mb-4">
                    <Label class="text-sm text-muted-foreground mb-2 block">Common Findings</Label>
                    <div class="flex flex-wrap gap-2">
                        <Button
                            v-for="finding in commonExamFindings"
                            :key="finding"
                            :variant="examFindings.includes(finding) ? 'default' : 'outline'"
                            size="sm"
                            :disabled="readOnly"
                            @click="toggleExamFinding(finding)"
                        >
                            {{ finding }}
                        </Button>
                    </div>
                </div>
                <div>
                    <Label class="text-sm text-muted-foreground mb-2 block">Detailed Notes</Label>
                    <Textarea
                        v-model="assessment.physical_exam"
                        placeholder="Enter detailed physical examination findings..."
                        rows="4"
                        :disabled="readOnly"
                    />
                </div>
            </CardContent>
        </Card>

        <!-- Past Medical History -->
        <Card>
            <CardHeader class="pb-2">
                <CardTitle class="text-lg">Past Medical History</CardTitle>
            </CardHeader>
            <CardContent class="space-y-4">
                <div>
                    <Label>Previous Medical Conditions</Label>
                    <Textarea
                        v-model="assessment.past_medical_history"
                        placeholder="Any previous illnesses, hospitalizations, surgeries..."
                        rows="2"
                        :disabled="readOnly"
                    />
                </div>
                <div>
                    <Label>Allergies</Label>
                    <Textarea
                        v-model="assessment.allergies"
                        placeholder="Known allergies (medications, food, environmental)..."
                        rows="2"
                        :disabled="readOnly"
                    />
                </div>
                <div>
                    <Label>Current Medications</Label>
                    <Textarea
                        v-model="assessment.current_medications"
                        placeholder="Current medications and dosages..."
                        rows="2"
                        :disabled="readOnly"
                    />
                </div>
            </CardContent>
        </Card>

        <!-- Assessment Notes -->
        <Card>
            <CardHeader class="pb-2">
                <CardTitle class="text-lg">Assessment Notes</CardTitle>
            </CardHeader>
            <CardContent>
                <Textarea
                    v-model="assessment.assessment_notes"
                    placeholder="Clinical impression, differential diagnosis, working diagnosis..."
                    rows="4"
                    :disabled="readOnly"
                />
            </CardContent>
        </Card>

        <!-- Save Button -->
        <div v-if="!readOnly" class="flex justify-end gap-2">
            <Button variant="outline">
                Save Draft
            </Button>
            <Button :disabled="isSaving" @click="saveAssessment">
                {{ isSaving ? 'Saving...' : 'Save Assessment' }}
            </Button>
        </div>
    </div>
</template>
