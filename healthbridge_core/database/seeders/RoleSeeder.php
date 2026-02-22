<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Spatie\Permission\Models\Role;
use Spatie\Permission\Models\Permission;

class RoleSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        // Define roles
        $roles = [
            'nurse',
            'senior-nurse',
            'doctor',
            'radiologist',
            'dermatologist',
            'manager',
            'admin',
        ];

        // Define permissions
        $permissions = [
            // AI permissions
            'use-ai',
            'ai-explain-triage',
            'ai-caregiver-summary',
            'ai-specialist-review',
            'ai-imaging-interpretation',
            
            // Clinical permissions
            'view-cases',
            'view-own-cases',
            'view-all-cases',
            'create-referrals',
            'accept-referrals',
            'add-case-comments',
            
            // Radiology permissions (Phase 2)
            'view-radiology-worklist',
            'sign-reports',
            'request-second-opinion',
            'manage-procedures',
            'view-critical-findings',
            'receive-critical-alerts',
            'initiate-session',
            
            // Governance permissions
            'view-dashboards',
            'view-ai-console',
            'manage-prompts',
            'manage-users',
            'manage-roles',
        ];

        // Create permissions
        foreach ($permissions as $permission) {
            Permission::firstOrCreate(['name' => $permission, 'guard_name' => 'web']);
        }

        // Create roles and assign permissions
        foreach ($roles as $roleName) {
            $role = Role::firstOrCreate(['name' => $roleName, 'guard_name' => 'web']);
            
            // Assign permissions based on role
            $rolePermissions = $this->getRolePermissions($roleName);
            $role->syncPermissions($rolePermissions);
        }

        $this->command->info('Roles and permissions seeded successfully.');
    }

    /**
     * Get permissions for a specific role.
     */
    protected function getRolePermissions(string $role): array
    {
        return match ($role) {
            'nurse' => [
                'use-ai',
                'ai-explain-triage',
                'ai-caregiver-summary',
                'view-own-cases',
                'create-referrals',
                'add-case-comments',
            ],
            'senior-nurse' => [
                'use-ai',
                'ai-explain-triage',
                'ai-caregiver-summary',
                'view-cases',
                'view-own-cases',
                'create-referrals',
                'accept-referrals',
                'add-case-comments',
            ],
            'doctor' => [
                'use-ai',
                'ai-explain-triage',
                'ai-specialist-review',
                'view-cases',
                'view-all-cases',
                'create-referrals',
                'accept-referrals',
                'add-case-comments',
            ],
            'radiologist' => [
                'use-ai',
                'ai-imaging-interpretation',
                'view-cases',
                'view-all-cases',
                'accept-referrals',
                'add-case-comments',
                // Phase 2 permissions
                'view-radiology-worklist',
                'sign-reports',
                'request-second-opinion',
                'manage-procedures',
                'view-critical-findings',
                'receive-critical-alerts',
                'initiate-session',
            ],
            'dermatologist' => [
                'use-ai',
                'view-cases',
                'view-all-cases',
                'accept-referrals',
                'add-case-comments',
            ],
            'manager' => [
                'view-dashboards',
                'view-cases',
                'view-all-cases',
            ],
            'admin' => [
                'use-ai',
                'view-dashboards',
                'view-ai-console',
                'manage-prompts',
                'manage-users',
                'manage-roles',
                'view-cases',
                'view-all-cases',
            ],
            default => [],
        };
    }
}
