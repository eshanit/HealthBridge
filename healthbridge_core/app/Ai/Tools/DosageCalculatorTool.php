<?php

namespace App\Ai\Tools;

use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Ai\Contracts\Tool;
use Laravel\Ai\Tools\Request;

/**
 * Dosage Calculator Tool
 *
 * Provides pediatric and adult medication dosage calculations based on
 * weight, age, and clinical guidelines. This tool can be called by AI
 * agents to verify or calculate appropriate medication dosages.
 *
 * @see https://laravel.com/docs/ai#tools
 */
class DosageCalculatorTool implements Tool
{
    /**
     * Common medication dosage rules (mg/kg/day or fixed doses).
     * In production, this would be loaded from a database or external API.
     */
    protected array $medicationRules = [
        'amoxicillin' => [
            'standard' => ['dose' => 25, 'unit' => 'mg/kg/dose', 'frequency' => 'every 8 hours', 'max_per_dose' => 500],
            'severe' => ['dose' => 45, 'unit' => 'mg/kg/dose', 'frequency' => 'every 12 hours', 'max_per_dose' => 875],
        ],
        'paracetamol' => [
            'standard' => ['dose' => 15, 'unit' => 'mg/kg/dose', 'frequency' => 'every 4-6 hours', 'max_per_dose' => 1000, 'max_daily' => 4000],
        ],
        'ibuprofen' => [
            'standard' => ['dose' => 10, 'unit' => 'mg/kg/dose', 'frequency' => 'every 6-8 hours', 'max_per_dose' => 400, 'max_daily' => 1200],
        ],
        'azithromycin' => [
            'standard' => ['dose' => 10, 'unit' => 'mg/kg/day', 'frequency' => 'once daily', 'max_per_dose' => 500, 'duration' => '3-5 days'],
        ],
        'co-trimoxazole' => [
            'standard' => ['dose' => 4, 'unit' => 'mg/kg/dose (trimethoprim)', 'frequency' => 'every 12 hours', 'max_per_dose' => 160],
        ],
        'artemether-lumefantrine' => [
            'standard' => ['dose' => 'weight_based', 'unit' => 'tablets', 'frequency' => 'per protocol', 'note' => 'Dose by weight band per WHO guidelines'],
        ],
        'oral_rehydration' => [
            'standard' => ['dose' => 'volume_based', 'unit' => 'ml', 'frequency' => 'after each loose stool', 'note' => 'Calculate based on dehydration severity'],
        ],
    ];

    /**
     * Get the tool description.
     */
    public function description(): string
    {
        return 'Calculate appropriate medication dosages based on patient weight, age, and clinical indication. Returns dosage information including dose amount, frequency, and maximum limits.';
    }

    /**
     * Handle the tool invocation.
     *
     * @param Request $request The tool request with medication, weight, and age
     * @return string JSON-encoded dosage calculation result
     */
    public function handle(Request $request): string
    {
        $medication = strtolower($request->get('medication', ''));
        $weightKg = (float) $request->get('weight_kg', 0);
        $ageMonths = (int) $request->get('age_months', null);
        $indication = $request->get('indication', 'standard');
        $renalImpairment = $request->get('renal_impairment', false);
        $hepaticImpairment = $request->get('hepatic_impairment', false);

        // Validate inputs
        if (empty($medication)) {
            return json_encode([
                'success' => false,
                'error' => 'Medication name is required',
            ]);
        }

        if ($weightKg <= 0) {
            return json_encode([
                'success' => false,
                'error' => 'Valid weight in kg is required',
            ]);
        }

        // Check if medication is in our database
        if (!isset($this->medicationRules[$medication])) {
            return json_encode([
                'success' => false,
                'error' => "Medication '{$medication}' not found in dosage database",
                'available_medications' => array_keys($this->medicationRules),
            ]);
        }

        // Get the dosage rule
        $rule = $this->medicationRules[$medication][$indication] 
            ?? $this->medicationRules[$medication]['standard'];

        // Calculate dosage
        $result = $this->calculateDosage($rule, $weightKg, $ageMonths);

        // Apply adjustments for organ impairment
        if ($renalImpairment || $hepaticImpairment) {
            $result = $this->applyOrganAdjustments($result, $medication, $renalImpairment, $hepaticImpairment);
        }

        // Add warnings
        $result['warnings'] = $this->getWarnings($medication, $weightKg, $ageMonths);

        return json_encode($result, JSON_PRETTY_PRINT);
    }

    /**
     * Define the tool's input schema.
     */
    public function schema(JsonSchema $schema): array
    {
        return [
            'medication' => $schema->string()->required()
                ->description('The medication name (e.g., "amoxicillin", "paracetamol")'),
            'weight_kg' => $schema->number()->required()->min(0.5)->max(200)
                ->description('Patient weight in kilograms'),
            'age_months' => $schema->integer()->min(0)->max(1200)
                ->description('Patient age in months (optional, for age-specific dosing)'),
            'indication' => $schema->string()
                ->enum(['standard', 'severe', 'prophylaxis'])
                ->description('Clinical indication affecting dosage'),
            'renal_impairment' => $schema->boolean()
                ->description('Whether patient has renal impairment'),
            'hepatic_impairment' => $schema->boolean()
                ->description('Whether patient has hepatic impairment'),
        ];
    }

