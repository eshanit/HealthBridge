<template>
  <div class="patient-registration">
    <!-- Header -->
    <TWCard class="registration-header">
      <div class="header-content">
        <div class="header-icon">
          <TWIcon name="heroicons:user-plus" size="xl" />
        </div>
        <div class="header-text">
          <h2 class="header-title">Patient Registration</h2>
          <p class="header-subtitle">Register a new patient or update existing record</p>
        </div>
        <div v-if="previewCPT" class="cpt-preview">
          <span class="cpt-label">Patient ID</span>
          <span class="cpt-value">{{ previewCPT }}</span>
        </div>
      </div>
    </TWCard>
    
    <!-- Existing Patient Warning -->
    <TWAlert
      v-if="existingPatient"
      color="warning"
      title="Patient Exists"
      class="existing-patient-alert"
    >
      <template #icon>
        <TWIcon name="heroicons:exclamation-triangle" />
      </template>
      <div class="existing-patient-info">
        <p>
          A patient with similar information already exists:
          <strong>{{ existingPatient ? getPatientFullName(existingPatient) : '' }}</strong>
          <br>
          CPT: <code>{{ existingPatient?.cpt }}</code>
        </p>
        <p class="existing-patient-action">
          Would you like to link this session to the existing patient instead?
        </p>
      </div>
      <div class="existing-patient-actions">
        <TWButton
          variant="outline"
          color="warning"
          @click="useExistingPatient"
        >
          Use Existing Patient
        </TWButton>
        <TWButton
          variant="solid"
          color="primary"
          @click="registerNewPatient"
        >
          Register as New Patient
        </TWButton>
      </div>
    </TWAlert>
    
    <!-- Main Form -->
    <form @submit.prevent="handleSubmit">
      <div class="form-grid">
        <!-- Required Section -->
        <TWCard class="form-section">
          <template #header>
            <div class="section-header">
              <TWIcon name="heroicons:asterisk" class="required-icon" />
              <h3>Required Information</h3>
            </div>
          </template>
          
          <div class="form-row">
            <div class="form-group">
              <label for="firstName">
                First Name <span class="required">*</span>
              </label>
              <input
                id="firstName"
                v-model="form.firstName"
                type="text"
                :class="['form-input', { 'has-error': errors.firstName }]"
                placeholder="Enter first name"
                @input="handleFirstNameInput"
                @blur="handleFirstNameBlur"
              />
              <span v-if="errors.firstName" class="error-message">
                {{ errors.firstName }}
              </span>
            </div>
            
            <div class="form-group">
              <label for="lastName">
                Last Name <span class="required">*</span>
              </label>
              <input
                id="lastName"
                v-model="form.lastName"
                type="text"
                :class="['form-input', { 'has-error': errors.lastName }]"
                placeholder="Enter last name"
                @input="handleLastNameInput"
                @blur="handleLastNameBlur"
              />
              <span v-if="errors.lastName" class="error-message">
                {{ errors.lastName }}
              </span>
            </div>
          </div>
          
          <div class="form-row">
            <div class="form-group">
              <label for="dateOfBirth">Date of Birth</label>
              <input
                id="dateOfBirth"
                v-model="form.dateOfBirth"
                type="date"
                class="form-input"
                :max="today"
                @input="handleDateOfBirthInput"
              />
            </div>
            
            <div class="form-group">
              <label for="gender">Gender</label>
              <select
                id="gender"
                v-model="form.gender"
                class="form-input"
              >
                <option value="">Select gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
                <option value="prefer-not-to-say">Prefer not to say</option>
              </select>
            </div>
          </div>
          
          <div class="form-row">
            <div class="form-group">
              <label for="weightKg">
                Weight <span class="optional-badge">Optional</span>
              </label>
              <div class="input-with-unit">
                <input
                  id="weightKg"
                  v-model="form.weightKg"
                  type="number"
                  step="0.1"
                  min="0.5"
                  max="500"
                  class="form-input"
                  placeholder="e.g., 12.5"
                  @input="handleWeightInput"
                />
                <span class="input-unit">kg</span>
              </div>
              <span class="field-hint">Enter weight in kilograms (0.5 - 500 kg)</span>
            </div>
            
            <div class="form-group">
              <label for="phone">Phone Number</label>
              <input
                id="phone"
                v-model="form.phone"
                type="tel"
                :class="['form-input', { 'has-error': errors.phone }]"
                placeholder="+1 (555) 123-4567"
                @input="handlePhoneInput"
                @blur="handlePhoneBlur"
              />
              <span v-if="errors.phone" class="error-message">
                {{ errors.phone }}
              </span>
            </div>
          </div>
            
            <div class="form-group">
              <label for="email">Email Address</label>
              <input
                id="email"
                v-model="form.email"
                type="email"
                :class="['form-input', { 'has-error': errors.email }]"
                placeholder="patient@example.com"
                @input="handleEmailInput"
                @blur="handleEmailBlur"
              />
              <span v-if="errors.email" class="error-message">
                {{ errors.email }}
              </span>
            </div>
          </div>
        </TWCard>
        
        <!-- Address Section (Optional) -->
        <TWCard class="form-section">
          <template #header>
            <div class="section-header optional">
              <TWIcon name="heroicons:map-pin" />
              <h3>Address</h3>
              <span class="optional-badge">Optional</span>
            </div>
          </template>
          
          <div class="form-group">
            <label for="street">Street Address</label>
            <input
              id="street"
              v-model="form.address.street"
              type="text"
              class="form-input"
              placeholder="123 Main Street"
            />
          </div>
          
          <div class="form-row three-col">
            <div class="form-group">
              <label for="city">City</label>
              <input
                id="city"
                v-model="form.address.city"
                type="text"
                class="form-input"
                placeholder="City"
              />
            </div>
            
            <div class="form-group">
              <label for="state">State/Province</label>
              <input
                id="state"
                v-model="form.address.state"
                type="text"
                class="form-input"
                placeholder="State"
              />
            </div>
            
            <div class="form-group">
              <label for="postalCode">Postal Code</label>
              <input
                id="postalCode"
                v-model="form.address.postalCode"
                type="text"
                class="form-input"
                placeholder="12345"
              />
            </div>
          </div>
        </TWCard>
        
        <!-- Emergency Contact Section (Optional) -->
        <TWCard class="form-section">
          <template #header>
            <div class="section-header optional">
              <TWIcon name="heroicons:phone" />
              <h3>Emergency Contact</h3>
              <span class="optional-badge">Optional</span>
            </div>
          </template>
          
          <div class="form-row">
            <div class="form-group">
              <label for="emergencyName">Contact Name</label>
              <input
                id="emergencyName"
                v-model="form.emergencyContact.name"
                type="text"
                class="form-input"
                placeholder="Full name"
              />
            </div>
            
            <div class="form-group">
              <label for="emergencyRelationship">Relationship</label>
              <select
                id="emergencyRelationship"
                v-model="form.emergencyContact.relationship"
                class="form-input"
              >
                <option value="">Select relationship</option>
                <option value="parent">Parent</option>
                <option value="spouse">Spouse</option>
                <option value="sibling">Sibling</option>
                <option value="child">Child</option>
                <option value="friend">Friend</option>
                <option value="guardian">Guardian</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
          
          <div class="form-group">
            <label for="emergencyPhone">Contact Phone</label>
            <input
              id="emergencyPhone"
              v-model="form.emergencyContact.phone"
              type="tel"
              class="form-input"
              placeholder="+1 (555) 123-4567"
            />
          </div>
        </TWCard>
        
        <!-- Insurance Section (Optional) -->
        <TWCard class="form-section">
          <template #header>
            <div class="section-header optional">
              <TWIcon name="heroicons:credit-card" />
              <h3>Insurance Information</h3>
              <span class="optional-badge">Optional</span>
            </div>
          </template>
          
          <div class="form-group">
            <label for="insuranceProvider">Insurance Provider</label>
            <input
              id="insuranceProvider"
              v-model="form.insuranceInfo.provider"
              type="text"
              class="form-input"
              placeholder="e.g., Blue Cross Blue Shield"
            />
          </div>
          
          <div class="form-row">
            <div class="form-group">
              <label for="policyNumber">Policy Number</label>
              <input
                id="policyNumber"
                v-model="form.insuranceInfo.policyNumber"
                type="text"
                class="form-input"
                placeholder="Policy number"
              />
            </div>
            
            <div class="form-group">
              <label for="groupNumber">Group Number</label>
              <input
                id="groupNumber"
                v-model="form.insuranceInfo.groupNumber"
                type="text"
                class="form-input"
                placeholder="Group number"
              />
            </div>
          </div>
        </TWCard>
      </div>
      
      <!-- General Error -->
      <TWAlert
        v-if="errors.general"
        color="error"
        title="Registration Error"
        class="general-error"
      >
        {{ errors.general }}
      </TWAlert>
      
      <!-- Form Actions -->
      <div class="form-actions">
        <TWButton
          type="button"
          variant="outline"
          @click="handleReset"
        >
          Reset Form
        </TWButton>
        
        <TWButton
          type="submit"
          variant="solid"
          color="primary"
          :loading="isSubmitting"
          :disabled="!isValid"
          class="submit-button"
        >
          <template v-if="isSubmitting">
            Registering...
          </template>
          <template v-else>
            Register Patient
          </template>
        </TWButton>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { onMounted, watch, computed } from 'vue';
