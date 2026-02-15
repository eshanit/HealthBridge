// Type augmentation for @nuxtjs/i18n module
import type { NuxtI18nOptions } from '@nuxtjs/i18n'

declare module '@nuxt/schema' {
  interface NuxtConfig {
    i18n?: NuxtI18nOptions
  }
}

export {}
