<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Comprehensive Clinical Report - {{ $patient['name'] ?? 'Unknown Patient' }}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            font-size: 10pt;
            line-height: 1.4;
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
            margin-bottom: 15px;
            page-break-inside: avoid;
        }

        .section-title {
            font-size: 11pt;
            font-weight: bold;
            color: #1e40af;
            border-bottom: 1px solid #ddd;
            padding-bottom: 5px;
            margin-bottom: 8px;
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
            width: 25%;
            font-weight: 600;
            padding: 3px 10px 3px 0;
            vertical-align: top;
            font-size: 9pt;
        }

        .info-value {
            display: table-cell;
            padding: 3px 0;
            vertical-align: top;
            font-size: 9pt;
        }

        .triage-badge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 4px;
            font-weight: bold;
            font-size: 9pt;
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
            margin-top: 8px;
            font-size: 9pt;
        }

        .vitals-table th,
        .vitals-table td {
            border: 1px solid #ddd;
            padding: 6px;
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
            padding: 8px;
            margin-top: 8px;
        }

        .danger-signs ul {
            margin-left: 15px;
        }

        .danger-signs li {
            color: #dc2626;
            margin-bottom: 3px;
            font-size: 9pt;
        }

        .ai-content {
            background-color: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 4px;
            padding: 10px;
            margin-top: 8px;
        }

        .ai-content .ai-label {
            font-size: 8pt;
            color: #64748b;
            margin-bottom: 5px;
        }

        .ai-content .ai-text {
            font-style: italic;
            color: #475569;
            font-size: 9pt;
        }

        .timeline-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 8px;
            font-size: 8pt;
        }

        .timeline-table th,
        .timeline-table td {
            border: 1px solid #ddd;
            padding: 5px;
            text-align: left;
        }

        .timeline-table th {
            background-color: #f3f4f6;
            font-weight: 600;
        }

        .footer {
            margin-top: 20px;
            padding-top: 10px;
            border-top: 1px solid #ddd;
            font-size: 8pt;
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
            padding-right: 10px;
        }

        .warning-banner {
            background-color: #fef3c7;
            border: 1px solid #fcd34d;
            border-radius: 4px;
            padding: 8px;
            margin-bottom: 15px;
            text-align: center;
            font-size: 9pt;
        }

        .workflow-badge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 4px;
            font-weight: bold;
            font-size: 8pt;
            background-color: #e0e7ff;
            color: #3730a3;
        }

        .forms-list {
            margin-top: 5px;
        }

        .forms-list-item {
            padding: 5px 0;
            border-bottom: 1px solid #eee;
            font-size: 9pt;
        }

        .forms-list-item:last-child {
            border-bottom: none;
        }

        .ai-interactions-list {
            margin-top: 5px;
        }

        .ai-interaction-item {
            padding: 4px 0;
            font-size: 8pt;
            color: #6b7280;
        }

        .page-break {
            page-break-before: always;
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
            <div class="report-type">COMPREHENSIVE CLINICAL REPORT</div>
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
                            <div class="info-value">{{ $patient['age'] ?? ($patient['age_months'] ? floor($patient['age_months'] / 12) . ' years ' . ($patient['age_months'] % 12) . ' months' : 'N/A') }}</div>
                        </div>
                        <div class="info-row">
                            <div class="info-label">Gender:</div>
                            <div class="info-value">{{ ucfirst($patient['gender'] ?? 'N/A') }}</div>
                        </div>
                        <div class="info-row">
                            <div class="info-label">Date of Birth:</div>
                            <div class="info-value">{{ $patient['date_of_birth'] ?? 'N/A' }}</div>
                        </div>
                    </div>
                </div>
                <div>
                    <div class="info-grid">
                        <div class="info-row">
                            <div class="info-label">Weight:</div>
                            <div class="info-value">{{ $patient['weight_kg'] ?? '-' }} kg</div>
                        </div>
                        <div class="info-row">
                            <div class="info-label">Session ID:</div>
                            <div class="info-value" style="font-size: 8pt; word-break: break-all;">{{ $session['id'] ?? 'N/A' }}</div>
                        </div>
                        <div class="info-row">
                            <div class="info-label">Visit Date:</div>
                            <div class="info-value">{{ isset($session['created_at']) ? \Carbon\Carbon::parse($session['created_at'])->format('M d, Y H:i') : 'N/A' }}</div>
                        </div>
                        <div class="info-row">
                            <div class="info-label">Workflow State:</div>
                            <div class="info-value">
                                <span class="workflow-badge">{{ $session['workflow_state'] ?? 'Unknown' }}</span>
                            </div>
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
            <p style="font-size: 9pt;">{{ $session['chief_complaint'] ?? 'Not specified' }}</p>
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
        @if(!empty($session['treatment_plan']))
        <div class="section">
            <div class="section-title">Treatment Plan</div>
            @php
                $treatmentPlan = is_string($session['treatment_plan']) ? json_decode($session['treatment_plan'], true) : $session['treatment_plan'];
            @endphp
            @if(is_array($treatmentPlan) && !empty($treatmentPlan['medications']))
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
                        @foreach($treatmentPlan['medications'] as $med)
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
                <p style="font-size: 9pt;">{{ is_string($session['treatment_plan']) ? $session['treatment_plan'] : json_encode($session['treatment_plan']) }}</p>
            @endif
        </div>
        @endif

        <!-- Clinical Notes -->
        @if(!empty($session['notes']))
        <div class="section">
            <div class="section-title">Clinical Notes</div>
            <p style="font-size: 9pt;">{{ $session['notes'] }}</p>
        </div>
        @endif

        <!-- AI Content -->
        @if($show_ai_content && !empty($ai_content))
        <div class="section">
            <div class="section-title">AI-Generated Content</div>
            @if(!empty($ai_content['summary']))
            <div class="ai-content">
                <div class="ai-label">🤖 Clinical Summary (MedGemma)</div>
                <div class="ai-text">{{ $ai_content['summary'] }}</div>
            </div>
            @endif
            @if(!empty($ai_content['recommendations']))
            <div class="ai-content" style="margin-top: 8px;">
                <div class="ai-label">🤖 Clinical Recommendations</div>
                <div class="ai-text">
                    @if(is_array($ai_content['recommendations']))
                        <ul style="margin-left: 15px;">
                            @foreach($ai_content['recommendations'] as $rec)
                                <li>{{ $rec }}</li>
                            @endforeach
                        </ul>
                    @else
                        {{ $ai_content['recommendations'] }}
                    @endif
                </div>
            </div>
            @endif
            @if(!empty($ai_content['differential_diagnosis']))
            <div class="ai-content" style="margin-top: 8px;">
                <div class="ai-label">🤖 Differential Diagnosis</div>
                <div class="ai-text">{{ $ai_content['differential_diagnosis'] }}</div>
            </div>
            @endif
        </div>
        @endif

        <!-- Forms Completed -->
        @if(!empty($forms) && count($forms) > 0)
        <div class="section">
            <div class="section-title">Clinical Forms ({{ count($forms) }})</div>
            <div class="forms-list">
                @foreach($forms as $form)
                <div class="forms-list-item">
                    <strong>{{ $form['schema_id'] ?? 'Unknown Form' }}</strong>
                    <span style="float: right; color: #6b7280;">{{ $form['status'] ?? 'draft' }}</span>
                    <br>
                    <span style="color: #6b7280; font-size: 8pt;">
                        Created: {{ $form['created_at'] ?? 'N/A' }}
                    </span>
                </div>
                @endforeach
            </div>
        </div>
        @endif

        <!-- AI Interactions -->
        @if(!empty($ai_interactions) && count($ai_interactions) > 0)
        <div class="section">
            <div class="section-title">AI Interactions ({{ count($ai_interactions) }})</div>
            <div class="ai-interactions-list">
                @foreach($ai_interactions as $ai)
                <div class="ai-interaction-item">
                    • {{ $ai['task'] ?? 'Unknown task' }}
                    @if(!empty($ai['latency_ms']))
                        <span style="color: #9ca3af;">({{ $ai['latency_ms'] }}ms)</span>
                    @endif
                    <span style="float: right;">{{ $ai['created_at'] ?? '' }}</span>
                </div>
                @endforeach
            </div>
        </div>
        @endif

        <!-- Workflow State Transitions -->
        @if(!empty($state_transitions) && count($state_transitions) > 0)
        <div class="section">
            <div class="section-title">Workflow Timeline</div>
            <table class="timeline-table">
                <tr>
                    <th>From State</th>
                    <th>To State</th>
                    <th>Reason</th>
                    <th>User</th>
                    <th>Time</th>
                </tr>
                @foreach($state_transitions as $transition)
                <tr>
                    <td>{{ $transition['from'] ?? '-' }}</td>
                    <td>{{ $transition['to'] ?? '-' }}</td>
                    <td>{{ $transition['reason'] ?? '-' }}</td>
                    <td>{{ $transition['user'] ?? 'System' }}</td>
                    <td style="font-size: 8pt;">{{ isset($transition['created_at']) ? \Carbon\Carbon::parse($transition['created_at'])->format('M d, H:i') : '-' }}</td>
                </tr>
                @endforeach
            </table>
        </div>
        @endif

        <!-- Footer -->
        <div class="footer">
            <div class="generated">
                Report generated: {{ \Carbon\Carbon::parse($generated_at)->format('F d, Y \a\t H:i:s') }}<br>
                Session ID: {{ $session['id'] ?? 'N/A' }}<br>
                <em>This comprehensive report was generated by the UtanoBridge Clinical Decision Support System.</em>
            </div>
        </div>
    </div>
</body>
</html>
