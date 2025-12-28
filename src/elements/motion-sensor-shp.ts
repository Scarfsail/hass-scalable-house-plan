import { html } from "lit"
import { customElement } from "lit/decorators.js";
import "../components/last-change-text-shp";
import { ElementEntityArmableBase } from "./base";
import { HassEntity } from "home-assistant-js-websocket";


@customElement("motion-sensor-shp")
export class MotionSensorElement extends ElementEntityArmableBase {
    protected override renderEntityContent(entity: HassEntity) {

        //const opened = entity.state == "on";


        const alarmState = this.getAlarmoSensorState();
        const color = (entity?.attributes["device_class"] == "occupancy" && entity?.state == "on") ? "#ffc107" : (alarmState ? (alarmState.armed ? 'red' : 'green') : 'white')


        return html`
            <ha-icon style="color:${color}" icon="mdi:motion-sensor"></ha-icon>
            <last-change-text-shp .entity=${entity}></last-change-text-shp>
        `
    }
}