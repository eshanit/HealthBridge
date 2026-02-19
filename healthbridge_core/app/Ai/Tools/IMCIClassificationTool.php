<?php

namespace App\Ai\Tools;

use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Ai\Contracts\Tool;
use Laravel\Ai\Tools\Request;

/**
 * IMCI Classification Tool
 *
 * Provides Integrated Management of Childhood Illness (IMCI) classifications
 * based on symptoms, signs, and age group. This tool implements WHO IMCI
 * guidelines for children aged 2 months to 5 years.
 *
 * @see https://laravel.com/docs/ai#tools
 * @see https://www.who.int/maternal_child_adolescent/topics/child/imci/en/
 */
class IMCIClassificationTool implements Tool
{
    /**
     * IMCI color codes for classification severity.
     */
    const PINK = 'severe';      // Urgent referral/hospitalization
    const ORANGE = 'moderate';  // Specific medical treatment
    const YELLOW = 'mild';      // Home care with follow-up
    const GREEN = 'no_disease'; // Home care, no follow-up needed

    /**
     * Get the tool description.
     */
    public function description(): string
    {
        return 'Classify childhood illness according to WHO IMCI guidelines. Returns color-coded classification (pink/orange/yellow/green) with recommended actions based on symptoms and signs.';
    }

    /**
     * Handle the tool invocation.
     *
     * @param Request $request The tool request with clinical signs
     * @return string JSON-encoded IMCI classification result
     */
    public function handle(Request $request): string
    {
        $ageMonths = (int) $request->get('age_months', 12);
        $symptoms = $request->get('symptoms', []);
        $signs = $request->get('signs', []);
        $vitals = $request->get('vitals', []);

        // Validate age range for IMCI
        if ($ageMonths < 2 || $ageMonths > 60) {
            return json_encode([
                'success' => false,
                'error' => 'IMCI is applicable for children aged 2 months to 5 years',
                'age_months' => $ageMonths,
                'alternative' => $ageMonths < 2 ? 'Use PSBI (Possible Severe Bacterial Infection) guidelines for young infants' : 'Use adult assessment protocols',
            ]);
        }

        // Classify each IMCI condition
        $classifications = [];

        // 1. Cough or difficult breathing
        if ($this->hasRespiratorySymptoms($symptoms, $signs)) {
            $classifications['cough_difficult_breathing'] = $this->classifyRespiratory($signs, $vitals);
        }

        // 2. Diarrhea
        if ($this->hasDiarrheaSymptoms($symptoms)) {
            $classifications['diarrhea'] = $this->classifyDiarrhea($symptoms, $signs, $vitals);
        }

        // 3. Fever
        if ($this->hasFever($symptoms, $vitals)) {
            $classifications['fever'] = $this->classifyFever($symptoms, $signs, $vitals, $ageMonths);
        }

        // 4. Ear problem
        if ($this->hasEarProblem($symptoms, $signs)) {
            $classifications['ear_problem'] = $this->classifyEarProblem($symptoms, $signs);
        }

        // 5. Measles
        if ($this->hasMeasles($symptoms, $signs)) {
            $classifications['measles'] = $this->classifyMeasles($symptoms, $signs);
        }

        // 6. Malnutrition/Anemia
        $classifications['nutrition'] = $this->classifyNutrition($signs, $vitals, $ageMonths);

        // Determine overall urgency
        $overallClassification = $this->determineOverallClassification($classifications);

        return json_encode([
            'success' => true,
            'age_months' => $ageMonths,
            'age_category' => $this->getAgeCategory($ageMonths),
            'classifications' => $classifications,
            'overall' => $overallClassification,
            'requires_urgent_referral' => $overallClassification['color'] === self::PINK,
            'timestamp' => now()->toIso8601String(),
        ], JSON_PRETTY_PRINT);
    }

