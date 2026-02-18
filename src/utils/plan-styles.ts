import { css } from 'lit-element';

/**
 * Dark halo text shadow — makes white text readable on any background.
 * Invisible on dark backgrounds, provides contrast on light ones.
 */
export const planTextShadow = css`text-shadow: 0 0 4px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.6)`;

/**
 * Dark halo drop-shadow filter — same visual treatment as planTextShadow but for
 * non-text elements (icons, gauge bars). Traces the element shape, not its bounding box.
 */
export const planDropShadow = css`filter: drop-shadow(0 0 4px rgba(0,0,0,0.9)) drop-shadow(0 0 8px rgba(0,0,0,0.6))`;
