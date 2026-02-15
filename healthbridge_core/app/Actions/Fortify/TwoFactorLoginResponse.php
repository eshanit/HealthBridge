<?php

namespace App\Actions\Fortify;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Laravel\Fortify\Contracts\TwoFactorLoginResponse as TwoFactorLoginResponseContract;

class TwoFactorLoginResponse implements TwoFactorLoginResponseContract
{
    /**
     * Create an HTTP response that represents the object.
     *
     * @param  Request  $request
     * @return Response|RedirectResponse|JsonResponse
     */
    public function toResponse($request): Response|RedirectResponse|JsonResponse
    {
        $user = $request->user();

        // Role-based redirection
        $redirectPath = $this->getRedirectPathForUser($user);

        return $request->wantsJson()
            ? response()->json(['redirect' => $redirectPath])
            : redirect()->to($redirectPath);
    }

    /**
     * Get the redirect path based on user role.
     *
     * @param  mixed  $user
     * @return string
     */
    protected function getRedirectPathForUser($user): string
    {
        if (!$user) {
            return config('fortify.home', '/dashboard');
        }

        // Check if user has the 'doctor' role (GP - General Practitioner)
        if ($user->hasRole('doctor')) {
            return '/gp/dashboard';
        }

        // Check if user has the 'nurse' or 'senior-nurse' role
        if ($user->hasRole('nurse') || $user->hasRole('senior-nurse')) {
            return '/triage';
        }

        // Check if user has the 'radiologist' role
        if ($user->hasRole('radiologist')) {
            return '/radiology';
        }

        // Check if user has the 'dermatologist' role
        if ($user->hasRole('dermatologist')) {
            return '/dermatology';
        }

        // Check if user has the 'admin' role
        if ($user->hasRole('admin')) {
            return '/admin/dashboard';
        }

        // Default redirect for other roles
        return config('fortify.home', '/dashboard');
    }
}
