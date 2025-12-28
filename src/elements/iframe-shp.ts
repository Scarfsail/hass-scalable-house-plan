import { html, nothing } from "lit"
import { customElement } from "lit/decorators.js";
import { ElementBase, ElementBaseConfig } from "./base";
import type { HassEntity } from "home-assistant-js-websocket";

interface IframeElementConfig extends ElementBaseConfig {
    height: number;
    width:number;
    src:string;
}

@customElement("iframe-shp")
export class IframeElement extends ElementBase<IframeElementConfig> {
    
    protected override renderContent() {
        if (!this._config || !this.hass)
            return nothing;

        return html`
            <iframe src=${this._config.src} style="width: ${this._config.width}px; height: ${this._config.height}px;border: none;">

            </iframe>
        `
    }
}