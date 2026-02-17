/**
 * Patient Registration Composable
 * 
 * Vue Composition API for patient registration workflow.
 * Handles form state, validation, CPT preview, and submission.
 * 
 * Features:
 * - Reactive form data with validation
 * - Real-time CPT preview during registration
 * - Form validation per field
 * - Error handling with user-friendly messages
 * - Navigation to summary on success
 */

import { ref, computed, reactive } from 'vue';
import { useRouter, useRoute } from '#app';
import { generateCPT } from '~/services/patientId';
import { registerPatient, getPatientByCPT } from '~/services/patientEngine';
import type {
  PatientRegistrationData,
  ClinicalPatient,
  PatientGender,
  PatientAddress,
  EmergencyContact,
  InsuranceInfo
} from '~/types/patient';
import { setSessionPatient } from '~/composables/useSessionPatient';

// ============================================
// Types
// ============================================

/**
 * Form field errors
 */
interface FormErrors {
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  gender?: string;
  phone?: string;
  email?: string;
  general?: string;
}

/**
 * Registration form state
 */
interface RegistrationFormState {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: PatientGender | '';
  phone: string;
  email: string;
  weightKg: string;  // Store as string for input, convert to number on submit
  address: {
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  emergencyContact: {
    name: string;
    relationship: string;
    phone: string;
  };
  insuranceInfo: {
    provider: string;
    policyNumber: string;
    groupNumber: string;
  };
}

// ============================================
// Composable
// ============================================

/**
 * Patient Registration Composable
 */
export function usePatientRegistration() {
  const router = useRouter();
  const route = useRoute();
  const toast = useToast();
  
  // ============================================
  // State
  // ============================================
  
  /**
   * Session ID from route (for linking)
   */
  const sessionId = computed(() => route.params.sessionId as string | undefined);
  
  /**
   * Form data reactive state
   */
  const form = reactive<RegistrationFormState>({
    firstName: '',
    lastName: '',
    dateOfBirth: '',
    gender: '',
    phone: '',
    email: '',
    weightKg: '',
    address: {
      street: '',
      city: '',
      state: '',
      postalCode: '',
      country: ''
    },
    emergencyContact: {
      name: '',
      relationship: '',
      phone: ''
    },
    insuranceInfo: {
      provider: '',
      policyNumber: '',
      groupNumber: ''
    }
  });
  
  /**
   * Field errors
   */
  const errors = reactive<FormErrors>({});
  
  /**
   * Loading state
   */
  const isSubmitting = ref(false);
  
  /**
   * Preview CPT (generated before submission)
   */
  const previewCPT = ref<string>('');
  
  /**
   * CPT generation loading
   */
  const isGeneratingCPT = ref(false);
  
  // ============================================
  // Computed
  // ============================================
  
  /**
   * Full name for display
   */
  const fullName = computed(() => {
    const parts = [form.firstName, form.lastName].filter(Boolean);
    return parts.join(' ') || 'Patient';
  });
  
  /**
   * Check if form has any data
   */
  const hasFormData = computed(() => {
    return !!(
      form.firstName.trim() ||
      form.lastName.trim() ||
      form.phone.trim() ||
      form.email.trim()
    );
  });
  
  /**
   * Form validity
   */
  const isValid = computed(() => {
    return !!(
      form.firstName.trim() &&
      form.lastName.trim() &&
      !errors.firstName &&
      !errors.lastName &&
      !errors.phone &&
      !errors.email
    );
  });
  
  /**
   * Check if patient already exists (by name + DOB)
   */
  const existingPatient = ref<ClinicalPatient | null>(null);
  
  // ============================================
  // Validation
  // ============================================
  
  /**
   * Validate a single field
   */
  function validateField(field: keyof FormErrors): string | undefined {
    switch (field) {
      case 'firstName':
        if (!form.firstName.trim()) {
          return 'First name is required';
        }
        if (form.firstName.trim().length < 2) {
          return 'First name must be at least 2 characters';
        }
        break;
        
      case 'lastName':
        if (!form.lastName.trim()) {
          return 'Last name is required';
        }
        if (form.lastName.trim().length < 2) {
          return 'Last name must be at least 2 characters';
        }
        break;
        
      case 'dateOfBirth':
        if (form.dateOfBirth) {
          const dob = new Date(form.dateOfBirth);
          const now = new Date();
          if (dob > now) {
            return 'Date of birth cannot be in the future';
          }
        }
        break;
        
      case 'phone':
        if (form.phone && !/^\+?[\d\s-()]{7,}$/.test(form.phone)) {
          return 'Please enter a valid phone number';
        }
        break;
        
      case 'email':
        if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
          return 'Please enter a valid email address';
        }
        break;
    }
    
    return undefined;
  }
  
