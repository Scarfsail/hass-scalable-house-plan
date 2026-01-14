import { html } from "lit"
import { customElement } from "lit/decorators.js";
import { ElementEntityBase, ElementEntityBaseConfig } from "./base";
import { HassEntity } from "home-assistant-js-websocket";

interface ImageLastChangeElementConfig extends ElementEntityBaseConfig {
    size?: number;
}

@customElement("image-last-change-shp")
export class ImageLastChangeElement extends ElementEntityBase<ImageLastChangeElementConfig> {
    private element: any;
    private _sizeStyle: string = '';
    
    async setConfig(config: ImageLastChangeElementConfig) {
        await super.setConfig(config);
        // Pre-compute size style
        const size = (config.size || 50) + "px";
        this._sizeStyle = `width:${size};height:${size};border-radius:50%;overflow:hidden`;
    }
    
    protected override renderEntityContent(entity: HassEntity) {

        if (!this.element) {
            this.element = document.createElement('hui-image-element') as any;
            this.element.setConfig(this._config)
        }

        this.element.hass = this.hass;

        return html`
            <div style=${this._sizeStyle}>   
                ${this.element}
            </div>
            <last-change-text-shp .entity=${entity}></last-change-text-shp>            
        `
    }
}