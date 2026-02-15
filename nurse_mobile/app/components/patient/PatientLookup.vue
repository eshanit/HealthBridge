<template>
  <div class="patient-lookup">
    <!-- Header -->
    <TWCard class="lookup-header">
      <div class="header-content">
        <div class="header-icon">
          <TWIcon name="heroicons:magnifying-glass" size="xl" />
        </div>
        <div class="header-text">
          <h2 class="header-title">Patient Lookup</h2>
          <p class="header-subtitle">Find patient by 4-character CPT</p>
        </div>
      </div>
    </TWCard>
    
    <!-- Search Input -->
    <TWCard class="search-card">
      <div class="search-container">
        <!-- Mode Tabs -->
        <div class="mode-tabs">
          <button
            v-for="m in modes"
            :key="m.value"
            :class="['mode-tab', { active: mode === m.value }]"
            @click="setMode(m.value)"
          >
            <component :is="m.icon" class="tab-icon" />
            {{ m.label }}
          </button>
        </div>
        
        <!-- Search Input -->
        <div class="search-input-wrapper">
          <input
            v-model="query"
            :type="mode === 'phone' ? 'tel' : 'text'"
            :placeholder="queryHint"
            class="search-input"
            :class="{ 'has-error': hasError }"
            @keyup.enter="handleEnter"
            @input="handleInput"
          />
          <button
            v-if="query"
            class="clear-button"
            @click="clearQuery"
          >
            <TWIcon name="heroicons:x-mark" />
          </button>
          <div v-else class="search-icon">
            <TWIcon name="heroicons:magnifying-glass" />
          </div>
        </div>
        
        <!-- Search Button -->
        <TWButton
          variant="solid"
          color="primary"
          :loading="isSearching"
          :disabled="!isValidQuery"
          @click="immediateSearch"
          class="search-button"
        >
          Search
        </TWButton>
      </div>
      
      <!-- Error Message -->
      <div v-if="hasError" class="error-message">
        <TWIcon name="heroicons:exclamation-circle" />
        {{ error }}
      </div>
    </TWCard>
    
    <!-- Results -->
    <div v-if="results.length > 0" class="results-section">
      <TWCard class="results-card">
        <template #header>
          <div class="results-header">
            <h3 class="results-title">
              Search Results
              <span class="results-count">({{ results.length }})</span>
            </h3>
          </div>
        </template>
        
        <div class="results-list">
          <div
            v-for="patient in results"
            :key="patient.cpt"
            :class="['result-item', { selected: selectedPatient?.cpt === patient.cpt }]"
            @click="selectPatient(patient)"
          >
            <div class="result-avatar">
              <TWIcon name="heroicons:user-circle" size="lg" />
            </div>
            <div class="result-info">
              <div class="result-name">
                {{ getPatientFullName(patient) }}
              </div>
              <div class="result-meta">
                <span class="result-cpt">{{ patient.cpt }}</span>
                <span v-if="patient.phone" class="result-phone">{{ patient.phone }}</span>
              </div>
            </div>
            <div class="result-actions">
              <TWButton
                v-if="sessionId"
                variant="outline"
                size="sm"
                @click.stop="linkToSession(patient)"
              >
                Link to Session
              </TWButton>
              <TWButton
                variant="ghost"
                size="sm"
                @click.stop="navigateToSummary(patient)"
              >
                View
              </TWButton>
            </div>
          </div>
        </div>
      </TWCard>
    </div>
    
    <!-- No Results -->
    <TWAlert
      v-if="hasNoResults"
      color="info"
      title="No Results Found"
      class="no-results-alert"
    >
      <template #icon>
        <TWIcon name="heroicons:user-plus" />
      </template>
      <p>No patients found matching your search criteria.</p>
      <p class="no-results-action">
        Would you like to register this patient?
      </p>
      <TWButton
        variant="solid"
        color="primary"
        @click="navigateToRegistration"
      >
        Register New Patient
      </TWButton>
    </TWAlert>
    
    <!-- Selected Patient -->
    <TWCard v-if="selectedPatient" class="selected-card">
      <template #header>
        <div class="selected-header">
          <TWIcon name="heroicons:check-circle" color="green" />
          <h3>Selected Patient</h3>
        </div>
      </template>
      
      <div class="selected-info">
        <div class="selected-name">{{ getPatientFullName(selectedPatient) }}</div>
        <div class="selected-details">
          <div class="detail-row">
            <span class="detail-label">CPT:</span>
            <code class="detail-value">{{ selectedPatient.cpt }}</code>
          </div>
          <div v-if="selectedPatient.dateOfBirth" class="detail-row">
            <span class="detail-label">DOB:</span>
            <span class="detail-value">{{ formatDate(selectedPatient.dateOfBirth) }}</span>
          </div>
          <div v-if="selectedPatient.phone" class="detail-row">
            <span class="detail-label">Phone:</span>
            <span class="detail-value">{{ selectedPatient.phone }}</span>
          </div>
        </div>
      </div>
      
      <div class="selected-actions">
        <TWButton
          v-if="sessionId"
          variant="solid"
          color="primary"
          @click="linkToSession(selectedPatient)"
        >
          Continue with Session
        </TWButton>
        <TWButton
          variant="outline"
          @click="navigateToSummary(selectedPatient)"
        >
          View Full Record
        </TWButton>
        <TWButton
          variant="ghost"
          @click="clearSelection"
        >
          Clear Selection
        </TWButton>
      </div>
    </TWCard>
    
    <!-- Recent Patients -->
    <TWCard v-if="recentPatients.length > 0 && !query && !selectedPatient" class="recent-card">
      <template #header>
        <div class="recent-header">
          <h3 class="recent-title">Recent Patients</h3>
          <button class="clear-recent" @click="clearRecentPatients">
            Clear
          </button>
        </div>
      </template>
      
      <div class="recent-list">
        <div
          v-for="patient in recentPatients"
          :key="patient.cpt"
          class="recent-item"
          @click="selectFromRecent(patient)"
        >
          <div class="recent-avatar">
            <TWIcon name="heroicons:clock" />
          </div>
          <div class="recent-info">
            <div class="recent-name">{{ getPatientFullName(patient) }}</div>
            <div class="recent-meta">{{ patient.cpt }}</div>
          </div>
        </div>
      </div>
    </TWCard>
  </div>