    /**
     * Define the tool's input schema.
     */
    public function schema(JsonSchema $schema): array
    {
        return [
            'age_months' => $schema->integer()->required()->min(2)->max(60)
                ->description('Child age in months (IMCI applies to 2 months - 5 years)'),
            'symptoms' => $schema->array()->items($schema->string())
                ->description('Presenting symptoms (e.g., "cough", "diarrhea", "fever")'),
            'signs' => $schema->array()->items($schema->string())
                ->description('Clinical signs observed (e.g., "chest_indrawing", "stridor", "sunken_eyes")'),
            'vitals' => $schema->object([
                'temperature' => $schema->number()->description('Temperature in Celsius'),
                'respiratory_rate' => $schema->integer()->description('Respiratory rate per minute'),
                'weight_kg' => $schema->number()->description('Weight in kilograms'),
                'height_cm' => $schema->number()->description('Length/height in centimeters'),
            ])->description('Vital signs and measurements'),
        ];
    }

    /**
     * Check for respiratory symptoms.
     */
    protected function hasRespiratorySymptoms(array $symptoms, array $signs): bool
    {
        $respiratoryKeywords = ['cough', 'difficult_breathing', 'fast_breathing', 'wheeze', 'stridor'];
        return $this->containsAny($symptoms, $respiratoryKeywords) || 
               $this->containsAny($signs, $respiratoryKeywords);
    }

    /**
     * Classify respiratory illness.
     */
    protected function classifyRespiratory(array $signs, array $vitals): array
    {
        $rr = $vitals['respiratory_rate'] ?? 0;
        $hasChestIndrawing = in_array('chest_indrawing', $signs);
        $hasStridor = in_array('stridor', $signs) || in_array('stridor_at_rest', $signs);
        $hasWheeze = in_array('wheeze', $signs);
        $hasFastBreathing = $rr > 40; // Simplified; actual threshold varies by age

        // PINK: Severe pneumonia or very severe disease
        if ($hasChestIndrawing || $hasStridor) {
            return [
                'color' => self::PINK,
                'classification' => 'Severe pneumonia or very severe disease',
                'signs_present' => array_filter(['chest_indrawing' => $hasChestIndrawing, 'stridor' => $hasStridor]),
                'action' => 'Give first dose of antibiotics. Refer URGENTLY to hospital.',
                'treatment' => [
                    'antibiotic' => 'Amoxicillin or Benzyl penicillin',
                    'oxygen' => 'If available and cyanosis or severe distress',
                    'keep_warm' => true,
                ],
            ];
        }

        // ORANGE: Pneumonia
        if ($hasFastBreathing) {
            return [
                'color' => self::ORANGE,
                'classification' => 'Pneumonia',
                'signs_present' => ['fast_breathing' => true, 'respiratory_rate' => $rr],
                'action' => 'Give oral antibiotic for 5 days. Follow up in 2 days.',
                'treatment' => [
                    'antibiotic' => 'Amoxicillin 25mg/kg/dose every 8 hours for 5 days',
                    'soothe_throat' => 'Warm fluids, honey if over 12 months',
                    'follow_up' => '2 days',
                ],
            ];
        }

        // YELLOW: Cough or cold
        return [
            'color' => self::YELLOW,
            'classification' => 'Cough or cold',
            'signs_present' => ['cough' => true],
            'action' => 'Soothe the throat. Follow up if not improving after 3 days.',
            'treatment' => [
                'antibiotic' => 'Not indicated',
                'home_care' => ['Warm fluids', 'Breastfeed more frequently', 'Clear nose if blocked'],
                'follow_up' => 'Return if: fast breathing, difficulty breathing, fever, or not improving after 3 days',
            ],
        ];
    }

    /**
     * Check for diarrhea symptoms.
     */
    protected function hasDiarrheaSymptoms(array $symptoms): bool
    {
        return in_array('diarrhea', $symptoms) || in_array('loose_stools', $symptoms);
    }

