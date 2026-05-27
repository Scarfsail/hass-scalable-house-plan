import { LitElement, html, css, TemplateResult } from 'lit-element';
import { planTextShadow, planDropShadow } from '../utils/plan-styles';
import { customElement, property, state } from "lit/decorators.js";
import { styleMap } from 'lit/directives/style-map.js';
import type { HassEntity } from 'home-assistant-js-websocket';
import { shortenNumberAndAddPrefixUnits, ShortenNumberPrefixType, evalJsTemplate } from '../utils';
import type { GaugeConfig, ResolvedGaugeConfig } from '../utils/gauge-presets';
import { resolveGaugeConfig, getColorForValue, calculateBarWidth } from '../utils/gauge-presets';
import { getHourlyHistory, subscribeHourlyHistory, scheduleHourlyTick } from '../utils/entity-history';
import type { HomeAssistant } from '../../hass-frontend/src/types';

@customElement('analog-text-shp')
class AnalogText extends LitElement {

  @property({ attribute: false }) public hass?: HomeAssistant;

  @property({ attribute: false }) public entity?: HassEntity;

  @property({ attribute: false }) public shorten_and_use_prefix?: ShortenNumberPrefixType;

  @property({ attribute: false }) public decimals?: number;

  @property({ attribute: false }) public negate?: boolean;

  @property({ attribute: false }) public gauge?: boolean | GaugeConfig;

  @state() private _hourlyValues: (number | null)[] | null = null;

  private _unsubHistory?: () => void;
  private _unsubTick?: () => void;
  private _historyEntityId?: string;
  private _historyBars?: number;
  private _fetchToken = 0;