</template>

<script setup lang="ts">
import { usePatientLookup } from '~/composables/usePatientLookup';
import { getPatientFullName, calculateAge } from '~/types/patient';
import TWCard from '~/components/ui/TWCard.vue';
import TWButton from '~/components/ui/TWButton.vue';
import TWIcon from '~/components/ui/TWIcon.vue';
import TWAlert from '~/components/ui/TWAlert.vue';

// ============================================
// Composables
// ============================================

const {
  query,
  mode,
  results,
  selectedPatient,
  recentPatients,
  isSearching,
  isLoadingCPT,
  error,
  isValidQuery,
  hasNoResults,
  hasError,
  queryHint,
  sessionId,
  lookupByCPT,
  search,
  debouncedSearch,
  immediateSearch,
  selectPatient,
  clearSelection,
  selectFromRecent,
  setMode,
  navigateToRegistration,
  navigateToSummary,
  linkToSession,
  clearQuery,
  loadRecentPatients
} = usePatientLookup({
  showRecent: true,
  onSelect: (patient) => {
    console.log('Patient selected:', patient.cpt);
  }
});

// ============================================
// Mode Configuration
// ============================================

const modes = [
  { value: 'cpt' as const, label: 'CPT', icon: 'heroicons:identification' },
  { value: 'name' as const, label: 'Name', icon: 'heroicons:user' },
  { value: 'phone' as const, label: 'Phone', icon: 'heroicons:phone' }
];

// ============================================
// Lifecycle
// ============================================

onMounted(() => {
  loadRecentPatients();
});

// ============================================
// Methods
// ============================================

/**
 * Handle input based on mode
 */
function handleInput(): void {
  if (mode.value === 'cpt') {
    handleCPTInput();
  } else {
    debouncedSearch(400);
  }
}

/**
 * Handle CPT input with auto-formatting
 */
async function handleCPTInput(): Promise<void> {
    // Auto-uppercase and remove invalid characters
    let formatted = query.value.toUpperCase();
    formatted = formatted.replace(/[^A-Z0-9]/g, '');
    
    query.value = formatted;
    
    // Auto-lookup when complete (4 characters)
    if (formatted.length === 4) {
      await lookupByCPT();
    }
  }

/**
 * Handle enter key
 */
async function handleEnter(): Promise<void> {
    if (mode.value === 'cpt' && query.value.length === 4) {
      await lookupByCPT();
    } else {
      immediateSearch();
    }
  }

/**
 * Clear recent patients
 */
function clearRecentPatients(): void {
  const { clearPatientCache } = require('~/services/patientEngine');
  clearPatientCache();
  recentPatients.value = [];
}

/**
 * Format date for display
 */
function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString();
  } catch {
    return dateStr;
  }
}
</script>

<style scoped>
.patient-lookup {
  max-width: 700px;
  margin: 0 auto;
  padding: 1.5rem;
}

