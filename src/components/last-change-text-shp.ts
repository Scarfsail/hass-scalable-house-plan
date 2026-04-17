import { LitElement, html, css } from 'lit-element';
import { customElement, property, state } from "lit/decorators.js";
import dayjs from 'dayjs';
import { Utils } from '../utils/utils';
import type { HassEntity } from 'home-assistant-js-websocket';
import { timerService } from '../utils/timer-service';

@customElement('last-change-text-shp')
class LastChangeText extends LitElement {
  @property({ attribute: false }) public entity?: HassEntity;
  @property({ attribute: false }) public secondsForSuperHighlight?: number;

  @state() private _lastRenderedText: string = '';
  private _timerCallback?: () => void;

  static styles = css`
    /* Add component styles here */
        :host {
            font-size: 11px;
            white-space: nowrap;
            line-height: normal;
            isolation: isolate;
        }
        
        div {
            padding-left: 0px;
            padding-right: 0px;
            border-radius: 9px;
            font-size: 11px;
            text-align: center;
            line-height: normal;
            position: relative;
            isolation: isolate;
        }
  `;

  connectedCallback() {
    super.connectedCallback();
    // Bind and subscribe to shared timer service
    this._timerCallback = this._onTimerTick.bind(this);
    timerService.subscribe(this._timerCallback);
    this._timerCallback();
  }

  disconnectedCallback() {
    // Unsubscribe from shared timer service
    if (this._timerCallback) {
      timerService.unsubscribe(this._timerCallback);
    }
    super.disconnectedCallback();
  }

  /**
   * Called by shared timer service every second
   * Only triggers re-render if the displayed text would change
   */
  private _onTimerTick(): void {
    if (!this.entity) return;

    const lastChanged = this.entity.attributes["state_last_changed"] ?? this.entity.last_changed;
    const newText = Utils.formatDurationFromTo(lastChanged, undefined, 2);

    // Setting @state property automatically triggers re-render only if value changed
    this._lastRenderedText = newText;
  }

  render() {
    if (!this.entity)
      return html`<div>No entity defined</div>`

    const lastChanged = this.entity.attributes["state_last_changed"] ?? this.entity.last_changed;
    const lastChangeBefore = lastChanged && dayjs.duration(dayjs().diff(lastChanged));
    const secondsSinceChange = lastChangeBefore ? lastChangeBefore.asSeconds() : Infinity;

    let textColor = 'var(--shp-last-change-text-muted, rgba(192, 192, 192, 0.6))';
    let backgroundColor = 'var(--shp-last-change-bg-muted, rgba(0, 0, 0, 0.3))';
    let shadowColor = `var(--shp-last-change-shadow-muted, ${backgroundColor})`;

    // Superhighlight overrides all other highlighting
    if (this.secondsForSuperHighlight && secondsSinceChange <= this.secondsForSuperHighlight) {
      textColor = 'var(--shp-last-change-text-alert, var(--shp-last-change-text-strong, rgba(255, 255, 255, 1)))';
      backgroundColor = 'var(--shp-last-change-bg-alert, rgba(200, 60, 60, 0.4))';
      shadowColor = `var(--shp-last-change-shadow-alert, ${backgroundColor})`;
    }
    // White/gray for first 30 seconds
    else if (secondsSinceChange <= 30) {
      textColor = 'var(--shp-last-change-text-recent, var(--shp-last-change-text-strong, rgba(255, 255, 255, 1)))';
      backgroundColor = 'var(--shp-last-change-bg-recent, rgba(220, 220, 220, 0.3))';
      shadowColor = `var(--shp-last-change-shadow-recent, ${backgroundColor})`;
    }
    // Even less bright for next 90 seconds (31-120 seconds)
    else if (secondsSinceChange <= 120) {
      textColor = 'var(--shp-last-change-text-mid, rgba(192, 192, 192, 1))';
      backgroundColor = 'var(--shp-last-change-bg-mid, rgba(180, 180, 180, 0.25))';
      shadowColor = `var(--shp-last-change-shadow-mid, ${backgroundColor})`;
    }

    const shadowBlur = 'var(--shp-last-change-shadow-blur, 12px)';
    const shadowSpread = 'var(--shp-last-change-shadow-spread, 7px)';

    return html`
      <div style="color: ${textColor}; 
                  background-color: ${backgroundColor}; 
                  box-shadow: 0px 0px ${shadowBlur} ${shadowSpread} ${shadowColor}
                  ">
        ${this._lastRenderedText}
      </div>
    `;
  }
}
