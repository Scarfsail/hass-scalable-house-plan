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
  @property({ attribute: false, type: Boolean }) public vertical?: boolean;

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
        
        div.vertical {
            writing-mode: vertical-rl;
            transform: rotate(180deg);
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

    let textColor = 'rgba(192, 192, 192, 0.6)';
    let backgroundColor = 'rgba(0, 0, 0, 0.3)';

    // Superhighlight overrides all other highlighting
    if (this.secondsForSuperHighlight && secondsSinceChange <= this.secondsForSuperHighlight) {
      textColor = 'rgba(255, 255, 255, 1)';
      backgroundColor = 'rgba(200, 60, 60, 0.4)';
    }
    // White/gray for first 30 seconds
    else if (secondsSinceChange <= 30) {
      textColor = 'rgba(255, 255, 255, 1)';
      backgroundColor = 'rgba(220, 220, 220, 0.3)';
    }
    // Even less bright for next 90 seconds (31-120 seconds)
    else if (secondsSinceChange <= 120) {
      textColor = 'rgba(192, 192, 192, 1)';
      backgroundColor = 'rgba(180, 180, 180, 0.25)';
    }

    return html`
      <div class="${this.vertical ? 'vertical' : ''}" 
           style="color: ${textColor}; 
                  background-color: ${backgroundColor}; 
                  box-shadow: 0px 0px 12px 7px ${backgroundColor};
                  ">
        ${this._lastRenderedText}
      </div>
    `;
  }
}
