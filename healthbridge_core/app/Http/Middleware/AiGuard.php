<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

class AiGuard
{
    /**
     * Handle an incoming request.
     *
     * This middleware checks if the authenticated user's role is permitted
     * to perform the requested AI task based on the policy configuration.
     */
    public function handle(Request $request, Closure $next): Response
    {
        $user = Auth::user();
        
        if (!$user) {
            return response()->json([
                'error' => 'Unauthenticated',
                'message' => 'You must be logged in to access the AI gateway.',
            ], 401);
        }

        $task = $request->input('task');
        
        if (!$task) {
            return response()->json([
                'error' => 'Missing task',
                'message' => 'The "task" field is required.',
            ], 400);
        }

        // Get the user's role (assuming the User model has a roles relationship)
        $userRole = $this->getUserRole($user);
        
        if (!$userRole) {
            return response()->json([
                'error' => 'No role assigned',
                'message' => 'Your account does not have an assigned role.',
            ], 403);
        }

        // Check if the task is valid
        $allowedTasks = config("ai_policy.roles.{$userRole}", []);
        
        if (!in_array($task, $allowedTasks)) {
            return response()->json([
                'error' => 'Unauthorized task',
                'message' => "Your role ({$userRole}) is not authorized to perform the '{$task}' task.",
                'allowed_tasks' => $allowedTasks,
            ], 403);
        }

        // Check if the task is configured
        $taskConfig = config("ai_policy.tasks.{$task}");
        
        if (!$taskConfig) {
            return response()->json([
                'error' => 'Invalid task',
                'message' => "The task '{$task}' is not configured in the system.",
            ], 400);
        }

        // Store task config in request for later use
        $request->attributes->set('ai_task_config', $taskConfig);
        $request->attributes->set('ai_user_role', $userRole);

        return $next($request);
    }

    /**
     * Get the user's primary role.
     */
    protected function getUserRole($user): ?string
    {
        // If using spatie/laravel-permission
        if (method_exists($user, 'hasRole') && method_exists($user, 'getRoleNames')) {
            $roles = $user->getRoleNames();
            return $roles->first();
        }

        // Fallback: check if user has a role column
        if (isset($user->role)) {
            return $user->role;
        }

        // Check if user has a roles relationship
        if (method_exists($user, 'roles') && $user->roles()->exists()) {
            return $user->roles->first()?->name;
        }

        return null;
    }
}
