import { wayfinder } from '@laravel/vite-plugin-wayfinder';
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import laravel from 'laravel-vite-plugin';
import { defineConfig } from 'vite';

export default defineConfig({
    plugins: [
        laravel({
            input: ['resources/js/app.ts'],
            ssr: 'resources/js/ssr.ts',
            refresh: true,
        }),
        tailwindcss(),
        wayfinder({
            formVariants: true,
        }),
        vue({
            template: {
                transformAssetUrls: {
                    base: null,
                    includeAbsolute: false,
                },
            },
        }),
    ],
    // Handle cornerstone and dicom-parser as external for browser
    define: {
        'process.env': {},
    },
    resolve: {
        alias: {
            // Map cornerstone-core to global if needed
        },
    },
    optimizeDeps: {
        include: ['dicom-parser'],
    },
    build: {
        rollupOptions: {
            external: ['cornerstone-core', 'cornerstone-wado-image-loader'],
            output: {
                globals: {
                    'cornerstone-core': 'cornerstone',
                    'cornerstone-wado-image-loader': 'cornerstoneWADOImageLoader',
                },
            },
        },
    },
});
