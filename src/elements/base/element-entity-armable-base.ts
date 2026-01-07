import { state } from "lit/decorators.js";
import { AlarmoSensorAndArea, getAlarmoSensorAndArea, getAlarmoSensorState } from "../../utils/alarmo";
import { ElementEntityBase, ElementEntityBaseConfig } from "./element-entity-base";



export abstract class ElementEntityArmableBase<TConfig extends ElementEntityBaseConfig = ElementEntityBaseConfig> extends ElementEntityBase<TConfig> {
    @state() private _alarmoArea?: AlarmoSensorAndArea;

    protected updated(changedProperties: Map<string | number | symbol, unknown>) {
        if (changedProperties.has('hass') && !changedProperties.get('hass')) {
            // hass has been assigned for the first time
            if (this._config && this.hass) {
                getAlarmoSensorAndArea(this.hass, this._config.entity).then((alarmoArea) => this._alarmoArea = alarmoArea);
            }
        }
    }

    protected getAlarmoSensorState() {
        return getAlarmoSensorState(this.hass, this._alarmoArea);
    }


}