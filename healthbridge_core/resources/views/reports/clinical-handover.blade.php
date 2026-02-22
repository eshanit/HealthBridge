<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Clinical Handover - {{ $patient['name'] ?? 'Unknown Patient' }}</title>
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
        
        .patient-banner {
            background-color: #f3f4f6;
            border: 1px solid #e5e7eb;
            border-radius: 4px;
            padding: 15px;
            margin-bottom: 20px;
            display: table;
            width: 100%;
        }
        
        .patient-banner-item {
            display: table-cell;
            padding: 0 15px;
            border-right: 1px solid #e5e7eb;
        }
        
        .patient-banner-item:last-child {
            border-right: none;
        }
        
        .patient-banner-label {
            font-size: 9pt;
            color: #6b7280;
            text-transform: uppercase;
        }
        
        .patient-banner-value {
            font-size: 12pt;
            font-weight: 600;
            color: #111827;
        }
        
        .sbar-section {
            margin-bottom: 20px;
            page-break-inside: avoid;
        }
        
        .sbar-header {
            display: table;
            width: 100%;
            margin-bottom: 10px;
        }
        
        .sbar-letter {
            display: table-cell;
            width: 40px;
            height: 40px;
            background-color: #2563eb;
            color: white;
            font-size: 18pt;
            font-weight: bold;
            text-align: center;
            line-height: 40px;
            border-radius: 4px;
            vertical-align: middle;
        }
        
        .sbar-title {
            display: table-cell;
            padding-left: 15px;
            vertical-align: middle;
        }
        
        .sbar-title h3 {
            font-size: 14pt;
            color: #1e40af;
        }
        
        .sbar-title .subtitle {
            font-size: 10pt;
            color: #6b7280;
        }
        
        .sbar-content {
            background-color: #f9fafb;
            border: 1px solid #e5e7eb;
            border-radius: 4px;
            padding: 15px;
        }
        
        .sbar-content p {
            margin-bottom: 10px;
        }
        
        .sbar-content p:last-child {
            margin-bottom: 0;
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
        
        .handover-info {
            margin-top: 30px;
            padding-top: 15px;
            border-top: 1px solid #e5e7eb;
        }
        
        .handover-info-grid {
            display: table;
            width: 100%;
        }
        
        .handover-info-row {
            display: table-row;
        }
        
        .handover-info-label {
            display: table-cell;
            width: 25%;
            font-weight: 600;
            padding: 5px 10px 5px 0;
        }
        
        .handover-info-value {
            display: table-cell;
            padding: 5px 0;
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
            <div class="report-type">CLINICAL HANDOVER (SBAR)</div>
        </div>
        
        <!-- Warning Banner -->
        <div class="warning-banner">
            <strong>⚠️ Clinical Handover Document:</strong> This report facilitates patient care continuity. 
            Verify all information before acting.
        </div>
        
        <!-- Patient Banner -->
        <div class="patient-banner">
            <div class="patient-banner-item">
                <div class="patient-banner-label">Patient</div>
                <div class="patient-banner-value">{{ $patient['name'] ?? 'Unknown' }}</div>
            </div>
            <div class="patient-banner-item">
                <div class="patient-banner-label">CPT</div>
                <div class="patient-banner-value">{{ $patient['cpt'] ?? 'N/A' }}</div>
            </div>
            <div class="patient-banner-item">
                <div class="patient-banner-label">Age</div>
                <div class="patient-banner-value">{{ $patient['age'] ?? 'N/A' }}</div>
            </div>
            <div class="patient-banner-item">
                <div class="patient-banner-label">Gender</div>
                <div class="patient-banner-value">{{ ucfirst($patient['gender'] ?? 'N/A') }}</div>
            </div>
            <div class="patient-banner-item">
                <div class="patient-banner-label">Triage</div>
                <div class="patient-banner-value">
                    @php
                        $triageClass = 'triage-' . ($patient['triage_priority'] ?? 'green');
                    @endphp
                    <span class="triage-badge {{ $triageClass }}">
                        {{ strtoupper($patient['triage_priority'] ?? 'Unknown') }}
                    </span>
                </div>
            </div>
        </div>
        
        <!-- S - Situation -->
        <div class="sbar-section">
            <div class="sbar-header">
                <div class="sbar-letter">S</div>
                <div class="sbar-title">
                    <h3>Situation</h3>
                    <div class="subtitle">What is happening right now?</div>
                </div>
            </div>
            <div class="sbar-content">
                {!! nl2br(e($sbar['situation'] ?? 'No situation information provided.')) !!}
            </div>
        </div>
        
        <!-- B - Background -->
        <div class="sbar-section">
            <div class="sbar-header">
                <div class="sbar-letter">B</div>
                <div class="sbar-title">
                    <h3>Background</h3>
                    <div class="subtitle">What is the relevant clinical history?</div>
                </div>
            </div>
            <div class="sbar-content">
                {!! nl2br(e($sbar['background'] ?? 'No background information provided.')) !!}
            </div>
        </div>
        
        <!-- A - Assessment -->
        <div class="sbar-section">
            <div class="sbar-header">
                <div class="sbar-letter">A</div>
                <div class="sbar-title">
                    <h3>Assessment</h3>
                    <div class="subtitle">What do I think the problem is?</div>
                </div>
            </div>
            <div class="sbar-content">
                {!! nl2br(e($sbar['assessment'] ?? 'No assessment information provided.')) !!}
            </div>
        </div>
        
        <!-- R - Recommendation -->
        <div class="sbar-section">
            <div class="sbar-header">
                <div class="sbar-letter">R</div>
                <div class="sbar-title">
                    <h3>Recommendation</h3>
                    <div class="subtitle">What do I want to happen?</div>
                </div>
            </div>
            <div class="sbar-content">
                {!! nl2br(e($sbar['recommendation'] ?? 'No recommendation provided.')) !!}
            </div>
        </div>
        
        <!-- Handover Information -->
        <div class="handover-info">
            <div class="handover-info-grid">
                <div class="handover-info-row">
                    <div class="handover-info-label">Session ID:</div>
                    <div class="handover-info-value">{{ $session_id ?? 'N/A' }}</div>
                </div>
                @if(!empty($handed_over_by))
                <div class="handover-info-row">
                    <div class="handover-info-label">Handed Over By:</div>
                    <div class="handover-info-value">{{ $handed_over_by }}</div>
                </div>
                @endif
                @if(!empty($handed_over_to))
                <div class="handover-info-row">
                    <div class="handover-info-label">Handed Over To:</div>
                    <div class="handover-info-value">{{ $handed_over_to }}</div>
                </div>
                @endif
                <div class="handover-info-row">
                    <div class="handover-info-label">Handover Time:</div>
                    <div class="handover-info-value">{{ \Carbon\Carbon::parse($generated_at)->format('F d, Y \a\t H:i:s') }}</div>
                </div>
            </div>
        </div>
        
        <!-- Footer -->
        <div class="footer">
            <div class="generated">
                Report generated: {{ \Carbon\Carbon::parse($generated_at)->format('F d, Y \a\t H:i:s') }}<br>
                <em>This handover report was generated by the HealthBridge Clinical Decision Support System.</em>
            </div>
        </div>
    </div>
</body>
</html>
