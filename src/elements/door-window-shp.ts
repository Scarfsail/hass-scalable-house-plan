import { html, nothing } from "lit"
import { customElement } from "lit/decorators.js";
import "../components/last-change-text-shp";

import { ElementEntityBaseConfig, ElementEntityArmableBase } from "./base/";
import type { HassEntity } from "home-assistant-js-websocket";

interface DoorWindowElementConfig extends ElementEntityBaseConfig {
    width: number;
    height: number;
    orientation: "vertical" | "horizontal";
    unobtrusive?: boolean;
}


@customElement("door-window-shp")
export class DoorWindowElement extends ElementEntityArmableBase<DoorWindowElementConfig> {
    async setConfig(config: DoorWindowElementConfig) {
        await super.setConfig({
            ...config,
            height: config.height ?? 7,
            orientation: config.orientation ?? "horizontal"
        });
    }
    protected renderEntityContent(entity: HassEntity) {
        if (!this._config || !this.hass)
            return nothing;

        const opened = entity.state == "on";
        const height = this._config.orientation == 'horizontal' ? this._config.height : this._config.width;
        const width = this._config.orientation == 'horizontal' ? this._config.width : this._config.height;

        const svgPathArea = "M" + 0 + " " + 0 + " L" + 0 + " " + height + " L" + width + " " + height + " L" + width + " " + 0 + " Z";


        const alarmState = this.getAlarmoSensorState();
        const color = opened ? 
            (this._config?.unobtrusive ?
                'white'
                :
                '#6464FF'
            ) 
            : 
            alarmState ? 
                (alarmState.armed ? 'red' : 'green') 
                : 
                'gray';

        return html`
            <div style="display:flex; align-items:center; gap:5px; flex-direction:${this._config.orientation == 'horizontal' ? 'column' : 'row'}">
               <div>
                    <svg width="${width}px" height="${height}px">
                        <path d=${svgPathArea} fill=${color} stroke=${color} strokeDasharray=0 strokeWidth=1 />
                    </svg>
                </div>
                <last-change-text-shp .entity=${entity} .secondsForSuperHighlight=${5}></last-change-text-shp>
            </div>            
            `
    }
}