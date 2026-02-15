import type { RuleExplanation, ActionLabel } from '~/types/explainability';

export const RULE_EXPLANATIONS: Record<string, RuleExplanation> = {
  red_danger: {
    id: 'red_danger',
    description: 'Presence of general danger signs',
    whoReference: 'WHO IMCI 2014 - Danger Signs',
    clinicalMeaning: 'Immediate life-threatening condition requiring urgent intervention'
  },
  red_distress: {
    id: 'red_distress',
    description: 'Severe respiratory distress detected',
    whoReference: 'WHO IMCI 2014 - Respiratory',
    clinicalMeaning: 'Severe respiratory compromise requiring immediate oxygen and referral'
  },
  red_cyanosis: {
    id: 'red_cyanosis',
    description: 'Cyanosis observed',
    whoReference: 'WHO IMCI 2014 - Danger Sign',
    clinicalMeaning: 'Severe hypoxemia indicating critical oxygen deprivation'
  },
  red_unconscious: {
    id: 'red_unconscious',
    description: 'Unconscious or lethargic',
    whoReference: 'WHO IMCI 2014 - Danger Sign',
    clinicalMeaning: 'Neurological emergency requiring immediate assessment'
  },
  red_convulsions: {
    id: 'red_convulsions',
    description: 'Convulsions currently or recently',
    whoReference: 'WHO IMCI 2014 - Danger Sign',
    clinicalMeaning: 'Active seizures or recent seizure activity - neurological emergency'
  },
  yellow_pneumonia: {
    id: 'yellow_pneumonia',
    description: 'Signs consistent with pneumonia',
    whoReference: 'WHO IMCI 2014 - Pneumonia',
    clinicalMeaning: 'Respiratory infection requiring antibiotic treatment and follow-up'
  },
  yellow_danger: {
    id: 'yellow_danger',
    description: 'Some danger signs present',
    whoReference: 'WHO IMCI 2014 - Danger Signs',
    clinicalMeaning: 'Requires prompt attention but not immediately life-threatening'
  },
  yellow_dehydration: {
    id: 'yellow_dehydration',
    description: 'Signs of dehydration present',
    whoReference: 'WHO IMCI 2014 - Dehydration',
    clinicalMeaning: 'Fluid loss requiring rehydration therapy'
  },
  yellow_fever: {
    id: 'yellow_fever',
    description: 'High fever with risk factors',
    whoReference: 'WHO IMCI 2014 - Fever',
    clinicalMeaning: 'Fever requiring assessment and possible malaria testing'
  },
  green_no_pneumonia: {
    id: 'green_no_pneumonia',
    description: 'No clinical danger signs detected',
    whoReference: 'WHO IMCI 2014 - Classification',
    clinicalMeaning: 'No urgent intervention needed - provide home care advice'
  },
  green_cough: {
    id: 'green_cough',
    description: 'Cough without pneumonia signs',
    whoReference: 'WHO IMCI 2014 - Cough',
    clinicalMeaning: 'Viral respiratory infection - symptomatic treatment at home'
  },
  green_diarrhea: {
    id: 'green_diarrhea',
    description: 'Diarrhea without dehydration',
    whoReference: 'WHO IMCI 2014 - Diarrhea',
    clinicalMeaning: 'No dehydration - continue feeding and give ORS'
  }
};