  static styles = css`
    /* Add component styles here */
        :host {
            white-space: nowrap;
            display: block;
            line-height: 1;
            color: var(--shp-plan-text-color, inherit);
        }
        span {
            line-height: 1;
            ${planTextShadow};
        }
        
        .gauge-container-bottom {
            display: flex;
            flex-direction: column;
            gap: var(--gauge-gap, 4px);
            width: 100%;
        }
        
        .gauge-container-bottom.has-width {
            width: var(--gauge-width);
        }
        
        .gauge-container-top {
            display: flex;
            flex-direction: column-reverse;
            gap: var(--gauge-gap, 4px);
            width: 100%;
        }
        
        .gauge-container-top.has-width {
            width: var(--gauge-width);
        }
        
        .gauge-container-left {
            display: flex;
            flex-direction: row;
            gap: var(--gauge-gap, 4px);
            align-items: center;
            width: 100%;
        }
        
        .gauge-container-right {
            display: flex;
            flex-direction: row-reverse;
            gap: var(--gauge-gap, 4px);
            align-items: center;
            width: 100%;
        }
        
        .gauge-container-background {
            position: relative;
            display: inline-block;
        }
        
        .gauge-container-background.has-width {
            display: block;
            width: var(--gauge-width);
        }
        
        .gauge-bar-background-layer {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            overflow: hidden;
            border-radius: 2px;
            z-index: 0;
        }
        
        .text-content {
            line-height: 1;
        }
        
        .text-content.align-start {
            text-align: start;
        }
        
        .text-content.align-center {
            text-align: center;
        }
        
        .text-content.align-end {
            text-align: end;
        }
        
        .text-overlay {
            position: relative;
            z-index: 1;
            ${planTextShadow};
            line-height: 1;
        }
        
        .text-overlay.align-start {
            text-align: start;
        }
        
        .text-overlay.align-center {
            text-align: center;
        }
        
        .text-overlay.align-end {
            text-align: end;
        }
        
        .gauge-bar-container {
            position: relative;
            width: 100%;
            overflow: hidden;
            border-radius: 2px;
            ${planDropShadow};
        }
        
        .gauge-bar-background {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background-color: var(--shp-gauge-track, rgba(0, 0, 0, 0.2));
            box-shadow: inset 0 0 16px var(--shp-gauge-track-inset, rgba(255, 255, 255, 0.25));
        }
        
        .gauge-bar-fill {
            position: absolute;
            left: 0;
            top: 0;
            height: 100%;
            transition: width 0.3s ease, background-color 0.3s ease;
        }

        .gauge-bars-container {
            display: flex;
            flex-direction: row;
            align-items: flex-end;
            width: 100%;
            ${planDropShadow};
        }

        .gauge-bars-container .bar {
            flex: 1 1 0;
            min-width: 0;
            background-color: var(--shp-gauge-track, rgba(0, 0, 0, 0.2));
            border-radius: 1px;
            transition: background-color 0.3s ease, height 0.3s ease;
        }
  `;

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._teardownHistory();
  }

  updated(changed: Map<string, unknown>): void {
    super.updated(changed);
    if (changed.has('entity') || changed.has('gauge') || changed.has('hass')) {
      this._maybeSetupHistory();
    }
  }

  private _teardownHistory() {
    this._unsubHistory?.();
    this._unsubHistory = undefined;
    this._unsubTick?.();
    this._unsubTick = undefined;
    this._historyEntityId = undefined;
    this._historyBars = undefined;
    this._hourlyValues = null;
    this._fetchToken++;
  }

  private _maybeSetupHistory() {
    if (!this.entity || !this.hass) return;
    const gaugeConfig = this.resolveGaugeSettings();
    const needsHistory = gaugeConfig?.style === 'bars';
    const entityId = this.entity.entity_id;
    const bars = gaugeConfig?.bars ?? 24;

    if (!needsHistory) {
      if (this._unsubHistory) this._teardownHistory();
      return;
    }

    if (this._historyEntityId === entityId && this._historyBars === bars) return;

    this._teardownHistory();
    this._historyEntityId = entityId;
    this._historyBars = bars;
    const token = ++this._fetchToken;

    this._unsubHistory = subscribeHourlyHistory(entityId, bars, () => {
      if (token !== this._fetchToken) return;
      const { values } = getHourlyHistory(this.hass!, entityId, bars);
      this._hourlyValues = values ? [...values] : null;
    });
    this._unsubTick = scheduleHourlyTick(() => {
      // Force a fresh fetch by reading current hour (cache invalidates on hour boundary)
      getHourlyHistory(this.hass!, entityId, bars);
    });

    const { values } = getHourlyHistory(this.hass, entityId, bars);
    if (values) this._hourlyValues = [...values];
    // Subscriber callback above handles the fetch resolution.
  }

  render() {
    if (!this.entity)
      return html`<div>No entity defined</div>`

    let value = parseFloat(this.entity.state);
    if (this.negate) {
      value = -value;
    }
    const gaugeConfig = this.resolveGaugeSettings();

    // No gauge configured - render text only (existing behavior)
    if (!gaugeConfig) {
      return this.renderText(value);
    }

    // Render with gauge
    const textHtml = this.renderText(value);

    if (gaugeConfig.position === 'background') {
      return this.renderBackgroundGauge(textHtml, gaugeConfig);
    }

    // For left/right positions, width controls the gauge bar width
    // For other positions, width controls the container width
    const barWidth = (gaugeConfig.position === 'left' || gaugeConfig.position === 'right') 
      ? gaugeConfig.width 
      : undefined;
    const barHtml = this.renderGaugeBar(value, gaugeConfig, barWidth);

    switch (gaugeConfig.position) {
      case 'top':
        return this.renderTopGauge(textHtml, barHtml, gaugeConfig);
      case 'left':
        return this.renderLeftGauge(textHtml, barHtml, gaugeConfig);
      case 'right':
        return this.renderRightGauge(textHtml, barHtml, gaugeConfig);
      case 'bottom':
      default:
        return this.renderBottomGauge(textHtml, barHtml, gaugeConfig);
    }
  }

  private renderText(value: number): TemplateResult {
    const units = this.entity!.attributes.unit_of_measurement as string;
    const decimals = this.decimals ?? 1;
    const valueAndUnits = this.shorten_and_use_prefix 
      ? shortenNumberAndAddPrefixUnits(value, units, this.shorten_and_use_prefix) 
      : { value: value, units: units };

    return html`
      <span>${valueAndUnits.value.toFixed(decimals)}<span style="font-size:50%">${valueAndUnits.units}</span></span>
    `;
  }

  private resolveGaugeSettings(): ResolvedGaugeConfig | null {
    if (!this.gauge || !this.entity) {
      return null;
    }
    return resolveGaugeConfig(this.gauge, this.entity);
  }

  private renderGaugeBar(value: number, config: ResolvedGaugeConfig, barWidth?: string | number): TemplateResult {
    if (config.style === 'bars') {
      return this.renderHistoryBars(value, config, barWidth);
    }
    const widthPercent = calculateBarWidth(value, config.min, config.max);
    const color = this.getGaugeColor(value, config);

    const containerStyles: any = { height: `${config.height}px` };
    if (barWidth !== undefined) {
      containerStyles.width = typeof barWidth === 'number' ? `${barWidth}px` : barWidth;
    }

    return html`
      <div class="gauge-bar-container" style=${styleMap(containerStyles)}>
        <div class="gauge-bar-background"></div>
        <div class="gauge-bar-fill" style=${styleMap({
          width: `${widthPercent}%`,
          backgroundColor: color
        })}></div>
      </div>
    `;
  }

  private renderHistoryBars(currentValue: number, config: ResolvedGaugeConfig, barWidth?: string | number): TemplateResult {
    const total = config.bars;
    const historical = this._hourlyValues ?? new Array(total - 1).fill(null);
    const values: (number | null)[] = [...historical.slice(0, total - 1), currentValue];
    while (values.length < total) values.unshift(null);

    const containerStyles: any = {
      height: `${config.height}px`,
      gap: `${config.bar_gap}px`,
    };
    if (barWidth !== undefined) {
      containerStyles.width = typeof barWidth === 'number' ? `${barWidth}px` : barWidth;
    }

    const lastIdx = values.length - 1;
    const bars = values.map((v, i) => {
      if (v === null || typeof v !== 'number' || isNaN(v)) {
        return html`<div class="bar" style=${styleMap({ height: '100%', opacity: '0.25' })}></div>`;
      }
      // Only the current-hour bar can use the scriptable color template (which
      // evaluates against the live entity state). Historical bars must use the
      // threshold mapping so each bar reflects its own value.
      const color = i === lastIdx
        ? this.getGaugeColor(v, config)
        : getColorForValue(v, config.thresholds);
      if (config.encoding === 'height-color') {
        const pct = calculateBarWidth(v, config.min, config.max);
        return html`<div class="bar" style=${styleMap({
          height: `${Math.max(8, pct)}%`,
          backgroundColor: color,
        })}></div>`;
      }
      return html`<div class="bar" style=${styleMap({
        height: '100%',
        backgroundColor: color,
      })}></div>`;
    });

    return html`
      <div class="gauge-bars-container" style=${styleMap(containerStyles)}>
        ${bars}
      </div>
    `;
  }

  private renderBottomGauge(textHtml: TemplateResult, barHtml: TemplateResult, gaugeConfig: ResolvedGaugeConfig): TemplateResult {
    const hasWidth = gaugeConfig.width !== undefined;
    const textAlignClass = hasWidth ? `align-${gaugeConfig.text_position}` : '';
    const containerClass = hasWidth ? 'gauge-container-bottom has-width' : 'gauge-container-bottom';
    const widthValue = hasWidth ? (typeof gaugeConfig.width === 'number' ? `${gaugeConfig.width}px` : gaugeConfig.width) : undefined;
    const containerStyle = hasWidth 
      ? styleMap({ '--gauge-width': widthValue, '--gauge-gap': `${gaugeConfig.gap}px` } as any) 
      : styleMap({ '--gauge-gap': `${gaugeConfig.gap}px` } as any);

    return html`
      <div class="${containerClass}" style=${containerStyle}>
        <div class="text-content ${textAlignClass}">${textHtml}</div>
        ${barHtml}
      </div>
    `;
  }

  private renderTopGauge(textHtml: TemplateResult, barHtml: TemplateResult, gaugeConfig: ResolvedGaugeConfig): TemplateResult {
    const hasWidth = gaugeConfig.width !== undefined;
    const textAlignClass = hasWidth ? `align-${gaugeConfig.text_position}` : '';
    const containerClass = hasWidth ? 'gauge-container-top has-width' : 'gauge-container-top';
    const widthValue = hasWidth ? (typeof gaugeConfig.width === 'number' ? `${gaugeConfig.width}px` : gaugeConfig.width) : undefined;
    const containerStyle = hasWidth 
      ? styleMap({ '--gauge-width': widthValue, '--gauge-gap': `${gaugeConfig.gap}px` } as any) 
      : styleMap({ '--gauge-gap': `${gaugeConfig.gap}px` } as any);

    return html`
      <div class="${containerClass}" style=${containerStyle}>
        <div class="text-content ${textAlignClass}">${textHtml}</div>
        ${barHtml}
      </div>
    `;
  }

  private renderLeftGauge(textHtml: TemplateResult, barHtml: TemplateResult, gaugeConfig: ResolvedGaugeConfig): TemplateResult {
    const containerStyle = styleMap({ '--gauge-gap': `${gaugeConfig.gap}px` } as any);

    return html`
      <div class="gauge-container-left" style=${containerStyle}>
        ${barHtml}
        <div class="text-content">${textHtml}</div>
      </div>
    `;
  }

  private renderRightGauge(textHtml: TemplateResult, barHtml: TemplateResult, gaugeConfig: ResolvedGaugeConfig): TemplateResult {
    const containerStyle = styleMap({ '--gauge-gap': `${gaugeConfig.gap}px` } as any);

    return html`
      <div class="gauge-container-right" style=${containerStyle}>
        ${barHtml}
        <div class="text-content">${textHtml}</div>
      </div>
    `;
  }

  private renderBackgroundGauge(textHtml: TemplateResult, gaugeConfig: ResolvedGaugeConfig): TemplateResult {
    const value = parseFloat(this.entity!.state);
    const widthPercent = calculateBarWidth(value, gaugeConfig.min, gaugeConfig.max);
    const color = this.getGaugeColor(value, gaugeConfig);

    const hasWidth = gaugeConfig.width !== undefined;
    const textAlignClass = hasWidth ? `align-${gaugeConfig.text_position}` : '';
    const containerClass = hasWidth ? 'gauge-container-background has-width' : 'gauge-container-background';
    const widthValue = hasWidth ? (typeof gaugeConfig.width === 'number' ? `${gaugeConfig.width}px` : gaugeConfig.width) : undefined;
    const containerStyle = hasWidth ? styleMap({ '--gauge-width': widthValue } as any) : styleMap({});

    return html`
      <div class="${containerClass}" style=${containerStyle}>
        <div class="gauge-bar-background-layer">
          <div class="gauge-bar-background"></div>
          <div class="gauge-bar-fill" style=${styleMap({
            width: `${widthPercent}%`,
            backgroundColor: color
          })}></div>
        </div>
        <div class="text-overlay ${textAlignClass}">${textHtml}</div>
      </div>
    `;
  }
  /**
   * Get the gauge color, checking for scriptable color first, then falling back to thresholds
   */
  private getGaugeColor(value: number, config: ResolvedGaugeConfig): string {
    // If a custom color is defined, use it (supports JS templates)
    if (config.color && this.hass && this.entity) {
      const evaluatedColor = evalJsTemplate(this, this.hass, this.entity, config.color);
      if (evaluatedColor) {
        return evaluatedColor;
      }
    }

    // Fall back to threshold-based color
    return getColorForValue(value, config.thresholds);
  }
}
