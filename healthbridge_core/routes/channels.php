<?php

use Illuminate\Support\Facades\Broadcast;

/*
|--------------------------------------------------------------------------
| Broadcast Channels
|--------------------------------------------------------------------------
|
| Here you may register all of the event broadcasting channels that your
| application supports. The given channel authorization callbacks are
| used to check if an authenticated user can listen to the channel.
|
*/

// GP Dashboard Channel - for real-time dashboard updates
Broadcast::channel('gp.dashboard', function ($user) {
    // Only authenticated users with GP or admin role can join
    return $user->hasRole(['gp', 'admin', 'doctor']);
});

// Referrals Channel - for new referral notifications
Broadcast::channel('referrals', function ($user) {
    return $user->hasRole(['gp', 'admin', 'doctor', 'nurse']);
});

// Session-specific Channel - for patient session updates
Broadcast::channel('sessions.{couchId}', function ($user, $couchId) {
    // Allow GP, admin, or users assigned to the session
    return $user->hasRole(['gp', 'admin', 'doctor']) ||
           $user->sessions()->where('couch_id', $couchId)->exists();
});

// Patient Channel - for patient-specific updates
Broadcast::channel('patients.{cpt}', function ($user, $cpt) {
    return $user->hasRole(['gp', 'admin', 'doctor', 'nurse']);
});

// AI Request Channel - for AI processing status updates
Broadcast::channel('ai-requests.{requestId}', function ($user, $requestId) {
    return $user->hasRole(['gp', 'admin', 'doctor']);
});
