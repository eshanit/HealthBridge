/**
 * Clipboard Access Composable
 * 
 * Provides reactive clipboard functionality using vueUse
 * for copy/paste operations with fallback support
 */

import { useClipboard as useVueUseClipboard } from '@vueuse/core'

export interface UseClipboardOptions {
  source?: string
  copiedDuring?: number
  legacy?: boolean
}

export interface UseClipboardReturn {
  text: Ref<string>
  copied: Ref<boolean>
  isSupported: Ref<boolean>
  copy: (text?: string) => Promise<void>
}

/**
 * Reactive clipboard composable
 * 
 * @param options - Configuration options
 * @returns Clipboard functionality
 */
export function useClipboard(options: UseClipboardOptions = {}): UseClipboardReturn {
  const {
    source = ref(''),
    copiedDuring = 2000,
    legacy = false
  } = options

  const { text, copied, isSupported, copy } = useVueUseClipboard({
    source,
    copiedDuring,
    legacy
  })

  return {
    text,
    copied,
    isSupported,
    copy
  }
}

/**
 * Simple copy function for one-time use
 * 
 * @param text - Text to copy to clipboard
 * @returns Promise that resolves when copied
 */
export async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
  } catch (error) {
    // Fallback for older browsers
    const textArea = document.createElement('textarea')
    textArea.value = text
    textArea.style.position = 'fixed'
    textArea.style.left = '-999999px'
    textArea.style.top = '-999999px'
    document.body.appendChild(textArea)
    textArea.focus()
    textArea.select()
    
    try {
      document.execCommand('copy')
    } catch (err) {
      console.error('Failed to copy text: ', err)
    }
    
    document.body.removeChild(textArea)
  }
}