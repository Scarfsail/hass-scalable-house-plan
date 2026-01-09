import { LitElement, html, css } from 'lit-element';
import { customElement, property, state } from "lit/decorators.js";
import dayjs from 'dayjs';
import { Utils } from '../utils/utils';
import type { HassEntity } from 'home-assistant-js-websocket';

@customElement('last-change-text-shp')
class LastChangeText extends LitElement {

  @property({ attribute: false }) public entity?: HassEntity;
  @property({ attribute: false }) public secondsForSuperHighlight?: number;
  @property({ attribute: false, type: Boolean }) public vertical?: boolean;

  @state() private _currentTime = new Date(); // State to force re-renders
  private _timer?: number;

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
    // Set up interval to update _currentTime every second
    this._timer = window.setInterval(() => {
      this._currentTime = new Date();
    }, 1000);
  }

  disconnectedCallback() {
    // Clean up timer when component is removed
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = undefined;
    }
    super.disconnectedCallback();
  }

  render() {
    if (!this.entity)
      return html`<div>No entity defined</div>`

    const normalBackground = { red: 0, green: 0, blue: 0, alpha: 1 }
    const normalText = { red: 192, green: 192, blue: 192 }
    const highlightedText = { red: 0, green: 0, blue: 0 }
    const minutesForHighlight = 2;
    const secondsForSuperHighlight = this.secondsForSuperHighlight;

    const lastChanged = this.entity.attributes["state_last_changed"] ?? this.entity.last_changed;

    const lastChangeBefore = lastChanged && dayjs.duration(dayjs().diff(lastChanged));
    const doHighlight = lastChangeBefore && lastChangeBefore.asMinutes() <= minutesForHighlight;

    let textRgb = { ...normalText, alpha: 1 };
    let backgroundRgb = normalBackground;

    if (doHighlight) {
      const percent = 100 / (minutesForHighlight * 60) * (lastChangeBefore.asSeconds() == 0 ? 0.1 : lastChangeBefore.asSeconds());
      let highlightedBackground = { red: 255, green: 255, blue: 0, alpha: 0.7 }
      if (secondsForSuperHighlight && lastChangeBefore.asSeconds() <= secondsForSuperHighlight)
        highlightedBackground = { red: 255, green: 0, blue: 0, alpha: 1 };

      textRgb = percent < 42 ? { ...highlightedText, alpha: 1 } : { ...normalText, alpha: 1 };
      backgroundRgb = calculateRgbaColors(highlightedBackground, normalBackground, percent);
    }

    const textColor = `rgba(${textRgb.red},${textRgb.green},${textRgb.blue},${textRgb.alpha})`;
    const backgroundColor = `rgba(${backgroundRgb.red},${backgroundRgb.green},${backgroundRgb.blue},${backgroundRgb.alpha})`;

    return html`
      <div class="${this.vertical ? 'vertical' : ''}" 
           style="color: ${textColor}; 
                  background-color: ${backgroundColor}; 
                  box-shadow: 0px 0px 7px 3px ${backgroundColor};">
        ${Utils.formatDurationFromTo(lastChanged, undefined, 2)}
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