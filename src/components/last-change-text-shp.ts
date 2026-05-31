import { LitElement, html, css, PropertyValues } from 'lit';
import { customElement, property, state } from "lit/decorators.js";
import { styleMap } from 'lit/directives/style-map.js';
import { Utils } from '../utils/utils';
import type { HassEntity } from 'home-assistant-js-websocket';
import { timerService } from '../utils/timer-service';
import './gauge-pill-shp';

/** Time window (seconds) over which the red fill drains from full to empty. */
const COUNTDOWN_WINDOW_SECONDS = 120;

@customElement('last-change-text-shp')
class LastChangeText extends LitElement {
  @property({ attribute: false }) public entity?: HassEntity;
  @property({ attribute: false }) public secondsForSuperHighlight?: number;

  /** Override the track (inactive background) color, e.g. while occupied. */
  @property() public trackColor?: string;

  /** When false, keep the text at full brightness after the countdown drains
   *  instead of muting it — used to show how long a room stays occupied. */
  @property({ attribute: false }) public muteWhenIdle: boolean = true;

  @state() private _text: string = '';
  @state() private _fillPercent: number = 0;
  @state() private _pulse: boolean = false;
  private _timerCallback?: () => void;

  static styles = css`
    :host {
      font-size: 11px;
      white-space: nowrap;
      line-height: normal;
      color: var(--shp-last-change-text-color, white);
    }

    gauge-pill-shp {
      display: block;
      text-align: center;
      transition: color 0.3s ease;
      --shp-gauge-pill-padding: var(--shp-last-change-pill-padding, 1px 5px);
    }

    /* Once the countdown has fully drained (track-only, no active fill), mute
       the text so a stale timestamp recedes into the background. The track
       itself stays as-is. */
    gauge-pill-shp.idle {
      color: var(--shp-last-change-idle-text-color, rgba(255, 255, 255, 0.55));
    }
  `;

  connectedCallback() {
    super.connectedCallback();
    // Bind and subscribe to shared timer service
    this._timerCallback = this._update.bind(this);
    timerService.subscribe(this._timerCallback);
    this._update();
  }

  disconnectedCallback() {
    // Unsubscribe from shared timer service
    if (this._timerCallback) {
      timerService.unsubscribe(this._timerCallback);
    }
    super.disconnectedCallback();
  }

  willUpdate(changed: PropertyValues): void {
    // Recompute immediately on a new state instead of waiting for the next tick.
    if (changed.has('entity') || changed.has('secondsForSuperHighlight')) {
      this._update();
    }
  }

  /**
   * Called by the shared timer service every second (and on state changes).
   * Computes the duration text plus the remaining-time fill: a full red pill at
   * the moment of change, draining linearly to empty over the countdown window,
   * after which only the track shows. Assigning @state only re-renders when a
   * value actually changes, so an idle (empty) pill costs nothing per tick.
   */
  private _update(): void {
    if (!this.entity) return;

    const lastChanged = this.entity.attributes["state_last_changed"] ?? this.entity.last_changed;
    this._text = Utils.formatDurationFromTo(lastChanged, undefined, 2);

    const secondsSinceChange = lastChanged
      ? (Date.now() - new Date(lastChanged).getTime()) / 1000
      : Infinity;

    this._fillPercent = Math.max(0, Math.min(100, Math.round(100 * (1 - secondsSinceChange / COUNTDOWN_WINDOW_SECONDS))));
    this._pulse = !!this.secondsForSuperHighlight && secondsSinceChange <= this.secondsForSuperHighlight;
  }

  render() {
    if (!this.entity)
      return html`<div>No entity defined</div>`;

    const muted = this._fillPercent === 0 && this.muteWhenIdle;

    return html`
      <gauge-pill-shp
        class=${muted ? 'idle' : ''}
        style=${styleMap(this.trackColor ? { '--shp-gauge-text-bg-track': this.trackColor } : {})}
        .fillPercent=${this._fillPercent}
        .color=${'var(--shp-last-change-fill, #6f9fd8)'}
        ?pulse=${this._pulse}
      >${this._text}</gauge-pill-shp>
    `;
  }
}