import { usePatientRegistration } from '~/composables/usePatientRegistration';
import { getPatientFullName } from '~/types/patient';
import TWCard from '~/components/ui/TWCard.vue';
import TWButton from '~/components/ui/TWButton.vue';
import TWIcon from '~/components/ui/TWIcon.vue';
import TWAlert from '~/components/ui/TWAlert.vue';

// ============================================
// Composables
// ============================================

const {
  form,
  errors,
  isSubmitting,
  previewCPT,
  existingPatient,
  isValid,
  validateField,
  clearError,
  initializePreviewCPT,
  submitRegistration,
  resetForm
} = usePatientRegistration();

// ============================================
// Computed
// ============================================

/**
 * Today's date for max date attribute
 */
const today = computed(() => {
  return new Date().toISOString().split('T')[0];
});

// ============================================
// Lifecycle
// ============================================

/**
 * Initialize CPT preview on mount
 */
onMounted(async () => {
  await initializePreviewCPT();
});

// ============================================
// Watchers
// ============================================

/**
 * Check for existing patient when name changes
 */
watch(
  () => [form.firstName, form.lastName, form.dateOfBirth, form.phone],
  async () => {
    if (form.firstName.trim() && form.lastName.trim()) {
      await checkForExistingPatient();
    }
  }
);