  /**
   * Validate all fields
   */
  function validateAll(): boolean {
    errors.firstName = validateField('firstName');
    errors.lastName = validateField('lastName');
    errors.dateOfBirth = validateField('dateOfBirth');
    errors.phone = validateField('phone');
    errors.email = validateField('email');
    
    return !errors.firstName && 
           !errors.lastName && 
           !errors.phone && 
           !errors.email;
  }
  
  /**
   * Clear specific field error on input
   */
  function clearError(field: keyof FormErrors): void {
    if (errors[field]) {
      errors[field] = undefined;
    }
  }
  
  // ============================================
  // CPT Generation
  // ============================================
  
  /**
   * Generate preview CPT
   */
  async function generatePreviewCPT(): Promise<void> {
    isGeneratingCPT.value = true;
    
    try {
      previewCPT.value = generateCPT();
    } catch (error) {
      console.error('Failed to generate CPT:', error);
      toast.add({
        title: 'Error',
        description: 'Failed to generate patient ID',
        color: 'error'
      });
    } finally {
      isGeneratingCPT.value = false;
    }
  }
  
  /**
   * Initialize preview CPT on mount
   */
  async function initializePreviewCPT(): Promise<void> {
    await generatePreviewCPT();
  }
  
  // ============================================
  // Duplicate Check
  // ============================================
  
  /**
   * Check if patient already exists
   */
  async function checkForExistingPatient(): Promise<boolean> {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      return false;
    }
    