export const ACTION_LABELS: Record<string, ActionLabel> = {
  urgent_referral: {
    code: 'urgent_referral',
    label: 'Refer urgently to hospital',
    justification: 'Required for severe illness classification',
    whoReference: 'WHO IMCI - Emergency Signs'
  },
  oxygen_if_available: {
    code: 'oxygen_if_available',
    label: 'Provide oxygen if available',
    justification: 'For hypoxemia or respiratory distress',
    whoReference: 'WHO IMCI - Oxygen Therapy'
  },
  first_dose_antibiotics: {
    code: 'first_dose_antibiotics',
    label: 'Give first dose of antibiotics',
    justification: 'For severe bacterial infection before referral',
    whoReference: 'WHO IMCI - Antibiotics'
  },
  iv_fluids: {
    code: 'iv_fluids',
    label: 'Start IV fluids',
    justification: 'For severe dehydration or shock',
    whoReference: 'WHO IMCI - IV Fluids'
  },
  manage_airway: {
    code: 'manage_airway',
    label: 'Ensure airway is clear',
    justification: 'Primary survey - airway comes first',
    whoReference: 'WHO IMCI - Emergency'
  },
  stop_convulsions: {
    code: 'stop_convulsions',
    label: 'Manage seizures',
    justification: 'Active convulsions require immediate treatment',
    whoReference: 'WHO IMCI - Convulsions'
  },
  oral_antibiotics: {
    code: 'oral_antibiotics',
    label: 'Prescribe oral antibiotics',
    justification: 'For confirmed bacterial infection',
    whoReference: 'WHO IMCI - Antibiotics'
  },
  rehydration_ors: {
    code: 'rehydration_ors',
    label: 'Give ORS solution',
    justification: 'For dehydration - replace fluid loss',
    whoReference: 'WHO IMCI - ORS'
  },
  zinc_supplementation: {
    code: 'zinc_supplementation',
    label: 'Give zinc supplements',
    justification: 'Reduces duration and severity of diarrhea',
    whoReference: 'WHO IMCI - Zinc'
  },
  home_care_advice: {
    code: 'home_care_advice',
    label: 'Provide home care advice',
    justification: 'For non-urgent cases',
    whoReference: 'WHO IMCI - Home Care'
  },
  follow_up_2_days: {
    code: 'follow_up_2_days',
    label: 'Follow up in 2 days',
    justification: 'For conditions requiring monitoring',
    whoReference: 'WHO IMCI - Follow-up'
  },
  follow_up_5_days: {
    code: 'follow_up_5_days',
    label: 'Follow up in 5 days',
    justification: 'For conditions requiring monitoring',
    whoReference: 'WHO IMCI - Follow-up'
  },
  return_if_worse: {
    code: 'return_if_worse',
    label: 'Return if symptoms worsen',
    justification: 'Standard caregiver instruction',
    whoReference: 'WHO IMCI - Caregiver Education'
  },
  malaria_test: {
    code: 'malaria_test',
    label: 'Test for malaria',
    justification: 'Fever requires malaria assessment',
    whoReference: 'WHO IMCI - Malaria'
  },
  paracetamol: {
    code: 'paracetamol',
    label: 'Give paracetamol for fever',
    justification: 'Symptomatic treatment for high fever',
    whoReference: 'WHO IMCI - Paracetamol'
  },
  keep_warm: {
    code: 'keep_warm',
    label: 'Keep child warm',
    justification: 'For hypothermia prevention',
    whoReference: 'WHO IMCI - Thermal Care'
  },
  breastfeeding: {
    code: 'breastfeeding',
    label: 'Continue breastfeeding',
    justification: 'Important for nutrition and hydration',
    whoReference: 'WHO IMCI - Feeding'
  }
};

export const CLINICAL_TERMS_MAP: Record<string, string> = {
  cyanosis: 'bluish discoloration of skin indicating low oxygen',
  retractions: 'chest muscles pulling in during breathing - sign of respiratory distress',
  lethargic: 'unusually sleepy or difficult to wake',
  unconscious: 'not awake and not responding',
  convulsions: 'involuntary muscle spasms (seizures)',
  tachypnea: 'abnormally rapid breathing',
  chest_indrawing: 'skin pulling into chest wall when breathing in',
  nasal_flaring: 'nostrils widening when breathing',
  grunting: 'sound made when breathing out - sign of distress',
  hypoxemia: 'low oxygen level in blood',
  dehydration: 'loss of body fluids'
};

export const PRIORITY_CONFIG = {
  red: {
    color: '#E53935',
    icon: '🚨',
    label: 'Emergency',
    actionsRequired: ['urgent_referral']
  },
  yellow: {
    color: '#FBC02D',
    icon: '⚠️',
    label: 'Urgent',
    actionsRequired: ['follow_up_2_days', 'oral_antibiotics']
  },
  green: {
    color: '#43A047',
    icon: '✅',
    label: 'Non-Urgent',
    actionsRequired: ['home_care_advice', 'return_if_worse']
  }
};
