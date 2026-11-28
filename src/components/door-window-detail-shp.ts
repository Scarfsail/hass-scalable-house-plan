import { LitElement, css, html, nothing, PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { HassEntity } from "home-assistant-js-websocket";
import type { HomeAssistant } from "../../hass-frontend/src/types";
import { getLocalizeFunction, type LocalizeFunction } from "../localize";
import { Utils } from "../utils/utils";
import { timerService } from "../utils/timer-service";
import { AlarmoSensorAndArea, getAlarmoSensorAndArea, getAlarmoSensorState } from "../utils/alarmo";
import { CoverAction, getCoverActionColor, getCoverActions, performCoverAction } from "../utils/cover-actions";
import type { EntityHistoryState } from "../utils/entity-history";
import { DARK_CHIP, getControlColors, getPartialPosition, getSensorColor } from "../elements/door-window-shp";

const DAY_MS = 24 * 3600 * 1000;
const LOCK_FEATURE_OPEN = 1;

/** A state change from the history fetch: state and epoch ms */
interface StateChange {
    s: string;
    t: number;
}

/**
 * Popup for a door/window (custom:door-window-shp): sensor state, Alarmo state, the control's
 * state and buttons, a 24 h timeline of when it was open, and links to more-info.
 * Rendered by the main card above the overview and the room detail; fires `closed`.
 */
@customElement("door-window-detail-shp")
export class DoorWindowDetail extends LitElement {
    // Static styles
    static styles = css`
        :host {
            position: fixed;
            inset: 0;
            z-index: 10;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .backdrop {
            position: absolute;
            inset: 0;
            backdrop-filter: blur(8px) brightness(0.7);
            -webkit-backdrop-filter: blur(8px) brightness(0.7);
            background: rgba(0, 0, 0, 0.3);
            cursor: pointer;
        }

        .panel {
            position: relative;
            width: min(360px, calc(100vw - 32px));
            box-sizing: border-box;
            padding: 16px;
            border-radius: var(--ha-card-border-radius, 12px);
            background: var(--card-background-color, #1c1c1c);
            color: var(--primary-text-color);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
            display: flex;
            flex-direction: column;
            gap: 10px;
            font-size: 14px;
        }

        .header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-size: 18px;
            font-weight: 500;
        }

        .close {
            border: none;
            background: none;
            color: var(--secondary-text-color);
            font-size: 18px;
            cursor: pointer;
            padding: 0 4px;
        }

        .state {
            font-weight: 500;
        }

        .secondary {
            color: var(--secondary-text-color);
        }

        .buttons {
            display: flex;
            gap: 8px;
        }

        .buttons button {
            border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.2));
            border-radius: 999px;
            padding: 6px 14px;
            font: inherit;
            font-weight: 500;
            color: var(--primary-text-color);
            background: none;
            cursor: pointer;
        }

        .buttons button.filled {
            border-color: transparent;
            color: white;
        }

        .timeline {
            position: relative;
            height: 10px;
            border-radius: 3px;
            background: var(--secondary-background-color, rgba(255, 255, 255, 0.1));
            overflow: hidden;
        }

        .segment {
            position: absolute;
            top: 0;
            bottom: 0;
            min-width: 2px;
            background: #6464FF;
        }

        .timeline-axis {
            display: flex;
            justify-content: space-between;
            font-size: 11px;
            color: var(--secondary-text-color);
            margin-top: 2px;
        }

        .links {
            display: flex;
            flex-wrap: wrap;
            gap: 4px 16px;
        }

        .links button {
            border: none;
            background: none;
            padding: 0;
            font: inherit;
            font-size: 13px;
            color: var(--primary-color);
            cursor: pointer;
        }
    `;

    // Private properties
    private _localize?: LocalizeFunction;
    private _tick = () => this.requestUpdate();

    // Public properties
    @property({ attribute: false }) public hass!: HomeAssistant;
    @property({ attribute: false }) public entityId!: string;
    @property({ attribute: false }) public controlEntityId?: string;
    @property({ attribute: false }) public helmanEntityIds: ReadonlySet<string> = new Set();

    // State properties
    @state() private _history: StateChange[] = [];
    @state() private _alarmo?: AlarmoSensorAndArea;

    private get localize(): LocalizeFunction {
        if (!this._localize) {
            this._localize = getLocalizeFunction(this.hass);
        }
        return this._localize;
    }

    // Lifecycle methods
    connectedCallback() {
        super.connectedCallback();
        // Durations and the open segment grow with time even when no state changes
        timerService.subscribe(this._tick);
        window.addEventListener('keydown', this._handleKeyDown);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        timerService.unsubscribe(this._tick);
        window.removeEventListener('keydown', this._handleKeyDown);
    }

    willUpdate(changedProperties: PropertyValues) {
        if (changedProperties.has('entityId')) {
            this._history = [];
            this._alarmo = undefined;
            this._fetchHistory();
            getAlarmoSensorAndArea(this.hass, this.entityId).then((alarmo) => this._alarmo = alarmo);
        }
        if (changedProperties.has('hass')) {
            const sensor = this.hass.states[this.entityId];
            // Nothing to show: close instead of blocking the card with an empty fixed overlay
            if (!sensor) {
                this._close();
                return;
            }
            // Keep every live change, so a period that opens and closes while the popup is open is drawn
            const t = new Date(sensor.last_changed).getTime();
            if (t > (this._history[this._history.length - 1]?.t ?? -Infinity)) {
                this._history = [...this._history, { s: sensor.state, t }];
            }
        }
    }

    // Render method
    render() {
        const sensor = this.hass.states[this.entityId];
        if (!sensor) return nothing;
        const control = this.controlEntityId ? this.hass.states[this.controlEntityId] : undefined;

        return html`
            <div class="backdrop" @click=${this._close}></div>
            <div class="panel">
                <div class="header">
                    <span>${sensor.attributes.friendly_name ?? this.entityId}</span>
                    <button class="close" @click=${this._close}>✕</button>
                </div>
                ${this._renderSensorLine(sensor)}
                ${control ? this._renderControl(control) : nothing}
                ${this._renderTimeline()}
                ${this._renderLinks(control)}
            </div>
        `;
    }

    // Private helper methods
    private _renderSensorLine(sensor: HassEntity) {
        const alarmState = getAlarmoSensorState(this.hass, this._alarmo);
        const lastChanged = sensor.attributes["state_last_changed"] ?? sensor.last_changed;
        const duration = this.localize('door_window.for').replace('{duration}', () => Utils.formatDurationFromTo(lastChanged, undefined, 2));
        return html`
            <div>
                <span class="state" style="color: ${getSensorColor(sensor.state === 'on', alarmState)};">${this.hass.formatEntityState(sensor)}</span>
                <span class="secondary">${duration}${alarmState ? html` · ${this.localize(alarmState.armed ? 'door_window.alarmo_armed' : 'door_window.alarmo_disarmed')}` : nothing}</span>
            </div>
        `;
    }

    private _renderControl(control: HassEntity) {
        const colors = getControlColors(control.state);
        // A dark chip shows its state by the icon colour, a coloured chip by its background
        const accent = colors.background === DARK_CHIP ? colors.icon : colors.background;
        const position = getPartialPosition(control);
        const by = this._getChangedBy(control);

        return html`
            <div>
                <span class="state" style="color: ${accent}; opacity: ${colors.dimmed ? 0.4 : 1};">${this.hass.formatEntityState(control)}</span>
                <span class="secondary">
                    ${position !== undefined ? html`${position} % · ` : nothing}${this.localize('door_window.since').replace('{time}', () => this._formatTime(control.last_changed))}${by ? html` ${this.localize('door_window.by').replace('{name}', () => by)}` : nothing}
                </span>
            </div>
            ${this._renderButtons(control)}
        `;
    }

    private _renderButtons(control: HassEntity) {
        if (control.entity_id.startsWith('lock.')) {
            const locked = control.state === 'locked';
            const canOpen = (control.attributes.supported_features ?? 0) & LOCK_FEATURE_OPEN;
            return html`
                <div class="buttons">
                    <button class="filled" style="background: var(--primary-color);" @click=${() => this._callLock(locked ? 'unlock' : 'lock')}>
                        ${this.localize(locked ? 'door_window.unlock' : 'door_window.lock')}
                    </button>
                    ${canOpen ? html`<button @click=${() => this._callLock('open')}>${this.localize('door_window.open')}</button>` : nothing}
                </div>
            `;
        }

        const actions = getCoverActions(control);
        if (!actions) return nothing;
        return html`
            <div class="buttons">
                ${actions.map((action: CoverAction) => html`
                    <button class="filled" style="background: ${getCoverActionColor(action)};" @click=${() => performCoverAction(this.hass, action, control.entity_id)}>
                        ${this.localize(`gate.${action}`)}
                    </button>
                `)}
            </div>
        `;
    }

    private _renderTimeline() {
        const now = Date.now();
        const start = now - DAY_MS;
        return html`
            <div>
                <div class="secondary">${this.localize('door_window.opened_last_24h')}</div>
                <div class="timeline">
                    ${this._getOpenIntervals(now).filter(([, to]) => to > start).map(([from, to]) => {
                        const left = Math.max(from, start);
                        return html`<div class="segment" style="left: ${(left - start) / DAY_MS * 100}%; width: ${(to - left) / DAY_MS * 100}%;"></div>`;
                    })}
                </div>
                <div class="timeline-axis">
                    <span>${this.localize('door_window.day_ago')}</span>
                    <span>${this.localize('door_window.now')}</span>
                </div>
            </div>
        `;
    }

    private _renderLinks(control?: HassEntity) {
        const helmanEntityId = [this.controlEntityId, this.entityId].find((id) => id && this.helmanEntityIds.has(id));
        return html`
            <div class="links">
                <button @click=${() => this._openMoreInfo(this.entityId, true)}>${this.localize('door_window.sensor_details')} ›</button>
                ${control ? html`
                    <button @click=${() => this._openMoreInfo(control.entity_id, true)}>${this.localize(this._getControlDetailsKey(control))} ›</button>
                ` : nothing}
                ${helmanEntityId ? html`
                    <button @click=${() => this._openMoreInfo(helmanEntityId, false)}>⚡ ${this.localize('door_window.power_energy')} ›</button>
                ` : nothing}
            </div>
        `;
    }

    /** [from, to) epoch ms intervals when the sensor was on: the fetched history plus the live changes */
    private _getOpenIntervals(now: number): [number, number][] {
        const intervals: [number, number][] = [];
        let openFrom: number | undefined;
        for (const { s, t } of this._history) {
            if (s === 'on' && openFrom === undefined) {
                openFrom = t;
            } else if (s !== 'on' && openFrom !== undefined) {
                intervals.push([openFrom, t]);
                openFrom = undefined;
            }
        }
        if (openFrom !== undefined) {
            intervals.push([openFrom, now]);
        }
        return intervals;
    }

    private async _fetchHistory() {
        const entityId = this.entityId;
        const result = await this.hass.callWS<Record<string, EntityHistoryState[]>>({
            type: 'history/history_during_period',
            start_time: new Date(Date.now() - DAY_MS).toISOString(),
            entity_ids: [entityId],
            minimal_response: true,
            no_attributes: true,
            significant_changes_only: false,
        }).catch(() => undefined);
        // On failure the timeline keeps just the live changes
        if (!result || entityId !== this.entityId) return;
        const fetched = (result[entityId] ?? []).map((h) => ({ s: h.s, t: (h.lc ?? h.lu) * 1000 }));
        const fetchedUntil = fetched[fetched.length - 1]?.t ?? -Infinity;
        // Keep the live changes that arrived after the fetched period
        this._history = [...fetched, ...this._history.filter((c) => c.t > fetchedUntil)];
    }

    /** Who changed the control: a person by the context's user, "automation", or undefined */
    private _getChangedBy(control: HassEntity): string | undefined {
        // The context belongs to the last update; it tells who made the state change only if that was it
        if (control.last_updated !== control.last_changed) return undefined;
        if (control.context.parent_id) {
            return this.localize('door_window.automation');
        }
        const userId = control.context.user_id;
        if (!userId) return undefined;
        const person = Object.values(this.hass.states).find((s) => s.entity_id.startsWith('person.') && s.attributes.user_id === userId);
        return person?.attributes.friendly_name;
    }

    private _getControlDetailsKey(control: HassEntity): string {
        if (control.entity_id.startsWith('lock.')) return 'door_window.lock_details';
        const deviceClass = control.attributes.device_class;
        return deviceClass === 'gate' || deviceClass === 'garage' ? 'door_window.gate_details' : 'door_window.cover_details';
    }

    /** Time of day for today, date and time for older changes */
    private _formatTime(dateTime: string): string {
        const date = new Date(dateTime);
        const options: Intl.DateTimeFormatOptions = date.toDateString() === new Date().toDateString()
            ? { hour: '2-digit', minute: '2-digit' }
            : { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' };
        return date.toLocaleString(this.hass.locale?.language ?? this.hass.language, options);
    }

    private _callLock(service: 'lock' | 'unlock' | 'open') {
        this.hass.callService('lock', service, { entity_id: this.controlEntityId });
    }

    /** skipHelman: open HA's more-info even for a Helman entity (the card's hook lets it through) */
    private _openMoreInfo(entityId: string, skipHelman: boolean) {
        this.dispatchEvent(new CustomEvent('hass-more-info', {
            detail: skipHelman ? { entityId, shpSkipHelman: true } : { entityId },
            bubbles: true,
            composed: true,
        }));
        this._close();
    }

    private _handleKeyDown = (ev: KeyboardEvent) => {
        if (ev.key === 'Escape') this._close();
    };

    private _close() {
        this.dispatchEvent(new CustomEvent('closed'));
    }
}
