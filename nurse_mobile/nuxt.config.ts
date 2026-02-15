// https://nuxt.com/docs/api/configuration/nuxt-config
import { fileURLToPath, URL } from 'node:url';

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: [
    '@nuxt/ui',
    '@nuxtjs/i18n',
    'nuxt-zod-i18n',
    '@pinia/nuxt',
    '@nuxtjs/color-mode',
  ],
  css: ['~/assets/css/main.css'],
  alias: {
    '~': fileURLToPath(new URL('./app/', import.meta.url)),
    '@': fileURLToPath(new URL('./app/', import.meta.url)),
  },
  // @ts-ignore - i18n module types are loaded at runtime
  i18n: {
    locales: [
      { code: 'en', name: 'English' },
    ],
    defaultLocale: 'en',
    vueI18n: './i18n.config.ts'
  },
  ssr: false,
  colorMode: {
    preference: 'dark',
    fallback: 'dark',
    dataValue: 'theme',
    classSuffix: ''
  },
  runtimeConfig: {
    ollamaUrl: process.env.OLLAMA_URL || 'http://127.0.0.1:11434',
    ollamaModel: process.env.OLLAMA_MODEL || 'gemma3:4b',
    aiRateLimit: Number(process.env.AI_RATE_LIMIT) || 30,
    aiTimeout: Number(process.env.AI_TIMEOUT) || 60000,
    medgemmaApiKey: process.env.MEDGEMMA_API_KEY || 'HB-NURSE-001',

    public: {
      aiEnabled: process.env.AI_ENABLED === 'true',
      aiAuthToken: process.env.AI_AUTH_TOKEN || 'local-dev-token',
      aiEndpoint: process.env.OLLAMA_URL || 'http://127.0.0.1:11434',
      aiModel: process.env.OLLAMA_MODEL || 'gemma3:4b'
    }
  }
})