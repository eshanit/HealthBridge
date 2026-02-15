<?php

namespace Database\Seeders;

use App\Models\User;
// use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        // Run role seeder first
        $this->call(RoleSeeder::class);

        // Create test users with different roles
        $users = [
            [
                'name' => 'Admin User',
                'email' => 'admin@healthbridge.org',
                'role' => 'admin',
            ],
            [
                'name' => 'Dr. Sarah Johnson',
                'email' => 'doctor@healthbridge.org',
                'role' => 'doctor',
            ],
            [
                'name' => 'Nurse Mary Smith',
                'email' => 'nurse@healthbridge.org',
                'role' => 'nurse',
            ],
            [
                'name' => 'Senior Nurse Jane Doe',
                'email' => 'senior-nurse@healthbridge.org',
                'role' => 'senior-nurse',
            ],
            [
                'name' => 'Dr. Radiologist',
                'email' => 'radiologist@healthbridge.org',
                'role' => 'radiologist',
            ],
            [
                'name' => 'Manager Tom Wilson',
                'email' => 'manager@healthbridge.org',
                'role' => 'manager',
            ],
        ];

        foreach ($users as $userData) {
            $user = User::firstOrCreate(
                ['email' => $userData['email']],
                [
                    'name' => $userData['name'],
                    'password' => Hash::make('password'),
                ]
            );

            $user->assignRole($userData['role']);
        }

        $this->command->info('Test users created successfully.');
        $this->command->info('Default password for all users: password');
    }
}