    /**
     * Calculate the actual dosage based on the rule and patient parameters.
     */
    protected function calculateDosage(array $rule, float $weightKg, ?int $ageMonths): array
    {
        $result = [
            'success' => true,
            'medication' => ucfirst($rule['unit'] ?? 'mg'),
            'weight_used' => $weightKg,
            'calculation_method' => 'weight_based',
        ];

        // Handle special cases
        if (isset($rule['dose']) && $rule['dose'] === 'weight_based') {
            // Weight-band dosing (e.g., antimalarials)
            $result['dosing_type'] = 'weight_band';
            $result['instruction'] = $rule['note'] ?? 'Refer to weight-band dosing table';
            $result['requires_manual_verification'] = true;
            return $result;
        }

        if (isset($rule['dose']) && $rule['dose'] === 'volume_based') {
            // Volume-based dosing (e.g., ORS)
            $result['dosing_type'] = 'volume_based';
            $result['instruction'] = $rule['note'] ?? 'Calculate based on dehydration severity';
            $result['requires_manual_verification'] = true;
            return $result;
        }

        // Standard weight-based calculation
        $dosePerKg = (float) $rule['dose'];
        $calculatedDose = $dosePerKg * $weightKg;

        // Apply maximum per dose
        $maxPerDose = $rule['max_per_dose'] ?? PHP_FLOAT_MAX;
        $actualDose = min($calculatedDose, $maxPerDose);

        // Round to practical dose
        $actualDose = $this->roundToPracticalDose($actualDose);

        $result['calculated_dose'] = [
            'amount' => $actualDose,
            'unit' => 'mg',
            'frequency' => $rule['frequency'] ?? 'as directed',
            'calculated_as' => "{$dosePerKg} mg/kg × {$weightKg} kg = {$calculatedDose} mg",
            'capped_at_max' => $calculatedDose > $maxPerDose,
        ];

        if (isset($rule['max_daily'])) {
            $result['calculated_dose']['max_daily_dose'] = $rule['max_daily'] . ' mg';
        }

        if (isset($rule['duration'])) {
            $result['calculated_dose']['duration'] = $rule['duration'];
        }

        return $result;
    }

    /**
     * Round dose to a practical amount.
     */
    protected function roundToPracticalDose(float $dose): float
    {
        // Round to nearest 5mg for doses under 100mg, nearest 10mg for larger
        if ($dose < 100) {
            return round($dose / 5) * 5;
        }
        return round($dose / 10) * 10;
    }

    /**
     * Apply dosage adjustments for organ impairment.
     */
    protected function applyOrganAdjustments(array $result, string $medication, bool $renal, bool $hepatic): array
    {
        $adjustments = [];

        // Known adjustment rules
        $adjustmentRules = [
            'amoxicillin' => [
                'renal' => ['severe' => 'Extend interval to every 12-24 hours'],
            ],
            'co-trimoxazole' => [
                'renal' => ['moderate_severe' => 'Avoid or reduce dose by 50%'],
            ],
            'ibuprofen' => [
                'renal' => ['any' => 'Use with caution; may worsen renal function'],
                'hepatic' => ['any' => 'Use with caution; may worsen hepatic function'],
            ],
        ];

        if (isset($adjustmentRules[$medication])) {
            if ($renal && isset($adjustmentRules[$medication]['renal'])) {
                $adjustments[] = 'Renal adjustment: ' . array_values($adjustmentRules[$medication]['renal'])[0];
            }
            if ($hepatic && isset($adjustmentRules[$medication]['hepatic'])) {
                $adjustments[] = 'Hepatic adjustment: ' . array_values($adjustmentRules[$medication]['hepatic'])[0];
            }
        }

        if (!empty($adjustments)) {
            $result['organ_adjustments'] = $adjustments;
            $result['requires_physician_review'] = true;
        }

        return $result;
    }

    /**
     * Get warnings for the medication.
     */
    protected function getWarnings(string $medication, float $weightKg, ?int $ageMonths): array
    {
        $warnings = [];

        // Age-based warnings
        if ($ageMonths !== null) {
            if ($ageMonths < 2 && $medication === 'ibuprofen') {
                $warnings[] = 'Ibuprofen is generally not recommended for infants under 2 months';
            }
            if ($ageMonths < 1 && $medication === 'paracetamol') {
                $warnings[] = 'Use caution with paracetamol in neonates; consider reduced dose';
            }
        }

        // Weight-based warnings
        if ($weightKg < 5) {
            $warnings[] = 'Low body weight; verify dose carefully and consider specialist consultation';
        }

        // Medication-specific warnings
        $medicationWarnings = [
            'amoxicillin' => ['Complete full course', 'Take with or without food'],
            'co-trimoxazole' => ['Ensure adequate hydration', 'May cause photosensitivity'],
            'artemether-lumefantrine' => ['Take with fatty food for better absorption', 'Complete full 3-day course'],
        ];

        if (isset($medicationWarnings[$medication])) {
            $warnings = array_merge($warnings, $medicationWarnings[$medication]);
        }

        return $warnings;
    }
}
