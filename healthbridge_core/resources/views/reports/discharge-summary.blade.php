<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Discharge Summary - {{ $patient['name'] ?? 'Unknown Patient' }}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            font-size: 11pt;
            line-height: 1.5;
            color: #333;
        }
        
        .page {
            width: 210mm;
            min-height: 297mm;
            padding: 15mm;
            margin: 0 auto;
            background: white;
        }
        
        .header {
            text-align: center;
            border-bottom: 2px solid #2563eb;
            padding-bottom: 15px;
            margin-bottom: 20px;
        }
        
        .header h1 {
            font-size: 18pt;
            color: #1e40af;
            margin-bottom: 5px;
        }
        
        .header .facility {
            font-size: 12pt;
            color: #666;
        }
        
        .header .report-type {
            font-size: 14pt;
            font-weight: bold;
            color: #333;
            margin-top: 10px;
        }
        
        .section {
            margin-bottom: 20px;
        }
        
        .section-title {
            font-size: 12pt;
            font-weight: bold;
            color: #1e40af;
            border-bottom: 1px solid #ddd;
            padding-bottom: 5px;
            margin-bottom: 10px;
        }
        
        .info-grid {
            display: table;
            width: 100%;
        }
        
        .info-row {
            display: table-row;
        }
        
        .info-label {
            display: table-cell;
            width: 30%;
            font-weight: 600;
            padding: 4px 10px 4px 0;
            vertical-align: top;
        }
        
        .info-value {
            display: table-cell;
            padding: 4px 0;
            vertical-align: top;
        }
        
        .triage-badge {
            display: inline-block;
            padding: 3px 10px;
            border-radius: 4px;
            font-weight: bold;
            font-size: 10pt;
        }
        
        .triage-red {
            background-color: #fee2e2;
            color: #dc2626;
            border: 1px solid #fca5a5;
        }
        
        .triage-yellow {
            background-color: #fef3c7;
            color: #d97706;
            border: 1px solid #fcd34d;
        }
        
        .triage-green {
            background-color: #d1fae5;
            color: #059669;
            border: 1px solid #6ee7b7;
        }
        
        .vitals-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
        }
        
        .vitals-table th,
        .vitals-table td {
            border: 1px solid #ddd;
            padding: 8px;
            text-align: left;
        }
        
        .vitals-table th {
            background-color: #f3f4f6;
            font-weight: 600;
        }
        
        .danger-signs {
            background-color: #fef2f2;
            border: 1px solid #fecaca;
            border-radius: 4px;
            padding: 10px;
            margin-top: 10px;
        }
        
        .danger-signs ul {
            margin-left: 20px;
        }
        
        .danger-signs li {
            color: #dc2626;
            margin-bottom: 5px;
        }
        
        .ai-content {
            background-color: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 4px;
            padding: 15px;
            margin-top: 10px;
        }
        
        .ai-content .ai-label {
            font-size: 9pt;
            color: #64748b;
            margin-bottom: 5px;
        }
        
        .ai-content .ai-text {
            font-style: italic;
            color: #475569;
        }
        
        .footer {
            margin-top: 30px;
            padding-top: 15px;
            border-top: 1px solid #ddd;
            font-size: 9pt;
            color: #666;
        }
        
        .footer .generated {
            text-align: right;
        }
        
        .two-column {
            display: table;
            width: 100%;
        }
        
        .two-column > div {
            display: table-cell;
            width: 50%;
            vertical-align: top;
            padding-right: 15px;
        }
        
        .warning-banner {
            background-color: #fef3c7;
            border: 1px solid #fcd34d;
            border-radius: 4px;
            padding: 10px;
            margin-bottom: 20px;
            text-align: center;
            font-size: 10pt;
        }
        
        @media print {
            body {
                print-color-adjust: exact;
                -webkit-print-color-adjust: exact;
            }
        }
    </style>
