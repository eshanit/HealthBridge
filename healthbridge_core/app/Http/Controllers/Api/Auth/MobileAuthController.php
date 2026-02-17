<?php

namespace App\Http\Controllers\Api\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

/**
 * Mobile Authentication Controller
 * 
 * Handles authentication for the nurse_mobile app.
 * Issues Sanctum tokens for API access.
 * 
 * Endpoints:
 * - POST /api/auth/login - Login and get token
 * - POST /api/auth/logout - Revoke current token
 * - GET /api/auth/user - Get current user info
 * - POST /api/auth/refresh - Refresh token
 */
class MobileAuthController extends Controller
{
    /**
     * Login and issue a Sanctum token.
     * 
     * @param Request $request
     * @return JsonResponse
     * @throws ValidationException
     */
    public function login(Request $request): JsonResponse
    {
        $request->validate([
            'email' => 'required|email',
            'password' => 'required|string',
            'device_name' => 'string|max:255',
        ]);

        $user = User::where('email', $request->email)->first();

        if (!$user || !Hash::check($request->password, $user->password)) {
            throw ValidationException::withMessages([
                'email' => [__('auth.failed')],
            ]);
        }

        // Check if user is active (only if the column exists)
        if (isset($user->is_active) && !$user->is_active) {
            throw ValidationException::withMessages([
                'email' => ['This account is deactivated.'],
            ]);
        }

        // Get device name for token
        $deviceName = $request->device_name ?? 'nurse_mobile_' . $request->ip();

        // Revoke existing tokens for this device (optional - comment out if you want multiple sessions)
        $user->tokens()->where('name', $deviceName)->delete();

        // Create new token
        $token = $user->createToken($deviceName, ['*'])->plainTextToken;

        // Set token expiration (optional - Sanctum doesn't expire by default)
        // You can add expires_at to personal_access_tokens table if needed

        return response()->json([
            'success' => true,
            'token' => $token,
            'user' => [
                'id' => $user->id,
                'email' => $user->email,
                'name' => $user->name,
                'role' => $user->roles->first()?->name ?? 'unknown',
            ],
            'expires_at' => now()->addDays(30)->toIso8601String(), // Inform client of expected expiry
        ]);
    }

    /**
     * Logout and revoke the current token.
     * 
     * @param Request $request
     * @return JsonResponse
     */
    public function logout(Request $request): JsonResponse
    {
        // Revoke the current access token
        $request->user()->currentAccessToken()->delete();

        return response()->json([
            'success' => true,
            'message' => 'Logged out successfully',
        ]);
    }

    /**
     * Logout from all devices (revoke all tokens).
     * 
     * @param Request $request
     * @return JsonResponse
     */
    public function logoutAll(Request $request): JsonResponse
    {
        // Revoke all tokens for the user
        $request->user()->tokens()->delete();

        return response()->json([
            'success' => true,
            'message' => 'Logged out from all devices',
        ]);
    }

    /**
     * Get the current authenticated user.
     * 
     * @param Request $request
     * @return JsonResponse
     */
    public function user(Request $request): JsonResponse
    {
        $user = $request->user();

        return response()->json([
            'id' => $user->id,
            'email' => $user->email,
            'name' => $user->name,
            'role' => $user->roles->first()?->name ?? 'unknown',
            'permissions' => $user->getAllPermissions()->pluck('name'),
            'created_at' => $user->created_at->toIso8601String(),
        ]);
    }

    /**
     * Refresh the current token.
     * 
     * This revokes the current token and issues a new one.
     * 
     * @param Request $request
     * @return JsonResponse
     */
    public function refresh(Request $request): JsonResponse
    {
        $user = $request->user();
        $currentToken = $user->currentAccessToken();

        // Get the token name (device identifier)
        $deviceName = $currentToken->name;

        // Revoke the current token
        $currentToken->delete();

        // Create a new token with the same device name
        $newToken = $user->createToken($deviceName, ['*'])->plainTextToken;

        return response()->json([
            'success' => true,
            'token' => $newToken,
            'expires_at' => now()->addDays(30)->toIso8601String(),
        ]);
    }

    /**
     * Check authentication status.
     * 
     * @param Request $request
     * @return JsonResponse
     */
    public function check(Request $request): JsonResponse
    {
        return response()->json([
            'authenticated' => $request->user() !== null,
            'user' => $request->user() ? [
                'id' => $request->user()->id,
                'email' => $request->user()->email,
                'name' => $request->user()->name,
                'role' => $request->user()->roles->first()?->name ?? 'unknown',
            ] : null,
        ]);
    }
}