    try {
      // Search by name
      const results = await import('~/services/patientEngine').then(
        m => m.searchPatients({ 
          name: `${form.firstName.trim()} ${form.lastName.trim()}` 
        })
      );
      
      // Check DOB match if provided
      if (form.dateOfBirth && results.length > 0) {
        const match = results.find(p => 
          p.dateOfBirth === form.dateOfBirth && 
          p.firstName.toLowerCase() === form.firstName.toLowerCase() &&
          p.lastName.toLowerCase() === form.lastName.toLowerCase()
        );
        
        if (match) {
          existingPatient.value = match;
          return true;
        }
      }
      
      // Check phone match
      if (form.phone && results.length > 0) {
        const match = results.find(p => p.phone === form.phone);
        
        if (match) {
          existingPatient.value = match;
          return true;
        }
      }
      
      existingPatient.value = null;
      return false;
      
    } catch (error) {
      console.error('Error checking for existing patient:', error);
      return false;
    }
  }
  
  // ============================================
  // Submission
  // ============================================
  
  /**
   * Submit registration
   */
  async function submitRegistration(): Promise<{
    success: boolean;
    patient?: ClinicalPatient;
    error?: string;
  }> {
    // Validate form
    if (!validateAll()) {
      toast.add({
        title: 'Validation Error',
        description: 'Please fix the errors above',
        color: 'warning'
      });
      return { success: false, error: 'Validation failed' };
    }
    
    isSubmitting.value = true;
    errors.general = undefined;
    
    try {
      // Check for existing patient
      const exists = await checkForExistingPatient();
      if (exists && existingPatient.value) {
        toast.add({
          title: 'Patient Exists',
          description: `This patient already has CPT: ${existingPatient.value.cpt}`,
          color: 'warning'
        });
        
        return {
          success: false,
          error: 'Patient already exists',
          patient: existingPatient.value
        };
      }
      
      // Prepare data
      // Parse weight - handle both string and number types from form input
      const weightValue = form.weightKg;
      const parsedWeight = typeof weightValue === 'string' 
        ? parseFloat(weightValue) 
        : weightValue;
      const weightKg = weightValue && !isNaN(parsedWeight) ? parsedWeight : undefined;
      
      const data: PatientRegistrationData = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        dateOfBirth: form.dateOfBirth || undefined,
        gender: form.gender || undefined,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        weightKg,
        address: form.address.street ? form.address : undefined,
        emergencyContact: form.emergencyContact.name ? form.emergencyContact : undefined,
        insuranceInfo: form.insuranceInfo.provider ? form.insuranceInfo : undefined
      };
      
      // Register patient
      const patient = await registerPatient(data);
      
      // Success
      toast.add({
        title: 'Registration Complete',
        description: `Patient registered with CPT: ${patient.cpt}`,
        color: 'success'
      });
      
      // Save patient data to sessionStorage for persistence
      if (sessionId.value) {
        setSessionPatient(sessionId.value, patient);
        
        // Link to session and go to summary
        const { linkPatientToSession } = await import('~/services/patientEngine');
        await linkPatientToSession(sessionId.value, patient.cpt);
        router.push(`/sessions/${sessionId.value}/summary`);
      } else {
        // Just show success
        router.push('/dashboard');
      }
      
      // Reset form
      resetForm();
      
      return { success: true, patient };
      
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Registration failed';
      
      errors.general = message;
      
      toast.add({
        title: 'Registration Failed',
        description: message,
        color: 'error'
      });
      
      return { success: false, error: message };
      
    } finally {
      isSubmitting.value = false;
    }
  }
  
  // ============================================
  // Form Management
  // ============================================
  
  /**
   * Reset form to initial state
   */
  function resetForm(): void {
    form.firstName = '';
    form.lastName = '';
    form.dateOfBirth = '';
    form.gender = '';
    form.phone = '';
    form.email = '';
    form.weightKg = '';
    form.address = {
      street: '',
      city: '',
      state: '',
      postalCode: '',
      country: ''
    };
    form.emergencyContact = {
      name: '',
      relationship: '',
      phone: ''
    };
    form.insuranceInfo = {
      provider: '',
      policyNumber: '',
      groupNumber: ''
    };
    
    errors.firstName = undefined;
    errors.lastName = undefined;
    errors.dateOfBirth = undefined;
    errors.gender = undefined;
    errors.phone = undefined;
    errors.email = undefined;
    errors.general = undefined;
    
    existingPatient.value = null;
    
    // Generate new preview CPT
    generatePreviewCPT();
  }
  
  /**
   * Populate form from existing patient data
   */
  function populateFromPatient(patient: ClinicalPatient): void {
    form.firstName = patient.firstName;
    form.lastName = patient.lastName;
    form.dateOfBirth = patient.dateOfBirth || '';
    form.gender = patient.gender || '';
    form.phone = patient.phone || '';
    form.email = patient.email || '';
    
    if (patient.address) {
      form.address = {
        street: patient.address.street || '',
        city: patient.address.city || '',
        state: patient.address.state || '',
        postalCode: patient.address.postalCode || '',
        country: patient.address.country || ''
      };
    }
    
    if (patient.emergencyContact) {
      form.emergencyContact = {
        name: patient.emergencyContact.name || '',
        relationship: patient.emergencyContact.relationship || '',
        phone: patient.emergencyContact.phone || ''
      };
    }
    
    if (patient.insuranceInfo) {
      form.insuranceInfo = {
        provider: patient.insuranceInfo.provider || '',
        policyNumber: patient.insuranceInfo.policyNumber || '',
        groupNumber: patient.insuranceInfo.groupNumber || ''
      };
    }
  }
  
  // ============================================
  // Return
  // ============================================
  
  return {
    // State
    form,
    errors,
    isSubmitting,
    previewCPT,
    isGeneratingCPT,
    existingPatient,
    sessionId,
    
    // Computed
    fullName,
    hasFormData,
    isValid,
    
    // Validation
    validateField,
    validateAll,
    clearError,
    
    // CPT
    generatePreviewCPT,
    initializePreviewCPT,
    
    // Duplicate check
    checkForExistingPatient,
    
    // Submission
    submitRegistration,
    
    // Form management
    resetForm,
    populateFromPatient
  };
}