// ============================================
// Methods
// ============================================

/**
 * Check for existing patient
 */
async function checkForExistingPatient(): Promise<void> {
  await import('~/composables/usePatientRegistration').then(
    ({ usePatientRegistration }) => usePatientRegistration()
  );
}

/**
 * Handle first name input
 */
function handleFirstNameInput(): void {
  clearError('firstName');
}

/**
 * Handle first name blur validation
 */
function handleFirstNameBlur(): void {
  errors.firstName = validateField('firstName');
}

/**
 * Handle last name input
 */
function handleLastNameInput(): void {
  clearError('lastName');
}

/**
 * Handle last name blur validation
 */
function handleLastNameBlur(): void {
  errors.lastName = validateField('lastName');
}

/**
 * Handle date of birth input
 */
function handleDateOfBirthInput(): void {
  clearError('dateOfBirth');
}

/**
 * Handle weight input
 */
function handleWeightInput(): void {
  // Clear any weight-related errors if we add them later
  // For now, just validate the format
  const weight = parseFloat(form.weightKg);
  if (form.weightKg && (isNaN(weight) || weight < 0.5 || weight > 500)) {
    // Could set an error here if needed
  }
}

/**
 * Handle phone input
 */
function handlePhoneInput(): void {
  clearError('phone');
}

/**
 * Handle phone blur validation
 */
function handlePhoneBlur(): void {
  errors.phone = validateField('phone');
}

/**
 * Handle email input
 */
function handleEmailInput(): void {
  clearError('email');
}

/**
 * Handle email blur validation
 */
