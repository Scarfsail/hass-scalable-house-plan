import { html, nothing } from "lit"
import { customElement } from "lit/decorators.js";
import "../components/last-change-text-shp";
import { ElementEntityArmableBase, ElementEntityBaseConfig } from "./base";
import { HassEntity } from "home-assistant-js-websocket";

interface MotionSensorElementConfig extends ElementEntityBaseConfig {
    hide_icon?: boolean;  // Default: false - whether to hide the icon
}

@customElement("motion-sensor-shp")
export class MotionSensorElement extends ElementEntityArmableBase<MotionSensorElementConfig> {
    protected override renderEntityContent(entity: HassEntity) {

        //const opened = entity.state == "on";


        const alarmState = this.getAlarmoSensorState();
        const color = (entity?.attributes["device_class"] == "occupancy" && entity?.state == "on") ? "#ffc107" : (alarmState ? (alarmState.armed ? 'red' : 'green') : 'white')


        return html`
            ${this._config?.hide_icon ? nothing : html`<ha-icon style="color:${color}" icon="mdi:motion-sensor"></ha-icon>`}
            <last-change-text-shp .entity=${entity}></last-change-text-shp>
        `
    }
}