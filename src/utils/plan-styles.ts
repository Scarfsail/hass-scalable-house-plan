import { css, unsafeCSS } from 'lit-element';
import type { ReadabilityMode } from '../cards/types';

const DARK_TEXT_SHADOW = '0 0 2px rgba(0,0,0,0.68), 0 0 7px rgba(0,0,0,0.42), 0 0 12px rgba(0,0,0,0.2)';
const DARK_DROP_SHADOW = 'drop-shadow(0 0 4px rgba(0,0,0,0.9)) drop-shadow(0 0 8px rgba(0,0,0,0.6))';

const READABILITY_MODE_CSS_VARS: Record<ReadabilityMode, Record<string, string>> = {
    'bright-image': {
        '--shp-plan-text-color': 'rgba(22, 22, 22, 0.96)',
        '--shp-plan-neutral-color': 'rgba(64, 64, 64, 0.92)',
        '--shp-plan-text-shadow': '0 0 2px rgba(255,255,255,0.68), 0 0 7px rgba(255,255,255,0.38), 0 0 12px rgba(255,255,255,0.2)',
        '--shp-plan-drop-shadow': 'drop-shadow(0 0 1px rgba(255,255,255,0.82)) drop-shadow(0 0 4px rgba(255,255,255,0.42))',
        '--shp-overlay-surface': 'rgba(18, 18, 18, 0.72)',
        '--shp-overlay-surface-strong': 'rgba(18, 18, 18, 0.86)',
        '--shp-overlay-surface-text-color': 'rgba(255, 255, 255, 0.97)',
        '--shp-overlay-surface-text-shadow': DARK_TEXT_SHADOW,
        '--shp-overlay-surface-drop-shadow': DARK_DROP_SHADOW,
        '--shp-overlay-surface-last-change-text-muted': 'rgba(255, 255, 255, 0.86)',
        '--shp-overlay-surface-last-change-text-mid': 'rgba(255, 255, 255, 0.92)',
        '--shp-overlay-surface-last-change-text-recent': 'rgba(255, 255, 255, 0.96)',
        '--shp-overlay-surface-last-change-text-alert': 'rgba(255, 255, 255, 0.99)',
        '--shp-overlay-surface-last-change-text-strong': 'rgba(255, 255, 255, 0.98)',
        '--shp-overlay-surface-last-change-bg-muted': 'rgba(255, 255, 255, 0.1)',
        '--shp-overlay-surface-last-change-bg-mid': 'rgba(255, 255, 255, 0.14)',
        '--shp-overlay-surface-last-change-bg-recent': 'rgba(255, 255, 255, 0.18)',
        '--shp-overlay-surface-last-change-bg-alert': 'rgba(200, 60, 60, 0.44)',
        '--shp-overlay-surface-gauge-track': 'rgba(255, 255, 255, 0.16)',
        '--shp-overlay-surface-gauge-track-inset': 'rgba(255, 255, 255, 0.1)',
        '--shp-last-change-text-muted': 'rgba(72, 72, 72, 0.76)',
        '--shp-last-change-text-mid': 'rgba(46, 46, 46, 0.86)',
        '--shp-last-change-text-recent': 'rgba(24, 24, 24, 0.94)',
        '--shp-last-change-text-alert': 'rgba(12, 12, 12, 0.98)',
        '--shp-last-change-text-strong': 'rgba(18, 18, 18, 0.96)',
        '--shp-last-change-bg-muted': 'rgba(255, 255, 255, 0.26)',
        '--shp-last-change-bg-mid': 'rgba(255, 255, 255, 0.34)',
        '--shp-last-change-bg-recent': 'rgba(255, 255, 255, 0.42)',
        '--shp-last-change-bg-alert': 'rgba(180, 48, 48, 0.56)',
        '--shp-gauge-track': 'rgba(18, 18, 18, 0.3)',
        '--shp-gauge-track-inset': 'rgba(255, 255, 255, 0.35)',
    },
    'dark-image': {
        '--shp-plan-text-color': 'rgba(255, 255, 255, 0.96)',
        '--shp-plan-neutral-color': 'gray',
        '--shp-plan-text-shadow': DARK_TEXT_SHADOW,
        '--shp-plan-drop-shadow': DARK_DROP_SHADOW,
        '--shp-overlay-surface': 'rgba(0, 0, 0, 0.6)',
        '--shp-overlay-surface-strong': 'rgba(0, 0, 0, 0.8)',
        '--shp-overlay-surface-text-color': 'rgba(255, 255, 255, 0.97)',
        '--shp-overlay-surface-text-shadow': DARK_TEXT_SHADOW,
        '--shp-overlay-surface-drop-shadow': DARK_DROP_SHADOW,
        '--shp-overlay-surface-last-change-text-muted': 'rgba(255, 255, 255, 0.86)',
        '--shp-overlay-surface-last-change-text-mid': 'rgba(255, 255, 255, 0.92)',
        '--shp-overlay-surface-last-change-text-recent': 'rgba(255, 255, 255, 0.96)',
        '--shp-overlay-surface-last-change-text-alert': 'rgba(255, 255, 255, 0.99)',
        '--shp-overlay-surface-last-change-text-strong': 'rgba(255, 255, 255, 0.98)',
        '--shp-overlay-surface-last-change-bg-muted': 'rgba(255, 255, 255, 0.12)',
        '--shp-overlay-surface-last-change-bg-mid': 'rgba(255, 255, 255, 0.16)',
        '--shp-overlay-surface-last-change-bg-recent': 'rgba(255, 255, 255, 0.2)',
        '--shp-overlay-surface-last-change-bg-alert': 'rgba(200, 60, 60, 0.55)',
        '--shp-overlay-surface-gauge-track': 'rgba(255, 255, 255, 0.14)',
        '--shp-overlay-surface-gauge-track-inset': 'rgba(255, 255, 255, 0.08)',
        '--shp-last-change-text-muted': 'rgba(214, 214, 214, 0.68)',
        '--shp-last-change-text-mid': 'rgba(230, 230, 230, 0.84)',
        '--shp-last-change-text-recent': 'rgba(246, 246, 246, 0.94)',
        '--shp-last-change-text-alert': 'rgba(255, 255, 255, 1)',
        '--shp-last-change-text-strong': 'rgba(255, 255, 255, 1)',
        '--shp-last-change-bg-muted': 'rgba(0, 0, 0, 0.3)',
        '--shp-last-change-bg-mid': 'rgba(180, 180, 180, 0.25)',
        '--shp-last-change-bg-recent': 'rgba(220, 220, 220, 0.3)',
        '--shp-last-change-bg-alert': 'rgba(200, 60, 60, 0.4)',
        '--shp-gauge-track': 'rgba(0, 0, 0, 0.2)',
        '--shp-gauge-track-inset': 'rgba(255, 255, 255, 0.25)',
    }
};

export const getReadabilityModeCssVars = (mode: ReadabilityMode): Record<string, string> =>
    READABILITY_MODE_CSS_VARS[mode] ?? READABILITY_MODE_CSS_VARS['bright-image'];

/**
 * Dark halo text shadow — makes white text readable on any background.
 * Invisible on dark backgrounds, provides contrast on light ones.
 */
export const planTextShadow = css`text-shadow: var(--shp-plan-text-shadow, ${unsafeCSS(DARK_TEXT_SHADOW)})`;

/**
 * Dark halo drop-shadow filter — same visual treatment as planTextShadow but for
 * non-text elements (icons, gauge bars). Traces the element shape, not its bounding box.
 */
export const planDropShadow = css`filter: var(--shp-plan-drop-shadow, ${unsafeCSS(DARK_DROP_SHADOW)})`;