function handleEmailBlur(): void {
  errors.email = validateField('email');
}

/**
 * Handle form submission
 */
async function handleSubmit(): Promise<void> {
  await submitRegistration();
}

/**
 * Reset form
 */
function handleReset(): void {
  resetForm();
  initializePreviewCPT();
}

/**
 * Use existing patient
 */
async function useExistingPatient(): Promise<void> {
  const { existingPatient: patient, sessionId: id } = await import('~/composables/usePatientRegistration').then(
    m => ({
      existingPatient: m.usePatientRegistration().existingPatient.value,
      sessionId: m.usePatientRegistration().sessionId.value
    })
  );
  
  if (patient && id) {
    const { linkPatientToSession } = await import('~/services/patientEngine');
    await linkPatientToSession(id, patient.cpt);
    
    navigateTo(`/sessions/${id}/summary`);
  }
}

/**
 * Register as new patient (ignore duplicate warning)
 */
async function registerNewPatient(): Promise<void> {
  // Clear existing patient warning and proceed
  await submitRegistration();
}
</script>

<style scoped>
.patient-registration {
  max-width: 900px;
  margin: 0 auto;
  padding: 1.5rem;
}

.registration-header {
  margin-bottom: 1.5rem;
  background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
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
  flex-shrink: 0;
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

.cpt-preview {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  padding: 0.75rem 1rem;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 8px;
}

.cpt-label {
  font-size: 0.75rem;
  opacity: 0.8;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.cpt-value {
  font-family: 'SF Mono', 'Monaco', 'Inconsolata', monospace;
  font-size: 1.25rem;
  font-weight: 600;
  letter-spacing: 0.1em;
}

.existing-patient-alert {
  margin-bottom: 1.5rem;
}

.existing-patient-info {
  margin-bottom: 1rem;
}

.existing-patient-action {
  margin-top: 0.5rem;
  font-size: 0.9rem;
}

.existing-patient-actions {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.form-grid {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.form-section {
  transition: box-shadow 0.2s ease;
}

.form-section:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.section-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.section-header h3 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
}

.section-header .required-icon {
  color: #ef4444;
}

.section-header.optional .required-icon,
.section-header.optional :global(svg) {
  color: #6b7280;
}

.optional-badge {
  font-size: 0.75rem;
  padding: 0.125rem 0.5rem;
  background: #f3f4f6;
  color: #6b7280;
  border-radius: 9999px;
  margin-left: auto;
}

.form-row {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
}

.form-row.three-col {
  grid-template-columns: repeat(3, 1fr);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.form-group label {
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
}

.required {
  color: #ef4444;
}

.form-input {
  padding: 0.625rem 0.875rem;
  border: 1px solid #d1d5db;
  border-radius: 0.5rem;
  font-size: 0.95rem;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.form-input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
}

.form-input.has-error {
  border-color: #ef4444;
}

.form-input.has-error:focus {
  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.15);
}

.error-message {
  font-size: 0.8rem;
  color: #ef4444;
}

.general-error {
  margin-top: 1.5rem;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 1.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid #e5e7eb;
}

.submit-button {
  min-width: 160px;
}

/* Weight input styling */
.input-with-unit {
  display: flex;
  align-items: center;
  position: relative;
}

.input-with-unit .form-input {
  padding-right: 3rem;
  flex: 1;
}

.input-unit {
  position: absolute;
  right: 0.75rem;
  color: #6b7280;
  font-size: 0.875rem;
  font-weight: 500;
}

.field-hint {
  font-size: 0.75rem;
  color: #6b7280;
  margin-top: 0.25rem;
}

/* Responsive */
@media (max-width: 640px) {
  .patient-registration {
    padding: 1rem;
  }
  
  .header-content {
    flex-wrap: wrap;
  }
  
  .cpt-preview {
    width: 100%;
    margin-top: 0.75rem;
    align-items: flex-start;
  }
  
  .form-row,
  .form-row.three-col {
    grid-template-columns: 1fr;
  }
  
  .form-actions {
    flex-direction: column;
  }
  
  .submit-button {
    width: 100%;
  }
}
</style>
