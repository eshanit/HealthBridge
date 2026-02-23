# Patient Registration Workflow Documentation

## Overview

This document describes the patient registration workflow in HealthBridge, specifically focusing on how radiologists can register new patients from the Radiology Dashboard.

## User Flow

### 1. Accessing Patient Registration

**Radiologist Path:**
1. Navigate to Radiology Dashboard (`/radiology/dashboard`)
2. Click "Register New Patient" button
3. Fill out the patient registration form
4. Submit the form

**GP/Doctor Path:**
1. Navigate to GP Dashboard (`/gp/dashboard`)
2. Click "Register New Patient" button (in Patient List or MultiTabPatientList)
3. Fill out the patient registration form
4. Submit the form

### 2. Post-Registration Redirect Logic

After successful patient registration, the system redirects based on user role:

| User Role | Redirect Target | Rationale |
|-----------|----------------|-----------|
| GP/Doctor | `/gp/sessions/{sessionId}` | Immediate access to start clinical assessment |
| Radiologist | `/radiology/dashboard` | Study management workflow |
| Admin | `/gp/sessions/{sessionId}` | Default to GP workflow |

## Technical Implementation

### Route Configuration

**New Role-Agnostic Routes** (`routes/patients.php`):
```php
Route::middleware(['auth', 'verified', 'role:doctor|radiologist|admin'])
    ->prefix('patients')
    ->name('patients.')
    ->group(function () {
        Route::get('/', [PatientController::class, 'index'])->name('index');
        Route::get('/new', [PatientController::class, 'create'])->name('create');
        Route::post('/', [PatientController::class, 'store'])->name('store');
        Route::get('/search', [PatientController::class, 'search'])->name('search');
        Route::get('/{identifier}', [PatientController::class, 'show'])->name('show');
    });
```

### Key Files Modified

| File | Changes |
|------|---------|
| `routes/patients.php` | New file - role-agnostic patient routes |
| `routes/web.php` | Added require for patients.php |
| `routes/gp.php` | Added radiologist role to middleware |
| `resources/js/pages/radiology/Dashboard.vue` | Added Register New Patient button |
| `resources/js/pages/gp/NewPatient.vue` | Updated URLs to use /patients |
| `resources/js/components/gp/MultiTabPatientList.vue` | Updated URLs |
| `app/Http/Controllers/GP/PatientController.php` | Role-based redirect logic |

### Role-Based Redirect Method

Located in `PatientController.php`:

```php
protected function getRoleBasedRedirect($user, string $sessionId): string
{
    if (!$user) {
        return route('gp.dashboard');
    }

    // Check if user has radiologist role
    if ($user->hasRole('radiologist')) {
        return route('radiology.dashboard');
    }

    // Default to GP dashboard
    return route('gp.sessions.show', $sessionId);
}
```

## Database Operations

When a patient is registered, the following operations occur:

1. **Patient Record Created** (MySQL + CouchDB)
   - Unique CPT generated (format: `CPT-YYYY-XXXXX`)
   - Patient data synced to CouchDB

2. **Clinical Session Created** (MySQL + CouchDB)
   - Session UUID matches CouchDB document ID
   - Initial state: `in_review`
   - Initial triage: `green`

## Security

- All patient routes require authentication
- Role-based access control: `doctor`, `radiologist`, or `admin`
- CSRF protection enabled via Laravel middleware

## UX Considerations

### Why This Flow?

1. **Efficiency**: GPs can immediately start assessing the patient they just registered
2. **Role Appropriateness**: Radiologists focus on study management, not direct patient intake
3. **Consistency**: Follows common patterns in medical applications (Epic, Cerner)

### Alternative Options

If different behavior is needed in the future:
- Add "Start session immediately" checkbox in registration form
- Allow users to set their preferred redirect in settings
- Add role-specific redirect configurations

## Testing

To test the workflow:

1. **As Radiologist:**
   - Login with radiologist role
   - Go to `/radiology/dashboard`
   - Click "Register New Patient"
   - Fill form and submit
   - Verify redirect to `/radiology/dashboard`

2. **As GP/Doctor:**
   - Login with doctor role
   - Go to `/gp/dashboard` or `/patients/new`
   - Fill form and submit
   - Verify redirect to `/gp/sessions/{sessionId}`

## Troubleshooting

### Common Issues

| Error | Solution |
|-------|----------|
| 403 Role Error | Ensure user has correct role assigned |
| JSON Parse Error | Check form action URL matches route |
| CouchDB Error | Verify CouchDB service is running |
| Missing session_uuid | Ensure PatientController includes session_uuid in create() |
