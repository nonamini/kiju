import type { Plugin } from 'vite';

/**
 * Vite dev middleware plugin allowing direct local USI executable (.exe)
 * browsing, probing, and stdio communication from the browser in local workstation mode (#143).
 */
export function localUsiDevPlugin(): Plugin;
