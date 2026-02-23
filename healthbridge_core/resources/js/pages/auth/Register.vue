<script setup lang="ts">
import { Head } from '@inertiajs/vue3';
import TextLink from '@/components/TextLink.vue';
import { Button } from '@/components/ui/button';
import AuthBase from '@/layouts/AuthLayout.vue';
import { login } from '@/routes';
</script>

<template>
    <AuthBase
        title="Create an account"
        description="Account registration"
    >
        <Head title="Register" />

        <div class="flex flex-col gap-6">
            <!-- Registration Disabled Message -->
            <div class="rounded-lg border border-amber-200 bg-amber-50 p-6 dark:border-amber-800 dark:bg-amber-950/30">
                <div class="flex items-start gap-3">
                    <svg xmlns="http://www.w3.org/2000/svg" class="size-6 shrink-0 text-amber-600 dark:text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                        <line x1="12" y1="9" x2="12" y2="13"/>
                        <line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                    <div>
                        <h3 class="font-semibold text-amber-800 dark:text-amber-200">Registration Disabled</h3>
                        <p class="mt-1 text-sm text-amber-700 dark:text-amber-300">
                            At the moment, account creation is not enabled. Please use one of the following test accounts:
                        </p>
                    </div>
                </div>
            </div>

            <!-- Test Account Information -->
            <div class="space-y-4">
                <div class="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
                    <h4 class="mb-3 font-medium text-slate-900 dark:text-slate-100">Available Test Accounts</h4>
                    
                    <div class="space-y-3">
                        <!-- Doctor Account -->
                        <div class="flex items-start gap-3 rounded-md bg-white p-3 dark:bg-slate-800">
                            <div class="flex size-8 shrink-0 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
                                <svg xmlns="http://www.w3.org/2000/svg" class="size-4 text-blue-600 dark:text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                                    <circle cx="9" cy="7" r="4"/>
                                    <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
                                    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                                </svg>
                            </div>
                            <div class="flex-1">
                                <p class="text-sm font-medium text-slate-900 dark:text-slate-100">Doctor Account</p>
                                <p class="text-sm text-slate-600 dark:text-slate-400">
                                    <span class="font-mono">doctor@healthbridge.org</span>
                                </p>
                            </div>
                        </div>

                        <!-- Radiologist Account -->
                        <div class="flex items-start gap-3 rounded-md bg-white p-3 dark:bg-slate-800">
                            <div class="flex size-8 shrink-0 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900/30">
                                <svg xmlns="http://www.w3.org/2000/svg" class="size-4 text-purple-600 dark:text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <rect width="18" height="18" x="3" y="3" rx="2"/>
                                    <path d="M3 9h18"/>
                                    <path d="M9 21V9"/>
                                </svg>
                            </div>
                            <div class="flex-1">
                                <p class="text-sm font-medium text-slate-900 dark:text-slate-100">Radiologist Account</p>
                                <p class="text-sm text-slate-600 dark:text-slate-400">
                                    <span class="font-mono">radiologist@healthbridge.org</span>
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Password Information -->
                <div class="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
                    <div class="flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" class="size-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
                            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                        </svg>
                        <span class="text-sm text-slate-600 dark:text-slate-400">Password for all test accounts:</span>
                        <code class="rounded bg-slate-200 px-2 py-0.5 text-sm font-mono dark:bg-slate-700">password</code>
                    </div>
                </div>
            </div>

            <!-- Login Button -->
            <Button
                as="a"
                :href="login()"
                class="mt-2 w-full"
            >
                Go to Login
            </Button>

            <p class="text-center text-sm text-muted-foreground">
                Need assistance? Contact your system administrator.
            </p>
        </div>
    </AuthBase>
</template>
