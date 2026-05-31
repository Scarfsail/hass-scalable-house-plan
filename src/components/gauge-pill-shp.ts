import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';

/**
 * Shared "pill" visual primitive: a clipped, rounded track with a colored fill
 * anchored to the bottom whose height encodes a value (0-100%), and arbitrary
 * content layered on top via the default slot.
 *
 * Used by analog-text-shp (current value behind the reading) and
 * last-change-text-shp (remaining-time countdown). Layout (display, width, text
 * alignment, font) is the consumer's concern and is controlled from outside via
 * normal CSS on the host element.
 */
@customElement('gauge-pill-shp')
export class GaugePill extends LitElement {
  /** Fill height as a percentage (0-100). */
  @property({ type: Number }) public fillPercent = 0;

  /** Fill color (any CSS color, including a CSS variable expression). */
  @property() public color = 'transparent';

  /** When set, the fill flashes (opacity fade in/out) for emphasis. */
  @property({ type: Boolean, reflect: true }) public pulse = false;

  static styles = css`
    :host {
      display: inline-block;
      position: relative;
    }

    .pill {
      position: relative;
      padding: var(--shp-gauge-pill-padding, 1px 8px);
      border-radius: var(--shp-gauge-pill-radius, 999px);
      overflow: hidden;
    }

    .track {
      position: absolute;
      inset: 0;
      overflow: hidden;
      z-index: 0;
    }

    .track-bg {
      position: absolute;
      inset: 0;
      background-color: var(--shp-gauge-text-bg-track, rgba(0, 0, 0, 0.4));
    }

    .fill {
      position: absolute;
      left: 0;
      bottom: 0;
      width: 100%;
      opacity: 0.6;
      transition: height 0.3s ease, background-color 0.3s ease;
    }

    :host([pulse]) .fill {
      animation: shp-pill-flash 2s ease-in-out infinite;
    }

    @keyframes shp-pill-flash {
      0%, 100% { opacity: 0.65; }
      50% { opacity: 0.1; }
    }

    /* Positioned wrapper keeps all slotted content — including bare text
       nodes, which ::slotted() can't target — above the absolutely positioned
       fill. */
    .content {
      position: relative;
      z-index: 1;
    }
  `;

  render() {
    return html`
      <div class="pill">
        <div class="track">
          <div class="track-bg"></div>
          <div class="fill" style=${styleMap({
            height: `${this.fillPercent}%`,
            backgroundColor: this.color,
          })}></div>
        </div>
        <div class="content"><slot></slot></div>
      </div>
    `;
  }
}