    /**
     * Classify diarrhea.
     */
    protected function classifyDiarrhea(array $symptoms, array $signs, array $vitals): array
    {
        $hasBloodInStool = in_array('blood_in_stool', $symptoms) || in_array('blood_in_stool', $signs);
        $hasSunkenEyes = in_array('sunken_eyes', $signs);
        $hasSkinPinchSlow = in_array('skin_pinch_slow', $signs) || in_array('skin_pinch_very_slow', $signs);
        $hasDrinkingPoorly = in_array('drinking_poorly', $signs) || in_array('unable_to_drink', $signs);
        $hasLethargic = in_array('lethargic', $signs) || in_array('unconscious', $signs);

        // PINK: Severe dehydration or Severe persistent diarrhea or Dysentery
        if ($hasLethargic || $hasDrinkingPoorly || ($hasSunkenEyes && $hasSkinPinchSlow)) {
            return [
                'color' => self::PINK,
                'classification' => 'Severe dehydration',
                'signs_present' => array_filter([
                    'lethargic' => $hasLethargic,
                    'drinking_poorly' => $hasDrinkingPoorly,
                    'sunken_eyes' => $hasSunkenEyes,
                    'skin_pinch_slow' => $hasSkinPinchSlow,
                ]),
                'action' => 'Give IV fluids. Refer URGENTLY to hospital.',
                'treatment' => [
                    'fluids' => 'IV Ringer\'s lactate or normal saline',
                    'protocol' => 'Plan C - Rapid rehydration',
                    'feeding' => 'Continue breastfeeding if possible',
                ],
            ];
        }

        if ($hasBloodInStool) {
            return [
                'color' => self::ORANGE,
                'classification' => 'Dysentery',
                'signs_present' => ['blood_in_stool' => true],
                'action' => 'Give antibiotic for dysentery. Follow up in 2 days.',
                'treatment' => [
                    'antibiotic' => 'Ciprofloxacin or Ceftriaxone (per local guidelines)',
                    'duration' => '3-5 days',
                    'follow_up' => '2 days',
                ],
            ];
        }

        // ORANGE: Some dehydration
        if ($hasSunkenEyes || in_array('skin_pinch_goes_back_slowly', $signs) || in_array('restless_irritable', $signs)) {
            return [
                'color' => self::ORANGE,
                'classification' => 'Some dehydration',
                'signs_present' => array_filter([
                    'sunken_eyes' => $hasSunkenEyes,
                    'skin_pinch_slow' => in_array('skin_pinch_goes_back_slowly', $signs),
                    'restless' => in_array('restless_irritable', $signs),
                ]),
                'action' => 'Give ORS and food. Follow up in 2 days if not improving.',
                'treatment' => [
                    'fluids' => 'ORS - Plan B',
                    'amount' => '75ml/kg over 4 hours, then maintenance',
                    'feeding' => 'Continue breastfeeding, offer food after rehydration',
                    'follow_up' => '2 days',
                ],
            ];
        }

        // YELLOW: No dehydration
        return [
            'color' => self::YELLOW,
            'classification' => 'Diarrhea - no dehydration',
            'signs_present' => ['diarrhea' => true],
            'action' => 'Give extra fluids at home. Follow up if not improving.',
            'treatment' => [
                'fluids' => 'ORS - Plan A - Give extra fluids at home',
                'feeding' => 'Continue breastfeeding, offer food',
                'follow_up' => 'Return if: blood in stool, drinking poorly, or not improving after 3 days',
            ],
        ];
    }

    /**
     * Check for fever.
     */
    protected function hasFever(array $symptoms, array $vitals): bool
    {
        $temp = $vitals['temperature'] ?? 0;
        return in_array('fever', $symptoms) || $temp >= 37.5;
    }

