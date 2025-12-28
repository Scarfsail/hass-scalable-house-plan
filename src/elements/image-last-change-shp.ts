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
    protected override renderEntityContent(entity: HassEntity) {

        if (!this.element) {
            this.element = document.createElement('hui-image-element') as any;
            this.element.setConfig(this._config)
        }

        this.element.hass = this.hass;

        const size = (this._config?.size || 50) + "px";
        const style = `width:${size};height:${size};border-radius:50%;overflow:hidden`

        return html`
            <div style=${style}>   
                ${this.element}
            </div>
            <last-change-text-shp .entity=${entity}></last-change-text-shp>            
        `
    }
}