.lookup-header {
  margin-bottom: 1.5rem;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: white;
  border: none;
}

.header-content {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.header-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 12px;
}

.header-text {
  flex: 1;
}

.header-title {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 600;
}

.header-subtitle {
  margin: 0.25rem 0 0;
  opacity: 0.9;
  font-size: 0.95rem;
}

.search-card {
  margin-bottom: 1.5rem;
}

.search-container {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.mode-tabs {
  display: flex;
  gap: 0.5rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid #e5e7eb;
}

.mode-tab {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 1rem;
  border: none;
  background: #f3f4f6;
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 500;
  color: #6b7280;
  cursor: pointer;
  transition: all 0.15s ease;
}

.mode-tab:hover {
  background: #e5e7eb;
}

.mode-tab.active {
  background: #3b82f6;
  color: white;
}

.tab-icon {
  width: 16px;
  height: 16px;
}

.search-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.search-input {
  width: 100%;
  padding: 0.875rem 3rem 0.875rem 1rem;
  border: 2px solid #e5e7eb;
  border-radius: 10px;
  font-size: 1rem;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.search-input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
}

.search-input.has-error {
  border-color: #ef4444;
}

.search-icon {
  position: absolute;
  right: 1rem;
  color: #9ca3af;
}

.clear-button {
  position: absolute;
  right: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  background: #f3f4f6;
  border-radius: 6px;
  color: #6b7280;
  cursor: pointer;
}

.clear-button:hover {
  background: #e5e7eb;
  color: #374151;
}

.search-button {
  align-self: flex-end;
}

.error-message {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.75rem;
  padding: 0.75rem;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
  color: #dc2626;
  font-size: 0.875rem;
}

.results-section {
  margin-bottom: 1.5rem;
}

.results-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.results-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}

.results-count {
  font-weight: 400;
  color: #6b7280;
}

.results-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.result-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.result-item:hover {
  background: #f9fafb;
  border-color: #d1d5db;
}

.result-item.selected {
  background: #eff6ff;
  border-color: #3b82f6;
}

.result-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background: #f3f4f6;
  border-radius: 50%;
  color: #6b7280;
}

.result-info {
  flex: 1;
  min-width: 0;
}

.result-name {
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.result-meta {
  display: flex;
  gap: 0.75rem;
  font-size: 0.8rem;
  color: #6b7280;
}

.result-cpt {
  font-family: 'SF Mono', monospace;
}

.result-actions {
  display: flex;
  gap: 0.5rem;
}

.no-results-alert {
  margin-bottom: 1.5rem;
}

.no-results-action {
  margin: 0.5rem 0 1rem;
}

.selected-card {
  margin-bottom: 1.5rem;
  border-color: #10b981;
  background: linear-gradient(to bottom, #f0fdf4, white);
}

.selected-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.selected-header h3 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: #059669;
}

.selected-info {
  margin-bottom: 1rem;
}

.selected-name {
  font-size: 1.25rem;
  font-weight: 600;
}

.selected-details {
  margin-top: 0.75rem;
}

.detail-row {
  display: flex;
  gap: 0.5rem;
  padding: 0.25rem 0;
  font-size: 0.9rem;
}

.detail-label {
  color: #6b7280;
  min-width: 60px;
}

.detail-value {
  font-weight: 500;
}

.detail-value code {
  padding: 0.125rem 0.375rem;
  background: #f3f4f6;
  border-radius: 4px;
  font-size: 0.85rem;
}

.selected-actions {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.recent-card {
  margin-bottom: 1.5rem;
}

.recent-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.recent-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}

.clear-recent {
  padding: 0.25rem 0.5rem;
  border: none;
  background: none;
  color: #6b7280;
  font-size: 0.8rem;
  cursor: pointer;
}

.clear-recent:hover {
  color: #ef4444;
}

.recent-list {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.recent-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.recent-item:hover {
  background: #f9fafb;
}

.recent-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: #f3f4f6;
  border-radius: 50%;
  color: #9ca3af;
}

.recent-info {
  flex: 1;
  min-width: 0;
}

.recent-name {
  font-weight: 500;
  font-size: 0.9rem;
}

.recent-meta {
  font-size: 0.8rem;
  color: #6b7280;
}

/* Responsive */
@media (max-width: 640px) {
  .patient-lookup {
    padding: 1rem;
  }
  
  .mode-tabs {
    flex-wrap: wrap;
  }
  
  .selected-actions {
    flex-direction: column;
  }
  
  .result-actions {
    flex-direction: column;
  }
}
</style>