    /**
     * Classify fever.
     */
    protected function classifyFever(array $symptoms, array $signs, array $vitals, int $ageMonths): array
    {
        $temp = $vitals['temperature'] ?? 0;
        $hasHighFever = $temp >= 39;
        $hasStiffNeck = in_array('stiff_neck', $signs);
        $hasBulgingFontanelle = in_array('bulging_fontanelle', $signs);
        $hasMalariaRisk = in_array('malaria_endemic', $symptoms) || in_array('malaria_parasites', $signs);
        $hasRash = in_array('rash', $signs);

        // PINK: Very severe febrile disease / Meningitis
        if ($hasStiffNeck || $hasBulgingFontanelle) {
            return [
                'color' => self::PINK,
                'classification' => 'Very severe febrile disease - possible meningitis',
                'signs_present' => array_filter([
                    'stiff_neck' => $hasStiffNeck,
                    'bulging_fontanelle' => $hasBulgingFontanelle,
                    'high_fever' => $hasHighFever,
                ]),
                'action' => 'Give first dose of antibiotics. Refer URGENTLY to hospital.',
                'treatment' => [
                    'antibiotic' => 'Benzyl penicillin or Ceftriaxone',
                    'antimalarial' => 'If malaria endemic, give first dose',
                    'urgent_referral' => true,
                ],
            ];
        }

        // ORANGE: Malaria (if endemic)
        if ($hasMalariaRisk) {
            return [
                'color' => self::ORANGE,
                'classification' => 'Malaria',
                'signs_present' => ['fever' => true, 'malaria_risk' => true],
                'action' => 'Give antimalarial treatment. Follow up in 2 days.',
                'treatment' => [
                    'antimalarial' => 'Artemether-Lumefantrine (Coartem)',
                    'duration' => '3 days',
                    'paracetamol' => 'For fever > 38.5°C',
                    'follow_up' => '2 days',
                ],
            ];
        }

        // YELLOW: Fever - no obvious cause
        return [
            'color' => self::YELLOW,
            'classification' => 'Fever - no localized cause',
            'signs_present' => ['fever' => true, 'temperature' => $temp],
            'action' => 'Give paracetamol for fever. Follow up in 2 days if fever persists.',
            'treatment' => [
                'paracetamol' => '15mg/kg every 4-6 hours for fever > 38.5°C',
                'follow_up' => '2 days if fever persists, sooner if condition worsens',
            ],
        ];
    }

    /**
     * Check for ear problem.
     */
    protected function hasEarProblem(array $symptoms, array $signs): bool
    {
        $earKeywords = ['ear_pain', 'ear_discharge', 'ear_problem'];
        return $this->containsAny($symptoms, $earKeywords) || $this->containsAny($signs, $earKeywords);
    }

    /**
     * Classify ear problem.
     */
    protected function classifyEarProblem(array $symptoms, array $signs): array
    {
        $hasTenderSwelling = in_array('tender_swelling_behind_ear', $signs);
        $hasPusDischarge = in_array('pus_discharge_from_ear', $signs) || in_array('ear_discharge', $signs);
        $hasEarPain = in_array('ear_pain', $symptoms);

        // PINK: Mastoiditis
        if ($hasTenderSwelling) {
            return [
                'color' => self::PINK,
                'classification' => 'Mastoiditis',
                'signs_present' => ['tender_swelling_behind_ear' => true],
                'action' => 'Give first dose of antibiotics. Refer URGENTLY to hospital.',
                'treatment' => [
                    'antibiotic' => 'Ceftriaxone or Cloxacillin',
                    'urgent_referral' => true,
                ],
            ];
        }

        // ORANGE: Acute ear infection
        if ($hasPusDischarge || $hasEarPain) {
            return [
                'color' => self::ORANGE,
                'classification' => 'Acute ear infection',
                'signs_present' => array_filter(['pus_discharge' => $hasPusDischarge, 'ear_pain' => $hasEarPain]),
                'action' => 'Give antibiotic for 5 days. Dry the ear by wicking. Follow up in 5 days.',
                'treatment' => [
                    'antibiotic' => 'Amoxicillin for 5 days',
                    'ear_wicking' => 'Dry the ear with absorbent cotton wick 3 times daily',
                    'pain_relief' => 'Paracetamol for pain',
                    'follow_up' => '5 days',
                ],
            ];
        }

        // YELLOW: Chronic ear infection
        return [
            'color' => self::YELLOW,
            'classification' => 'Chronic ear infection',
            'signs_present' => ['ear_discharge' => true],
            'action' => 'Dry the ear by wicking. Follow up in 5 days.',
            'treatment' => [
                'ear_wicking' => 'Dry the ear with absorbent cotton wick 3 times daily',
                'follow_up' => '5 days',
                'referral' => 'If not improving after 2 weeks, refer to ENT',
            ],
        ];
    }

