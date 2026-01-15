import { LitElement, html, css } from 'lit-element';
import { customElement, property, state } from "lit/decorators.js";
import dayjs from 'dayjs';
import { Utils } from '../utils/utils';
import type { HassEntity } from 'home-assistant-js-websocket';
import { timerService } from '../utils/timer-service';

@customElement('last-change-text-shp')
class LastChangeText extends LitElement {
  // Static color constants - avoid recreating objects on every render
  private static readonly NORMAL_BACKGROUND = { red: 0, green: 0, blue: 0, alpha: 1 };
  private static readonly NORMAL_TEXT = { red: 192, green: 192, blue: 192 };
  private static readonly HIGHLIGHTED_TEXT = { red: 0, green: 0, blue: 0 };
  private static readonly MINUTES_FOR_HIGHLIGHT = 2;

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
        }
        
        div {
            padding-left: 2px;
            padding-right: 2px;
            border-radius: 6px;
            font-size: 11px;
            text-align: center;
            opacity: 0.6;
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

    const secondsForSuperHighlight = this.secondsForSuperHighlight;

    const lastChanged = this.entity.attributes["state_last_changed"] ?? this.entity.last_changed;

    const lastChangeBefore = lastChanged && dayjs.duration(dayjs().diff(lastChanged));
    const doHighlight = lastChangeBefore && lastChangeBefore.asMinutes() <= LastChangeText.MINUTES_FOR_HIGHLIGHT;

    let textRgb = { ...LastChangeText.NORMAL_TEXT, alpha: 1 };
    let backgroundRgb = LastChangeText.NORMAL_BACKGROUND;

    if (doHighlight) {
      const percent = 100 / (LastChangeText.MINUTES_FOR_HIGHLIGHT * 60) * (lastChangeBefore.asSeconds() == 0 ? 0.1 : lastChangeBefore.asSeconds());
      const highlightedBackground = secondsForSuperHighlight && lastChangeBefore.asSeconds() <= secondsForSuperHighlight
        ? { red: 255, green: 0, blue: 0, alpha: 1 }
        : { red: 255, green: 255, blue: 0, alpha: 0.7 };

      textRgb = percent < 42 ? { ...LastChangeText.HIGHLIGHTED_TEXT, alpha: 1 } : { ...LastChangeText.NORMAL_TEXT, alpha: 1 };
      backgroundRgb = calculateRgbaColors(highlightedBackground, LastChangeText.NORMAL_BACKGROUND, percent);
    }

    const textColor = `rgba(${textRgb.red},${textRgb.green},${textRgb.blue},${textRgb.alpha})`;
    const backgroundColor = `rgba(${backgroundRgb.red},${backgroundRgb.green},${backgroundRgb.blue},${backgroundRgb.alpha})`;

    return html`
      <div class="${this.vertical ? 'vertical' : ''}" 
           style="color: ${textColor}; 
                  background-color: ${backgroundColor}; 
                  box-shadow: 0px 0px 7px 3px ${backgroundColor};">
        ${this._lastRenderedText}
      </div>
    `;
  }
}

interface RgbModel {
  red: number;
  green: number;
  blue: number;
}
export interface RgbaModel extends RgbModel {
  alpha: number
}


function calculateRgbaColors(fromColor: RgbaModel, toColor: RgbaModel, percent: number): RgbaModel {
  return {
    ...calculateRgbColors(fromColor, toColor, percent),
    alpha: calculateOneColor(fromColor.alpha, toColor.alpha, percent)
  }
}

function calculateRgbColors(fromColor: RgbModel, toColor: RgbModel, percent: number): RgbModel {
  return {
    red: calculateOneColor(fromColor.red, toColor.red, percent),
    green: calculateOneColor(fromColor.green, toColor.green, percent),
    blue: calculateOneColor(fromColor.blue, toColor.blue, percent),
  }
}

function calculateOneColor(fromColor: number, toColor: number, percent: number) {
  const colorDiff = toColor - fromColor;
  const colorStep = colorDiff / 100;
  const colorIncrement = colorStep * percent;
  return fromColor + colorIncrement;
}