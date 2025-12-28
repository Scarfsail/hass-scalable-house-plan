import { LitElement, html, css } from 'lit-element';
import { customElement, property } from "lit/decorators.js";
import type { HassEntity } from 'home-assistant-js-websocket';
import { shortenNumberAndAddPrefixUnits, ShortenNumberPrefixType } from '../utils';

@customElement('analog-text-shp')
class AnalogText extends LitElement {

  @property({ attribute: false }) public entity?: HassEntity;

  @property({ attribute: false }) public shorten_and_use_prefix?: ShortenNumberPrefixType;

  @property({ attribute: false }) public decimals?: number;

  static styles = css`
    /* Add component styles here */
        :host {
            white-space: nowrap;
        }
  `;

  render() {
    if (!this.entity)
      return html`<div>No entity defined</div>`

    const value = parseFloat(this.entity.state);
    const units = this.entity.attributes.unit_of_measurement as string;
    const decimals = this.decimals ?? 1;
    const valueAndUnits = this.shorten_and_use_prefix ? shortenNumberAndAddPrefixUnits(value, units, this.shorten_and_use_prefix) : { value: value, units: units };

    return html`
        <span>${valueAndUnits.value.toFixed(decimals)}<span style="font-size:50%">${valueAndUnits.units}</span></span>
    `
  }
}