    /**
     * Check for measles.
     */
    protected function hasMeasles(array $symptoms, array $signs): bool
    {
        return in_array('measles_rash', $signs) || 
               (in_array('rash', $signs) && in_array('fever', $symptoms) && in_array('cough', $symptoms));
    }

    /**
     * Classify measles.
     */
    protected function classifyMeasles(array $symptoms, array $signs): array
    {
        $hasCloudingCornea = in_array('clouding_cornea', $signs);
        $hasDeepMouthUlcers = in_array('deep_mouth_ulcers', $signs);
        $hasSevereComplications = $hasCloudingCornea || $hasDeepMouthUlcers;

        // PINK: Severe complicated measles
        if ($hasSevereComplications) {
            return [
                'color' => self::PINK,
                'classification' => 'Severe complicated measles',
                'signs_present' => array_filter([
                    'clouding_cornea' => $hasCloudingCornea,
                    'deep_mouth_ulcers' => $hasDeepMouthUlcers,
                ]),
                'action' => 'Give Vitamin A. Refer URGENTLY to hospital.',
                'treatment' => [
                    'vitamin_a' => '200,000 IU immediately',
                    'urgent_referral' => true,
                ],
            ];
        }

        // ORANGE: Measles with complications
        if (in_array('pus_discharge_from_eyes', $signs) || in_array('mouth_ulcers', $signs)) {
            return [
                'color' => self::ORANGE,
                'classification' => 'Measles with eye or mouth complications',
                'signs_present' => array_filter([
                    'eye_infection' => in_array('pus_discharge_from_eyes', $signs),
                    'mouth_ulcers' => in_array('mouth_ulcers', $signs),
                ]),
                'action' => 'Give Vitamin A. Treat complications. Follow up in 2 days.',
                'treatment' => [
                    'vitamin_a' => '200,000 IU immediately, repeat next day',
                    'eye_treatment' => 'Tetracycline eye ointment',
                    'mouth_care' => 'Gentian violet for mouth ulcers',
                    'follow_up' => '2 days',
                ],
            ];
        }

        // YELLOW: Measles
        return [
            'color' => self::YELLOW,
            'classification' => 'Measles',
            'signs_present' => ['rash' => true, 'fever' => true],
            'action' => 'Give Vitamin A. Home care. Follow up if complications develop.',
            'treatment' => [
                'vitamin_a' => '200,000 IU immediately, repeat next day',
                'home_care' => ['Keep warm', 'Encourage fluids', 'Continue breastfeeding'],
                'follow_up' => 'Return if: difficulty breathing, unable to drink, or new symptoms',
            ],
        ];
    }

