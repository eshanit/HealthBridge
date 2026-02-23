<script setup lang="ts">
import { Head, Link } from '@inertiajs/vue3';
import { dashboard, login, register } from '@/routes';

withDefaults(
    defineProps<{
        canRegister: boolean;
    }>(),
    {
        canRegister: true,
    },
);
</script>

<template>
    <Head title="Welcome - Healthbridge">
        <link rel="preconnect" href="https://rsms.me/" />
        <link rel="stylesheet" href="https://rsms.me/inter/inter.css" />
    </Head>
    <div
        class="flex min-h-screen flex-col items-center bg-gradient-to-br from-slate-50 to-blue-50 p-6 text-slate-900 lg:justify-center lg:p-8 dark:from-slate-950 dark:to-slate-900 dark:text-slate-100"
    >
        <header
            class="mb-6 w-full max-w-[335px] text-sm not-has-[nav]:hidden lg:max-w-4xl"
        >
            <nav class="flex items-center justify-between gap-4">
                <!-- Healthbridge Logo -->
                <div class="flex items-center gap-2">
                    <div class="flex size-8 items-center justify-center rounded-lg bg-blue-600 text-white">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="size-5 fill-current">
                            <path d="M21 8V6H19V8H17V6H15V8H13V6H11V8H9V6H7V8H5V6H3V8H1V10H3V12H1V14H3V16H1V18H3V20H5V18H7V20H9V18H11V20H13V18H15V20H17V18H19V20H21V18H23V16H21V14H23V12H21V10H23V8H21ZM5 16V10H7V16H5ZM9 16V10H11V16H9ZM13 16V10H15V16H13ZM17 16V10H19V16H17Z"/>
                            <path d="M10 3H14V5H10V3ZM10 5H14V7H10V5ZM8 5H10V7H8V5ZM14 5H16V7H14V5Z" opacity="0.8"/>
                        </svg>
                    </div>
                    <span class="text-lg font-bold text-slate-900 dark:text-white">Healthbridge</span>
                </div>
                
                <div class="flex items-center gap-4">
                    <Link
                        v-if="$page.props.auth.user"
                        :href="dashboard()"
                        class="inline-block rounded-lg border border-slate-200 bg-white px-5 py-1.5 text-sm leading-normal text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                        Dashboard
                    </Link>
                    <template v-else>
                        <Link
                            :href="login()"
                            class="inline-block rounded-lg bg-blue-600 px-5 py-1.5 text-sm leading-normal text-white shadow-sm hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
                        >
                            Log in
                        </Link>
                    </template>
                </div>
            </nav>
        </header>
        <div
            class="flex w-full items-center justify-center opacity-100 transition-opacity duration-750 lg:grow starting:opacity-0"
        >
            <main
                class="flex w-full max-w-[335px] flex-col overflow-hidden rounded-2xl bg-white shadow-xl lg:max-w-4xl lg:flex-row dark:bg-slate-900"
            >
                <div
                    class="flex-1 rounded-br-2xl rounded-bl-2xl p-6 pb-12 text-[13px] leading-[20px] lg:rounded-bl-2xl lg:rounded-tr-none lg:p-16 dark:bg-slate-900"
                >
                    <h1 class="mb-2 text-2xl font-bold text-slate-900 dark:text-white lg:text-3xl">
                        Bridging Healthcare Together
                    </h1>
                    <p class="mb-6 text-slate-600 dark:text-slate-400">
                        Healthbridge connects healthcare providers, streamlines clinical workflows, 
                        and empowers better patient outcomes through intelligent technology.
                    </p>
                    
                    <!-- Feature highlights -->
                    <div class="mb-8 space-y-4">
                        <div class="flex items-start gap-3">
                            <div class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
                                <svg xmlns="http://www.w3.org/2000/svg" class="size-4 text-blue-600 dark:text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                                    <circle cx="9" cy="7" r="4"/>
                                    <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
                                    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                                </svg>
                            </div>
                            <div>
                                <h3 class="font-semibold text-slate-900 dark:text-white">Patient Management</h3>
                                <p class="text-slate-600 dark:text-slate-400">Comprehensive patient records and queue management for efficient care delivery.</p>
                            </div>
                        </div>
                        
                        <div class="flex items-start gap-3">
                            <div class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                                <svg xmlns="http://www.w3.org/2000/svg" class="size-4 text-emerald-600 dark:text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                                    <path d="m9 12 2 2 4-4"/>
                                </svg>
                            </div>
                            <div>
                                <h3 class="font-semibold text-slate-900 dark:text-white">Clinical Decision Support</h3>
                                <p class="text-slate-600 dark:text-slate-400">AI-powered triage and diagnostic assistance for healthcare providers.</p>
                            </div>
                        </div>
                        
                        <div class="flex items-start gap-3">
                            <div class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30">
                                <svg xmlns="http://www.w3.org/2000/svg" class="size-4 text-purple-600 dark:text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <rect width="18" height="18" x="3" y="3" rx="2"/>
                                    <path d="M3 9h18"/>
                                    <path d="M9 21V9"/>
                                </svg>
                            </div>
                            <div>
                                <h3 class="font-semibold text-slate-900 dark:text-white">Integrated Radiology</h3>
                                <p class="text-slate-600 dark:text-slate-400">Seamless radiology study management and diagnostic imaging workflows.</p>
                            </div>
                        </div>
                    </div>
                    
                    <div class="flex flex-col gap-3 sm:flex-row">
                        <Link
                            v-if="!$page.props.auth.user"
                            :href="login()"
                            class="inline-flex items-center justify-center rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
                        >
                            Sign In
                            <svg xmlns="http://www.w3.org/2000/svg" class="ml-2 size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M5 12h14"/>
                                <path d="m12 5 7 7-7 7"/>
                            </svg>
                        </Link>
                    </div>
                </div>
                
                <!-- Hero illustration side -->
                <div
                    class="relative -mb-px aspect-335/376 w-full shrink-0 overflow-hidden rounded-t-2xl bg-gradient-to-br from-blue-500 to-blue-700 lg:mb-0 lg:aspect-auto lg:w-[400px] lg:rounded-t-none lg:rounded-r-2xl"
                >
                    <!-- Healthcare illustration -->
                    <div class="absolute inset-0 flex items-center justify-center p-8">
                        <div class="relative">
                            <!-- Main medical cross -->
                            <div class="absolute inset-0 flex items-center justify-center">
                                <div class="size-48 rounded-full bg-white/10 backdrop-blur-sm"></div>
                            </div>
                            <div class="absolute inset-0 flex items-center justify-center">
                                <div class="size-32 rounded-full bg-white/20 backdrop-blur-sm"></div>
                            </div>
                            
                            <!-- Medical cross icon -->
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="relative z-10 size-24 text-white drop-shadow-lg">
                                <path fill="currentColor" d="M19 3H5C3.9 3 3 3.9 3 5V19C3 20.1 3.9 21 5 21H19C20.1 21 21 20.1 21 19V5C21 3.9 20.1 3 19 3ZM18 14H14V18H10V14H6V10H10V6H14V10H18V14Z"/>
                            </svg>
                            
                            <!-- Floating elements -->
                            <div class="absolute -left-16 -top-8 size-12 rounded-xl bg-white/20 backdrop-blur-sm"></div>
                            <div class="absolute -right-12 top-4 size-8 rounded-lg bg-white/15 backdrop-blur-sm"></div>
                            <div class="absolute -bottom-8 -left-8 size-10 rounded-lg bg-white/15 backdrop-blur-sm"></div>
                            <div class="absolute -bottom-12 right-0 size-14 rounded-xl bg-white/20 backdrop-blur-sm"></div>
                            
                            <!-- Heart rate line -->
                            <svg class="absolute -right-24 top-1/2 size-20 text-white/40" viewBox="0 0 100 50">
                                <path d="M0 25 L20 25 L25 25 L30 10 L35 40 L40 25 L45 25 L50 25 L55 25 L60 5 L65 45 L70 25 L75 25 L100 25" 
                                      fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        </div>
                    </div>
                    
                    <!-- Decorative grid pattern -->
                    <div class="absolute inset-0 opacity-10">
                        <svg class="size-full" xmlns="http://www.w3.org/2000/svg">
                            <defs>
                                <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
                                    <path d="M 32 0 L 0 0 0 32" fill="none" stroke="white" stroke-width="0.5"/>
                                </pattern>
                            </defs>
                            <rect width="100%" height="100%" fill="url(#grid)"/>
                        </svg>
                    </div>
                </div>
            </main>
        </div>
        
        <!-- Footer -->
        <footer class="mt-8 w-full max-w-[335px] text-center text-xs text-slate-500 lg:max-w-4xl dark:text-slate-500">
            <p>&copy; 2024 Healthbridge. Empowering healthcare providers worldwide.</p>
        </footer>
    </div>
</template>
