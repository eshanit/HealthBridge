<script setup lang="ts">
/**
 * Patient Summary Card Component
 * Displays patient information retrieved from CPT lookup
 */

import { computed } from 'vue';
import { format } from 'date-fns';
import type { ClinicalPatient } from '~/types/patient';
import TWCard from '~/components/ui/TWCard.vue';
import TWButton from '~/components/ui/TWButton.vue';

interface Props {
  patient: ClinicalPatient;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'startVisit'): void;
  (e: 'viewRecord'): void;
  (e: 'clear'): void;
}>();

/**
 * Format age from months to readable format
 */
function formatAge(months: number): string {
  if (months < 12) {
    return `${months} month${months !== 1 ? 's' : ''}`;
  }
  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;
  if (remainingMonths === 0) {
    return `${years} year${years !== 1 ? 's' : ''}`;
  }
  return `${years}y ${remainingMonths}m`;
}

/**
 * Format date for display
 */
function formatDate(timestamp: string): string {
  try {
    return format(new Date(timestamp), 'MMM d, yyyy');
  } catch {
    return 'Unknown';
  }
}

/**
 * Get patient display name
 */
const patientName = computed(() => {
  const first = props.patient.firstName || '';
  const last = props.patient.lastName || '';
  if (first && last) {
    return `${first} ${last}`;
  }
  return first || last || 'Unknown';
});

/**
 * Patient ID display
 */
const patientId = computed(() => {
  return props.patient.cpt || 'N/A';
});
</script>

<template>
  <div class="patient-summary-card">
    <TWCard class="summary-card">
      <template #header>
        <div class="card-header">
          <div class="patient-icon">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <div class="header-info">
            <h3 class="patient-name">{{ patientName }}</h3>
            <span class="cpt-badge">{{ patient.cpt }}</span>
          </div>
          <button class="clear-button" @click="emit('clear')" title="Clear selection">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </template>

      <div class="patient-details">
        <div class="detail-row" v-if="patient.dateOfBirth">
          <span class="detail-label">Date of Birth</span>
          <span class="detail-value">{{ formatDate(patient.dateOfBirth) }}</span>
        </div>

        <div class="detail-row" v-if="patient.gender">
          <span class="detail-label">Gender</span>
          <span class="detail-value capitalize">{{ patient.gender }}</span>
        </div>

        <div class="detail-row" v-if="patient.phone">
          <span class="detail-label">Phone</span>
          <span class="detail-value">{{ patient.phone }}</span>
        </div>

        <div class="detail-row" v-if="patient.visitCount !== undefined">
          <span class="detail-label">Visits</span>
          <span class="detail-value">{{ patient.visitCount }}</span>
        </div>

        <div class="detail-row" v-if="patient.updatedAt">
          <span class="detail-label">Last Updated</span>
          <span class="detail-value">{{ formatDate(patient.updatedAt) }}</span>
        </div>
      </div>

      <div class="action-buttons">
        <TWButton
          variant="solid"
          color="primary"
          @click="emit('startVisit')"
          class="primary-action"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          Start New Visit
        </TWButton>

        <TWButton
          variant="outline"
          @click="emit('viewRecord')"
          class="secondary-action"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          View Record
        </TWButton>
      </div>
    </TWCard>
  </div>
</template>

<style scoped>
.patient-summary-card {
  width: 100%;
}

.summary-card {
  border: 1px solid #374151;
  background: #1f2937;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 0;
}

.patient-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background: #3b82f6;
  border-radius: 8px;
  color: white;
}

.header-info {
  flex: 1;
}

.patient-name {
  font-size: 1.125rem;
  font-weight: 600;
  color: white;
  margin: 0;
}

.cpt-badge {
  display: inline-block;
  padding: 2px 8px;
  background: #374151;
  border-radius: 4px;
  font-family: monospace;
  font-size: 0.875rem;
  color: #9ca3af;
  margin-top: 4px;
}

.clear-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: #9ca3af;
  cursor: pointer;
  transition: all 0.2s;
}

.clear-button:hover {
  background: #374151;
  color: #ef4444;
}

.patient-details {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 0;
  border-top: 1px solid #374151;
  border-bottom: 1px solid #374151;
  margin: 16px 0;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.detail-label {
  font-size: 0.875rem;
  color: #9ca3af;
}

.detail-value {
  font-size: 0.875rem;
  color: white;
  font-weight: 500;
}

.detail-value.capitalize {
  text-transform: capitalize;
}

.action-buttons {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.primary-action,
.secondary-action {
  width: 100%;
  justify-content: center;
}
</style>