</head>
<body>
    <div class="page">
        <!-- Header -->
        <div class="header">
            <h1>{{ $facility }}</h1>
            <div class="facility">Clinical Decision Support System</div>
            <div class="report-type">DISCHARGE SUMMARY</div>
        </div>
        
        <!-- Warning Banner -->
        <div class="warning-banner">
            <strong>⚠️ AI-Generated Content:</strong> This report contains AI-assisted clinical decision support. 
            All recommendations must be verified by a qualified healthcare provider.
        </div>
        
        <!-- Patient Information -->
        <div class="section">
            <div class="section-title">Patient Information</div>
            <div class="two-column">
                <div>
                    <div class="info-grid">
                        <div class="info-row">
                            <div class="info-label">Patient ID (CPT):</div>
                            <div class="info-value">{{ $patient['cpt'] ?? 'N/A' }}</div>
                        </div>
                        <div class="info-row">
                            <div class="info-label">Name:</div>
                            <div class="info-value">{{ $patient['name'] ?? 'Unknown' }}</div>
                        </div>
                        <div class="info-row">
                            <div class="info-label">Age:</div>
                            <div class="info-value">{{ $patient['age'] ?? ($patient['age_months'] ? floor($patient['age_months'] / 12) . ' years' : 'N/A') }}</div>
                        </div>
                        <div class="info-row">
                            <div class="info-label">Gender:</div>
                            <div class="info-value">{{ ucfirst($patient['gender'] ?? 'N/A') }}</div>
                        </div>
                    </div>
                </div>
                <div>
                    <div class="info-grid">
                        <div class="info-row">
                            <div class="info-label">Session ID:</div>
                            <div class="info-value">{{ $session['id'] ?? 'N/A' }}</div>
                        </div>
                        <div class="info-row">
                            <div class="info-label">Visit Date:</div>
                            <div class="info-value">{{ isset($session['created_at']) ? \Carbon\Carbon::parse($session['created_at'])->format('M d, Y H:i') : 'N/A' }}</div>
                        </div>
                        <div class="info-row">
                            <div class="info-label">Discharge Date:</div>
                            <div class="info-value">{{ isset($session['completed_at']) ? \Carbon\Carbon::parse($session['completed_at'])->format('M d, Y H:i') : 'N/A' }}</div>
                        </div>
                        <div class="info-row">
                            <div class="info-label">Triage Priority:</div>
                            <div class="info-value">
                                @php
                                    $triageClass = 'triage-' . ($session['triage_priority'] ?? 'green');
                                @endphp
                                <span class="triage-badge {{ $triageClass }}">
                                    {{ strtoupper($session['triage_priority'] ?? 'Unknown') }}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Chief Complaint -->
        <div class="section">
            <div class="section-title">Chief Complaint</div>
            <p>{{ $session['chief_complaint'] ?? 'Not specified' }}</p>
        </div>
        
        <!-- Vitals -->
        @if(!empty($vitals) && collect($vitals)->filter()->isNotEmpty())
        <div class="section">
            <div class="section-title">Vital Signs</div>
            <table class="vitals-table">
                <tr>
                    <th>Respiratory Rate</th>
                    <th>Heart Rate</th>
                    <th>Temperature</th>
                    <th>SpO2</th>
                    <th>Weight</th>
                </tr>
                <tr>
                    <td>{{ $vitals['respiratory_rate'] ?? '-' }} /min</td>
                    <td>{{ $vitals['heart_rate'] ?? '-' }} /min</td>
                    <td>{{ $vitals['temperature'] ?? '-' }} °C</td>
                    <td>{{ $vitals['spo2'] ?? '-' }}%</td>
                    <td>{{ $vitals['weight'] ?? $patient['weight_kg'] ?? '-' }} kg</td>
                </tr>
            </table>
        </div>
        @endif
        
        <!-- Danger Signs -->
        @if(!empty($danger_signs))
        <div class="section">
            <div class="section-title">⚠️ Danger Signs Detected</div>
            <div class="danger-signs">
                <ul>
                    @foreach($danger_signs as $sign)
                        <li>{{ $sign }}</li>
                    @endforeach
                </ul>
            </div>
        </div>
        @endif
        
        <!-- Assessment -->
        @if(!empty($assessment))
        <div class="section">
            <div class="section-title">Assessment</div>
            <div class="info-grid">
                @if(!empty($assessment['classification']))
                <div class="info-row">
                    <div class="info-label">Classification:</div>
                    <div class="info-value">{{ $assessment['classification'] }}</div>
                </div>
                @endif
                @if(!empty($assessment['severity']))
                <div class="info-row">
                    <div class="info-label">Severity:</div>
                    <div class="info-value">{{ $assessment['severity'] }}</div>
                </div>
                @endif
                @if(!empty($assessment['symptoms']))
                <div class="info-row">
                    <div class="info-label">Symptoms:</div>
                    <div class="info-value">{{ is_array($assessment['symptoms']) ? implode(', ', $assessment['symptoms']) : $assessment['symptoms'] }}</div>
                </div>
                @endif
            </div>
        </div>
        @endif
        
        <!-- Treatment Plan -->
        @if(!empty($treatment_plan))
        <div class="section">
            <div class="section-title">Treatment Plan</div>
            @php
                $treatmentPlanData = is_string($treatment_plan) ? json_decode($treatment_plan, true) : $treatment_plan;
            @endphp
            @if(is_array($treatmentPlanData) && !empty($treatmentPlanData['medications']))
                <table style="width: 100%; border-collapse: collapse; font-size: 9pt;">
                    <thead>
                        <tr style="background: #f3f4f6;">
                            <th style="border: 1px solid #ddd; padding: 6px; text-align: left;">Medication</th>
                            <th style="border: 1px solid #ddd; padding: 6px; text-align: left;">Dose</th>
                            <th style="border: 1px solid #ddd; padding: 6px; text-align: left;">Route</th>
                            <th style="border: 1px solid #ddd; padding: 6px; text-align: left;">Frequency</th>
                            <th style="border: 1px solid #ddd; padding: 6px; text-align: left;">Duration</th>
                        </tr>
                    </thead>
                    <tbody>
                        @foreach($treatmentPlanData['medications'] as $med)
                        <tr>
                            <td style="border: 1px solid #ddd; padding: 6px;">{{ $med['name'] ?? '' }}</td>
                            <td style="border: 1px solid #ddd; padding: 6px;">{{ $med['dose'] ?? '' }}</td>
                            <td style="border: 1px solid #ddd; padding: 6px;">{{ $med['route'] ?? '' }}</td>
                            <td style="border: 1px solid #ddd; padding: 6px;">{{ $med['frequency'] ?? '' }}</td>
                            <td style="border: 1px solid #ddd; padding: 6px;">{{ $med['duration'] ?? '' }}</td>
                        </tr>
                        @endforeach
                    </tbody>
                </table>
            @else
                <p>{{ is_string($treatment_plan) ? $treatment_plan : json_encode($treatment_plan) }}</p>
            @endif
        </div>
        @endif
        
        <!-- AI Summary -->
        @if($show_ai_content && !empty($ai_summary))
        <div class="section">
            <div class="section-title">AI-Generated Summary</div>
            <div class="ai-content">
                <div class="ai-label">🤖 Generated by MedGemma Clinical AI</div>
                <div class="ai-text">{{ $ai_summary }}</div>
            </div>
        </div>
        @endif
        
        <!-- Notes -->
        @if(!empty($notes))
        <div class="section">
            <div class="section-title">Clinical Notes</div>
            <p>{{ $notes }}</p>
        </div>
        @endif
        
        <!-- Footer -->
        <div class="footer">
            <div class="generated">
                Report generated: {{ \Carbon\Carbon::parse($generated_at)->format('F d, Y \a\t H:i:s') }}<br>
                Session ID: {{ $session['id'] ?? 'N/A' }}<br>
                <em>This report was generated by the HealthBridge Clinical Decision Support System.</em>
            </div>
        </div>
    </div>
</body>
</html>
