/**
 * CPT Format Directive Plugin
 * 
 * Registers the v-cpt-format directive for automatic CPT input formatting.
 */

import { cptFormat } from '~/directives/v-cpt-format';

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.directive('cpt-format', cptFormat);
});
