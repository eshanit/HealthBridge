<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Referral Report - {{ $patient['name'] ?? 'Unknown Patient' }}</title>
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
        
        .referral-banner {
            background-color: #eff6ff;
            border: 2px solid #3b82f6;
            border-radius: 4px;
            padding: 15px;
            margin-bottom: 20px;
            text-align: center;
        }
        
        .referral-id {
            font-size: 12pt;
            color: #1e40af;
            margin-bottom: 5px;
        }
        
        .referral-status {
            font-size: 14pt;
            font-weight: bold;
        }
        
        .status-pending {
            color: #d97706;
        }
        
        .status-accepted {
            color: #059669;
        }
        
        .status-completed {
            color: #0284c7;
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
        
        .priority-badge {
            display: inline-block;
            padding: 5px 15px;
            border-radius: 4px;
            font-weight: bold;
            font-size: 12pt;
        }
        
        .priority-red {
            background-color: #dc2626;
            color: white;
        }
        
        .priority-yellow {
            background-color: #d97706;
            color: white;
        }
        
        .priority-green {
            background-color: #059669;
            color: white;
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
        
        .clinical-notes {
            background-color: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 4px;
            padding: 15px;
            margin-top: 10px;
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
        
        .signature-section {
            margin-top: 40px;
            display: table;
            width: 100%;
        }
        
        .signature-box {
            display: table-cell;
            width: 45%;
            padding-top: 50px;
            border-top: 1px solid #333;
            text-align: center;
        }
        
        .signature-label {
            font-size: 10pt;
            color: #666;
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
            <div class="report-type">REFERRAL REPORT</div>
        </div>
        
        <!-- Referral Banner -->
        <div class="referral-banner">
            <div class="referral-id">Referral ID: {{ $referral['id'] ?? 'N/A' }}</div>
            <div class="referral-status status-{{ $referral['status'] ?? 'pending' }}">
                {{ strtoupper($referral['status'] ?? 'Pending') }}
                @php
                    $priorityClass = 'priority-' . ($referral['priority'] ?? 'green');
                @endphp
                <span class="priority-badge {{ $priorityClass }}" style="margin-left: 15px;">
                    {{ strtoupper($referral['priority'] ?? 'Unknown') }} PRIORITY
                </span>
            </div>
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
                            <div class="info-value">{{ $patient['age'] ?? 'N/A' }}</div>
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
                            <div class="info-label">Weight:</div>
                            <div class="info-value">{{ $patient['weight_kg'] ?? '-' }} kg</div>
                        </div>
                        <div class="info-row">
                            <div class="info-label">Session ID:</div>
                            <div class="info-value">{{ $session['id'] ?? 'N/A' }}</div>
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
        
        <!-- Referral Details -->
        <div class="section">
            <div class="section-title">Referral Details</div>
            <div class="info-grid">
                <div class="info-row">
                    <div class="info-label">Specialty:</div>
                    <div class="info-value">{{ $referral['specialty'] ?? 'General Practice' }}</div>
                </div>
                <div class="info-row">
                    <div class="info-label">Reason for Referral:</div>
                    <div class="info-value">{{ $referral['reason'] ?? 'Not specified' }}</div>
                </div>
                @if(!empty($referral['clinical_notes']))
                <div class="info-row">
                    <div class="info-label">Clinical Notes:</div>
                    <div class="info-value">{{ $referral['clinical_notes'] }}</div>
                </div>
                @endif
                <div class="info-row">
                    <div class="info-label">Referred By:</div>
                    <div class="info-value">{{ $referring_user ?? 'Unknown' }}</div>
                </div>
                @if(!empty($assigned_to))
                <div class="info-row">
                    <div class="info-label">Assigned To:</div>
                    <div class="info-value">{{ $assigned_to }}</div>
                </div>
                @endif
                <div class="info-row">
                    <div class="info-label">Referral Date:</div>
                    <div class="info-value">{{ isset($referral['created_at']) ? \Carbon\Carbon::parse($referral['created_at'])->format('M d, Y H:i') : 'N/A' }}</div>
                </div>
            </div>
        </div>
        
        <!-- Signature Section -->
        <div class="signature-section">
            <div class="signature-box">
                <div class="signature-label">Referred By</div>
                <div style="margin-top: 5px;">{{ $referring_user ?? '_________________' }}</div>
            </div>
            <div class="signature-box" style="padding-left: 10%;">
                <div class="signature-label">Received By</div>
                <div style="margin-top: 5px;">{{ $assigned_to ?? '_________________' }}</div>
            </div>
        </div>
        
        <!-- Footer -->
        <div class="footer">
            <div class="generated">
                Report generated: {{ \Carbon\Carbon::parse($generated_at)->format('F d, Y \a\t H:i:s') }}<br>
                Referral ID: {{ $referral['id'] ?? 'N/A' }}<br>
                <em>This referral report was generated by the UtanoBridge Clinical Decision Support System.</em>
            </div>
        </div>
    </div>
</body>
</html>
