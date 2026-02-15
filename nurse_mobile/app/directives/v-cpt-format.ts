/**
 * CPT Format Directive
 * 
 * Formats input to uppercase alphanumeric, limits to 4 characters,
 * and validates against the CPT character set.
 */

import type { Directive, DirectiveBinding } from 'vue';

const PERMITTED_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function isValidChar(char: string): boolean {
  return PERMITTED_CHARS.includes(char.toUpperCase());
}

export const cptFormat: Directive = {
  mounted(el: HTMLInputElement, binding: DirectiveBinding) {
    el.addEventListener('input', (e: Event) => {
      const target = e.target as HTMLInputElement;
      const value = target.value;
      
      // Filter to only valid CPT characters
      const filtered = value
        .toUpperCase()
        .split('')
        .filter(char => isValidChar(char))
        .join('')
        .slice(0, 4);
      
      // Only update if value changed
      if (filtered !== value) {
        target.value = filtered;
        
        // Trigger input event for v-model binding
        target.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });

    el.addEventListener('blur', () => {
      const target = el as HTMLInputElement;
      const value = target.value;
      
      // Auto-format: uppercase
      const formatted = value.toUpperCase();
      
      if (formatted !== value) {
        target.value = formatted;
        target.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
  }
};

export default cptFormat;
