import { html, nothing } from "lit"
import { customElement } from "lit/decorators.js";
import { ElementEntityBase, ElementEntityBaseConfig } from "./base";
import type { HassEntity } from "home-assistant-js-websocket";

interface CameraElementConfig extends ElementEntityBaseConfig {
    height: number;
    width:number;
}

@customElement("camera-shp")
export class CameraElement extends ElementEntityBase<CameraElementConfig> {
    
    protected override renderEntityContent(entity: HassEntity) {
        if (!this._config || !this.hass)
            return nothing;

        const img_src = `/api/camera_proxy_stream/${entity.entity_id}?token=${entity.attributes.access_token}`;

        return html`
            <img src=${img_src} style="width: ${this._config.width}px; height: ${this._config.height}px; object-fit: fill;" >
        `
    }
}