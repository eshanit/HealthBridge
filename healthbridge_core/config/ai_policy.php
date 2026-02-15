<?php

return [

    /*
    |--------------------------------------------------------------------------
    | AI Policy Configuration
    |--------------------------------------------------------------------------
    |
    | This file defines the security policies for the AI Gateway.
    | It controls which roles can perform which AI tasks, and what
    | phrases should be blocked from AI output.
    |
    */

    /*
    |--------------------------------------------------------------------------
    | Blocked Phrases
    |--------------------------------------------------------------------------
    |
    | These phrases are blocked from AI output. If any of these phrases
    | appear in the AI response, they will be redacted or the response
    | will be rejected.
    |
    */
    'deny' => [
        'diagnose',
        'prescribe',
        'dosage',
        'replace doctor',
        'definitive treatment',
        'discharge patient',
        'you should',
        'you must',
        'I recommend',
        'the treatment is',
        'take this medication',
        'stop taking',
    ],

    /*
    |--------------------------------------------------------------------------
    | Warning Phrases
    |--------------------------------------------------------------------------
    |
    | These phrases trigger a warning but don't block the response.
    | They should be reviewed by the safety team.
    |
    */
    'warnings' => [
        'consider',
        'may indicate',
        'possible',
        'suggestive of',
        'could be',
        'might be',
    ],

    /*
    |--------------------------------------------------------------------------
    | Role-Based Task Permissions
    |--------------------------------------------------------------------------
    |
    | Defines which AI tasks each role can perform.
    |
    */
    'roles' => [
        'nurse' => [
            'explain_triage',
            'caregiver_summary',
            'symptom_checklist',
        ],
        'senior-nurse' => [
            'explain_triage',
            'caregiver_summary',
            'symptom_checklist',
            'treatment_review',
        ],
        'doctor' => [
            'specialist_review',
            'red_case_analysis',
            'clinical_summary',
            'handoff_report',
            'explain_triage',
        ],
        'radiologist' => [
            'imaging_interpretation',
            'xray_analysis',
        ],
        'dermatologist' => [
            'skin_lesion_analysis',
            'rash_assessment',
        ],
        'manager' => [],
        'admin' => [],
    ],

    /*
    |--------------------------------------------------------------------------
    | Task Configuration
    |--------------------------------------------------------------------------
    |
    | Defines the configuration for each AI task.
    |
    */
    'tasks' => [
        'explain_triage' => [
            'description' => 'Explain triage classification to nurse',
            'max_tokens' => 500,
            'temperature' => 0.2,
        ],
        'caregiver_summary' => [
            'description' => 'Generate plain-language summary for caregivers',
            'max_tokens' => 400,
            'temperature' => 0.3,
        ],
        'symptom_checklist' => [
            'description' => 'Generate symptom checklist based on chief complaint',
            'max_tokens' => 300,
            'temperature' => 0.2,
        ],
        'treatment_review' => [
            'description' => 'Review treatment plan for completeness',
            'max_tokens' => 600,
            'temperature' => 0.2,
        ],
        'specialist_review' => [
            'description' => 'Generate specialist review summary',
            'max_tokens' => 1000,
            'temperature' => 0.3,
        ],
        'red_case_analysis' => [
            'description' => 'Analyze RED case for specialist review',
            'max_tokens' => 800,
            'temperature' => 0.2,
        ],
        'clinical_summary' => [
            'description' => 'Generate clinical summary',
            'max_tokens' => 600,
            'temperature' => 0.3,
        ],
        'handoff_report' => [
            'description' => 'Generate SBAR-style handoff report',
            'max_tokens' => 700,
            'temperature' => 0.3,
        ],
        'imaging_interpretation' => [
            'description' => 'Text-based imaging interpretation support',
            'max_tokens' => 800,
            'temperature' => 0.2,
        ],
        'xray_analysis' => [
            'description' => 'Text-based X-ray analysis support',
            'max_tokens' => 800,
            'temperature' => 0.2,
        ],
        'skin_lesion_analysis' => [
            'description' => 'Text-based skin lesion analysis support',
            'max_tokens' => 600,
            'temperature' => 0.2,
        ],
        'rash_assessment' => [
            'description' => 'Text-based rash assessment support',
            'max_tokens' => 600,
            'temperature' => 0.2,
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Rate Limiting
    |--------------------------------------------------------------------------
    |
    | Rate limit for AI requests per minute.
    |
    */
    'rate_limit' => env('AI_RATE_LIMIT', 30),

    /*
    |--------------------------------------------------------------------------
    | Ollama Configuration
    |--------------------------------------------------------------------------
    |
    | Configuration for the Ollama API connection.
    | Default model is gemma3:4b for development/testing.
    | For production, consider using medgemma:27b or other medical models.
    |
    */
    'ollama' => [
        'base_url' => env('OLLAMA_BASE_URL', 'http://localhost:11434'),
        'model' => env('OLLAMA_MODEL', 'gemma3:4b'),
        'timeout' => env('OLLAMA_TIMEOUT', 60),
    ],
];