    /**
     * Classify nutritional status.
     */
    protected function classifyNutrition(array $signs, array $vitals, int $ageMonths): array
    {
        $weightKg = $vitals['weight_kg'] ?? 0;
        $heightCm = $vitals['height_cm'] ?? 0;
        $hasVisibleSevereWasting = in_array('visible_severe_wasting', $signs);
        $hasEdema = in_array('bilateral_pitting_edema', $signs);
        $hasPallor = in_array('pallor', $signs);

        // Calculate weight-for-age z-score (simplified)
        $wfaZScore = $this->calculateWFAZScore($weightKg, $ageMonths);

        // PINK: Severe malnutrition
        if ($hasVisibleSevereWasting || $hasEdema || $wfaZScore < -3) {
            return [
                'color' => self::PINK,
                'classification' => 'Severe acute malnutrition',
                'signs_present' => array_filter([
                    'visible_severe_wasting' => $hasVisibleSevereWasting,
                    'edema' => $hasEdema,
                    'wfa_zscore' => $wfaZScore,
                ]),
                'action' => 'Refer URGENTLY to hospital for therapeutic feeding.',
                'treatment' => [
                    'feeding' => 'Therapeutic feeding (F-75, then F-100 or RUTF)',
                    'antibiotics' => 'Broad-spectrum antibiotics',
                    'urgent_referral' => true,
                ],
            ];
        }

        // ORANGE: Moderate malnutrition
        if ($wfaZScore < -2 || $hasPallor) {
            return [
                'color' => self::ORANGE,
                'classification' => 'Moderate malnutrition or anemia',
                'signs_present' => array_filter([
                    'wfa_zscore' => $wfaZScore,
                    'pallor' => $hasPallor,
                ]),
                'action' => 'Nutritional counseling. Iron supplementation if pallor. Follow up in 30 days.',
                'treatment' => [
                    'feeding_counseling' => 'Increase energy-dense foods, frequency of feeding',
                    'iron' => $hasPallor ? 'Iron supplementation for 14 days' : null,
                    'deworming' => $ageMonths >= 12 ? 'Mebendazole 500mg single dose' : null,
                    'follow_up' => '30 days',
                ],
            ];
        }

        // GREEN: No malnutrition
        return [
            'color' => self::GREEN,
            'classification' => 'No malnutrition',
            'signs_present' => ['wfa_zscore' => $wfaZScore],
            'action' => 'Continue age-appropriate feeding.',
            'treatment' => [
                'feeding_counseling' => 'Continue breastfeeding, age-appropriate complementary foods',
            ],
        ];
    }

    /**
     * Calculate weight-for-age z-score (simplified).
     * In production, use WHO growth standards tables.
     */
    protected function calculateWFAZScore(float $weightKg, int $ageMonths): float
    {
        // Simplified median weights by age (WHO reference)
        $medianWeights = [
            2 => 5.0, 3 => 5.8, 4 => 6.4, 6 => 7.3, 9 => 8.6,
            12 => 9.6, 18 => 10.9, 24 => 12.2, 36 => 14.3, 48 => 16.3, 60 => 18.3,
        ];

        // Find closest age
        $ages = array_keys($medianWeights);
        $closestAge = $ages[0];
        foreach ($ages as $age) {
            if (abs($age - $ageMonths) < abs($closestAge - $ageMonths)) {
                $closestAge = $age;
            }
        }

        $median = $medianWeights[$closestAge];
        $sd = $median * 0.1; // Approximate SD as 10% of median

        return ($weightKg - $median) / $sd;
    }

    /**
     * Determine overall classification based on most severe.
     */
    protected function determineOverallClassification(array $classifications): array
    {
        $severityOrder = [self::PINK => 4, self::ORANGE => 3, self::YELLOW => 2, self::GREEN => 1];
        $mostSevere = self::GREEN;
        $mostSevereClass = null;

        foreach ($classifications as $condition => $classification) {
            $color = $classification['color'];
            if ($severityOrder[$color] > $severityOrder[$mostSevere]) {
                $mostSevere = $color;
                $mostSevereClass = $condition;
            }
        }

        return [
            'color' => $mostSevere,
            'primary_condition' => $mostSevereClass,
            'action_summary' => $this->getActionSummary($mostSevere),
        ];
    }

    /**
     * Get action summary for overall classification.
     */
    protected function getActionSummary(string $color): string
    {
        return match ($color) {
            self::PINK => 'URGENT: Refer to hospital immediately. Give pre-referral treatment.',
            self::ORANGE => 'Give specific treatment. Follow up as recommended.',
            self::YELLOW => 'Home care with counseling. Follow up if not improving.',
            self::GREEN => 'Home care. Routine follow-up.',
            default => 'Assess and treat as appropriate.',
        };
    }

    /**
     * Get age category for IMCI.
     */
    protected function getAgeCategory(int $ageMonths): string
    {
        if ($ageMonths < 12) {
            return 'infant';
        }
        return 'child';
    }

    /**
     * Check if array contains any of the keywords.
     */
    protected function containsAny(array $array, array $keywords): bool
    {
        foreach ($keywords as $keyword) {
            if (in_array($keyword, $array)) {
                return true;
            }
        }
        return false;
    }
}
