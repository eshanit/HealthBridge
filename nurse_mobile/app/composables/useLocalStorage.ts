/**
 * Local Storage Composable
 * 
 * Provides reactive localStorage functionality with type safety
 * and error handling for unsupported environments
 */

import { ref, watch, onMounted, onUnmounted, type Ref } from 'vue'
import { tryOnScopeDispose } from '@vueuse/core'

export interface UseLocalStorageOptions<T> {
  defaultValue?: T
  serializer?: {
    read: (value: string) => T
    write: (value: T) => string
  }
  onError?: (error: Error) => void
}

export interface UseLocalStorageReturn<T> {
  value: Ref<T>
  error: Ref<Error | null>
  isSupported: Ref<boolean>
  remove: () => void
  set: (value: T) => void
}

/**
 * Default serializer for localStorage
 */
const defaultSerializer = {
  read: (value: string) => {
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  },
  write: (value: any) => JSON.stringify(value)
}

/**
 * Reactive localStorage composable
 * 
 * @param key - Storage key
 * @param options - Configuration options
 * @returns localStorage functionality
 */
export function useLocalStorage<T = any>(
  key: string, 
  options: UseLocalStorageOptions<T> = {}
): UseLocalStorageReturn<T> {
  const {
    defaultValue,
    serializer = defaultSerializer,
    onError
  } = options

  const value = ref<T>(defaultValue)
  const error = ref<Error | null>(null)
  const isSupported = ref<boolean>(false)

  // Check if localStorage is supported
  const checkSupport = () => {
    try {
      if (typeof window === 'undefined' || !window.localStorage) {
        isSupported.value = false
        return
      }
      
      // Test write/read
      const testKey = '__localStorage_test__'
      localStorage.setItem(testKey, 'test')
      localStorage.removeItem(testKey)
      isSupported.value = true
    } catch (err) {
      isSupported.value = false
      error.value = err as Error
      if (onError) {
        onError(err as Error)
      }
    }
  }

  // Read from localStorage
  const read = () => {
    if (!isSupported.value) return

    try {
      const rawValue = localStorage.getItem(key)
      if (rawValue === null) {
        value.value = defaultValue as T
      } else {
        value.value = serializer.read(rawValue)
      }
    } catch (err) {
      error.value = err as Error
      if (onError) {
        onError(err as Error)
      }
    }
  }

  // Write to localStorage
  const write = (newValue: T) => {
    if (!isSupported.value) return

    try {
      const serializedValue = serializer.write(newValue)
      localStorage.setItem(key, serializedValue)
      value.value = newValue
    } catch (err) {
      error.value = err as Error
      if (onError) {
        onError(err as Error)
      }
    }
  }

  // Set value (alias for write)
  const set = (newValue: T) => {
    write(newValue)
  }

  // Remove from localStorage
  const remove = () => {
    if (!isSupported.value) return

    try {
      localStorage.removeItem(key)
      value.value = defaultValue as T
    } catch (err) {
      error.value = err as Error
      if (onError) {
        onError(err as Error)
      }
    }
  }

  // Watch for changes and sync to localStorage
  watch(value, (newValue) => {
    write(newValue)
  }, { deep: true })

  // Listen for storage events from other tabs
  const handleStorageChange = (event: StorageEvent) => {
    if (event.key === key && event.newValue !== null) {
      try {
        value.value = serializer.read(event.newValue)
      } catch (err) {
        error.value = err as Error
        if (onError) {
          onError(err as Error)
        }
      }
    }
  }

  onMounted(() => {
    checkSupport()
    read()
    window.addEventListener('storage', handleStorageChange)
  })

  onUnmounted(() => {
    window.removeEventListener('storage', handleStorageChange)
  })

  return {
    value,
    error,
    isSupported,
    remove,
    set
  }
}

/**
 * Simple localStorage utility for one-time operations
 * 
 * @param key - Storage key
 * @param value - Value to store
 * @param options - Serializer options
 */
export function setLocalStorage<T = any>(
  key: string, 
  value: T, 
  options: UseLocalStorageOptions<T> = {}
): boolean {
  const { serializer = defaultSerializer } = options

  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return false
    }

    const serializedValue = serializer.write(value)
    localStorage.setItem(key, serializedValue)
    return true
  } catch {
    return false
  }
}

/**
 * Simple localStorage utility for one-time retrieval
 * 
 * @param key - Storage key
 * @param defaultValue - Default value if not found
 * @param options - Serializer options
 */
export function getLocalStorage<T = any>(
  key: string, 
  defaultValue?: T, 
  options: UseLocalStorageOptions<T> = {}
): T | null {
  const { serializer = defaultSerializer } = options

  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return defaultValue || null
    }

    const rawValue = localStorage.getItem(key)
    if (rawValue === null) {
      return defaultValue || null
    }

    return serializer.read(rawValue)
  } catch {
    return defaultValue || null
  }
}

/**
 * Remove item from localStorage
 * 
 * @param key - Storage key
 */
export function removeLocalStorage(key: string): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return false
    }

    localStorage.removeItem(key)
    return true
  } catch {
    return false
  }
}