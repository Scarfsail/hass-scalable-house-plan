import { LitElement, html, css } from "lit-element";
import { customElement, property, state, query } from "lit/decorators.js";
import type { HomeAssistant } from "../../hass-frontend/src/types";
import type { LovelaceCardEditor } from "../../hass-frontend/src/panels/lovelace/types";
import type { Room } from "./types";
import type { ScalableHousePlanConfig } from "./scalable-house-plan";
import { sharedStyles } from "./editor-components/shared-styles";
import { loadHaEntityPicker } from "../utils/load-ha-elements";
import { getLocalizeFunction, type LocalizeFunction } from "../localize";
import "./editor-components/editor-rooms-shp";

@customElement("scalable-house-plan-editor")
export class ScalableHousePlanEditor extends LitElement implements LovelaceCardEditor {
    @property({ attribute: false }) public hass!: HomeAssistant;
    @state() private _config!: ScalableHousePlanConfig;
    @state() private _expandedSections: Set<string> = new Set(['rooms']);
    @state() private _previewRoomIndex: number | null = null;
    @state() private _editorMode = false;
    @state() private _selectedElementKey: string | null = null;
    @query('editor-rooms-shp') private _roomsEditor?: any;
    private _localize?: LocalizeFunction;

    // Lazy-load localize function and cache it
    private get localize(): LocalizeFunction {
        if (!this._localize) {
            this._localize = getLocalizeFunction(this.hass);
        }
        return this._localize;
    }

    async connectedCallback() {
        super.connectedCallback();
        // Load ha-entity-picker once for all element editors
        await loadHaEntityPicker();
        // Listen for element selection events from card preview (via window)
        // HA editor and preview are in separate DOM contexts, so use window events
        window.addEventListener('scalable-house-plan-element-selected', this._handleElementSelection as EventListener);
        // Phase 3: Listen for element focus events from editor panel
        window.addEventListener('scalable-house-plan-element-focused', this._handleElementFocus as EventListener);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        // Clean up event listener
        window.removeEventListener('scalable-house-plan-element-selected', this._handleElementSelection as EventListener);
        // Phase 3: Clean up element focus listener
        window.removeEventListener('scalable-house-plan-element-focused', this._handleElementFocus as EventListener);
    }

    static styles = [
        sharedStyles,
        css`
            .basic-config {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 16px;
            }

            .basic-config ha-textfield {
                width: 100%;
            }
        `
    ];

    public setConfig(config: ScalableHousePlanConfig): void {
        this._config = { 
            ...config,
            rooms: config.rooms || []
        };
    }

    protected render() {
        if (!this._config) {
            return html`<div>${this.localize('editor.loading')}</div>`;
        }

        return html`
            <div class="card-config">
                <!-- Editor Mode Toggle Header -->
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 0; margin-bottom: 8px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <ha-icon icon="mdi:home-floor-plan" style="--mdc-icon-size: 20px; color: var(--primary-color);"></ha-icon>
                        <span style="font-size: 18px; font-weight: 600; color: var(--primary-text-color);">
                            ${this.localize('editor.house_plan_editor')}
                        </span>
                    </div>
                    <button
                        class="icon-button ${this._editorMode ? 'toggled' : ''}"
                        @click=${this._toggleEditorMode}
                        title="${this._editorMode ? 'Switch to Preview Mode' : 'Switch to Editor Mode'}"
                        style="display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 16px; ${this._editorMode ? 'background: var(--primary-color); color: white;' : ''}"
                    >
                        <ha-icon icon="mdi:${this._editorMode ? 'pencil' : 'eye'}"></ha-icon>
                        <span style="font-size: 14px; font-weight: 500;">${this._editorMode ? 'Editor' : 'Preview'}</span>
                    </button>
                </div>

                <!-- Basic Configuration Section -->
                <div class="config-section collapsible-section">
                    <div class="section-header ${this._expandedSections.has('basic') ? 'expanded' : ''}" @click=${() => this._toggleSection('basic')}>
                        <div class="section-title">
                            <ha-icon 
                                icon="mdi:chevron-right" 
                                class="expand-icon ${this._expandedSections.has('basic') ? 'expanded' : ''}"
                            ></ha-icon>
                            <ha-icon icon="mdi:cog"></ha-icon>
                            ${this.localize('editor.basic_configuration')}
                        </div>
                    </div>
                    <div class="section-content ${this._expandedSections.has('basic') ? 'expanded' : ''}">
                        <div class="basic-config">
                        <ha-textfield
                            label="${this.localize('editor.image_url')}"
                            .value=${this._config.image || ""}
                            @input=${this._imageChanged}
                            placeholder="${this.localize('editor.image_url_placeholder')}"
                        ></ha-textfield>
                        <ha-textfield
                            label="${this.localize('editor.image_width')}"
                            type="number"
                            .value=${this._config.image_width || 1360}
                            @input=${this._imageWidthChanged}
                        ></ha-textfield>
                        <ha-textfield
                            label="${this.localize('editor.image_height')}"
                            type="number"
                            .value=${this._config.image_height || 849}
                            @input=${this._imageHeightChanged}
                        ></ha-textfield>
                        <ha-textfield
                            label="${this.localize('editor.min_scale')}"
                            type="number"
                            step="0.1"
                            .value=${this._config.min_scale || 0.5}
                            @input=${this._minScaleChanged}
                        ></ha-textfield>
                        <ha-textfield
                            label="${this.localize('editor.max_scale')}"
                            type="number"
                            step="0.1"
                            .value=${this._config.max_scale || 3}
                            @input=${this._maxScaleChanged}
                        ></ha-textfield>
                        <ha-textfield
                            label="${this.localize('editor.element_detail_scale_ratio')}"
                            type="number"
                            step="0.05"
                            min="0"
                            max="1"
                            .value=${this._config.element_detail_scale_ratio ?? 0.1}
                            @input=${this._elementDetailScaleRatioChanged}
                            helper-text="${this.localize('editor.element_detail_scale_ratio_helper')}"
                        ></ha-textfield>
                        <ha-formfield label="${this.localize('editor.show_room_backgrounds')}">
                            <ha-switch
                                .checked=${this._config.show_room_backgrounds || false}
                                @change=${this._showRoomBackgroundsChanged}
                            ></ha-switch>
                        </ha-formfield>
                        </div>
                    </div>
                </div>

                <!-- Dynamic Room Colors Section -->
                <div class="config-section collapsible-section">
                    <div class="section-header ${this._expandedSections.has('dynamicColors') ? 'expanded' : ''}" @click=${() => this._toggleSection('dynamicColors')}>
                        <div class="section-title">
                            <ha-icon 
                                icon="mdi:chevron-right" 
                                class="expand-icon ${this._expandedSections.has('dynamicColors') ? 'expanded' : ''}"
                            ></ha-icon>
                            <ha-icon icon="mdi:palette"></ha-icon>
                            ${this.localize('editor.dynamic_room_colors')}
                        </div>
                    </div>
                    <div class="section-content ${this._expandedSections.has('dynamicColors') ? 'expanded' : ''}">
                        <div class="basic-config">
                            <ha-textfield
                                label="${this.localize('editor.ambient_lights_color')}"
                                .value=${this._config.dynamic_colors?.ambient_lights || 'rgba(220, 180, 255, 0.12)'}
                                @input=${this._ambientLightsColorChanged}
                                placeholder="rgba(220, 180, 255, 0.12)"
                            ></ha-textfield>
                            <ha-textfield
                                label="${this.localize('editor.lights_color')}"
                                .value=${this._config.dynamic_colors?.lights || 'rgba(255, 250, 250, 0.18)'}
                                @input=${this._lightsColorChanged}
                                placeholder="rgba(255, 250, 220, 0.18)"
                            ></ha-textfield>
                            <ha-textfield
                                label="${this.localize('editor.motion_occupancy_color')}"
                                .value=${this._config.dynamic_colors?.motion_occupancy || 'rgba(135, 206, 250, 0.15)'}
                                @input=${this._motionOccupancyColorChanged}
                                placeholder="rgba(135, 206, 250, 0.15)"
                            ></ha-textfield>
                            <ha-textfield
                                label="${this.localize('editor.default_color')}"
                                .value=${this._config.dynamic_colors?.default || 'rgba(128, 128, 128, 0.05)'}
                                @input=${this._defaultColorChanged}
                                placeholder="rgba(128, 128, 128, 0.05)"
                            ></ha-textfield>
                            <ha-textfield
                                label="${this.localize('editor.motion_delay_seconds')}"
                                type="number"
                                min="0"
                                step="1"
                                .value=${this._config.dynamic_colors?.motion_delay_seconds ?? 60}
                                @input=${this._motionDelaySecondsChanged}
                            ></ha-textfield>
                        </div>
                    </div>
                </div>

                <!-- Info Box Defaults Section -->
                <div class="config-section collapsible-section">
                    <div class="section-header ${this._expandedSections.has('infoBoxDefaults') ? 'expanded' : ''}" @click=${() => this._toggleSection('infoBoxDefaults')}>
                        <div class="section-title">
                            <ha-icon 
                                icon="mdi:chevron-right" 
                                class="expand-icon ${this._expandedSections.has('infoBoxDefaults') ? 'expanded' : ''}"
                            ></ha-icon>
                            <ha-icon icon="mdi:information-box"></ha-icon>
                            ${this.localize('editor.info_box_defaults')}
                        </div>
                    </div>
                    <div class="section-content ${this._expandedSections.has('infoBoxDefaults') ? 'expanded' : ''}">
                        <ha-yaml-editor
                            .hass=${this.hass}
                            .defaultValue=${this._config.info_box_defaults || {}}
                            @value-changed=${this._infoBoxDefaultsChanged}
                        ></ha-yaml-editor>
                    </div>
                </div>

                <!-- Rooms Section -->
                <div class="config-section collapsible-section">
                    <div class="section-header ${this._expandedSections.has('rooms') ? 'expanded' : ''}" @click=${() => this._toggleSection('rooms')}>
                        <div class="section-title">
                            <ha-icon 
                                icon="mdi:chevron-right" 
                                class="expand-icon ${this._expandedSections.has('rooms') ? 'expanded' : ''}"
                            ></ha-icon>
                            <ha-icon icon="mdi:floor-plan"></ha-icon>
                            ${this.localize('editor.rooms_count').replace('{count}', (this._config.rooms?.length || 0).toString())}
                        </div>
                        <button
                            class="add-button"
                            @click=${(e: Event) => { e.stopPropagation(); this._addRoom(); }}
                        >
                            <ha-icon icon="mdi:plus"></ha-icon>
                            ${this.localize('editor.add_room')}
                        </button>
                    </div>
                    <div class="section-content ${this._expandedSections.has('rooms') ? 'expanded' : ''}">
                                <editor-rooms-shp
                            .hass=${this.hass}
                            .rooms=${this._config.rooms || []}
                            .selectedElementKey=${this._selectedElementKey}
                            @room-add=${this._addRoom}
                            @room-update=${this._updateRoom}
                            @room-remove=${this._removeRoom}
                            @rooms-reorder=${this._reorderRooms}
                            @room-preview-detail=${this._handlePreviewDetail}
                        ></editor-rooms-shp>
                    </div>
                </div>
            </div>
        `;
    }

    // Section toggle handler
    private _toggleSection(section: string): void {
        if (this._expandedSections.has(section)) {
            this._expandedSections.delete(section);
        } else {
            this._expandedSections.add(section);
        }
        this.requestUpdate();
    }

    // Editor mode toggle handler
    private _toggleEditorMode(): void {
        this._editorMode = !this._editorMode;

        // Clear selection when switching to Normal mode
        if (!this._editorMode) {
            this._selectedElementKey = null;
        }

        // Update preview with new mode state
        this._configChanged();
    }

    // Handle element selection from preview
    private _handleElementSelection = (ev: CustomEvent): void => {
        const { uniqueKey, roomIndex } = ev.detail;
        this._selectedElementKey = uniqueKey;

        // Auto-expand element in editor (Phase 4)
        if (this._editorMode && roomIndex !== undefined && uniqueKey) {
            this.updateComplete.then(() => {
                this._roomsEditor?.expandElementAtPath(roomIndex, uniqueKey);
            });
        }

        // Update preview with new selection
        this._configChanged();
    }

    // Phase 3: Handle element focus from editor panel
    private _handleElementFocus = (ev: CustomEvent): void => {
        // Only update selection when in editor mode
        if (!this._editorMode) return;

        const { uniqueKey } = ev.detail;
        this._selectedElementKey = uniqueKey;
        this._configChanged();
    }

    // Room handlers
    private _handlePreviewDetail(ev: CustomEvent): void {
        const { roomIndex, showPreview } = ev.detail;
        
        // Clear selection when switching rooms (Task 3)
        if (this._previewRoomIndex !== null && roomIndex !== this._previewRoomIndex) {
            this._selectedElementKey = null;
        }
        
        this._previewRoomIndex = showPreview ? roomIndex : null;
        
        // Clear selection when hiding preview
        if (!showPreview) {
            this._selectedElementKey = null;
        }
        
        // Trigger config update to update the preview
        this._configChanged();
    }

    private _addRoom(): void {
        const newRoom: Room = {
            name: this.localize('editor.new_room'),
            boundary: [
                [100, 100],
                [300, 100],
                [300, 200],
                [100, 200]
            ],
            entities: []
        };

        this._config = {
            ...this._config,
            rooms: [...(this._config.rooms || []), newRoom]
        };
        
        this._configChanged();
    }

    private _updateRoom(ev: CustomEvent): void {
        const { roomIndex, room } = ev.detail;
        const rooms = [...(this._config.rooms || [])];
        rooms[roomIndex] = room;

        this._config = {
            ...this._config,
            rooms
        };

        this._configChanged();
    }

    private _removeRoom(ev: CustomEvent): void {
        const { roomIndex } = ev.detail;
        const rooms = [...(this._config.rooms || [])];
        rooms.splice(roomIndex, 1);

        this._config = {
            ...this._config,
            rooms
        };

        this._configChanged();
    }

    private _reorderRooms(ev: CustomEvent): void {
        const { rooms } = ev.detail;

        this._config = {
            ...this._config,
            rooms
        };

        this._configChanged();
    }

    // Basic config change handlers
    private _imageChanged(ev: any): void {
        this._config = { ...this._config, image: ev.target.value };
        this._configChanged();
    }

    private _imageWidthChanged(ev: any): void {
        this._config = { ...this._config, image_width: parseInt(ev.target.value) || 1360 };
        this._configChanged();
    }

    private _imageHeightChanged(ev: any): void {
        this._config = { ...this._config, image_height: parseInt(ev.target.value) || 849 };
        this._configChanged();
    }

    private _minScaleChanged(ev: any): void {
        this._config = { ...this._config, min_scale: parseFloat(ev.target.value) || 0.5 };
        this._configChanged();
    }

    private _maxScaleChanged(ev: any): void {
        this._config = { ...this._config, max_scale: parseFloat(ev.target.value) || 3 };
        this._configChanged();
    }

    private _elementDetailScaleRatioChanged(ev: any): void {
        const value = parseFloat(ev.target.value);
        if (!isNaN(value)) {
            this._config = { ...this._config, element_detail_scale_ratio: Math.max(0, Math.min(1, value)) };
            this._configChanged();
        }
    }

    private _showRoomBackgroundsChanged(ev: any): void {
        this._config = { ...this._config, show_room_backgrounds: ev.target.checked };
        this._configChanged();
    }

    // Dynamic colors change handlers
    private _ambientLightsColorChanged(ev: any): void {
        this._config = { 
            ...this._config, 
            dynamic_colors: {
                ...this._config.dynamic_colors,
                ambient_lights: ev.target.value
            }
        };
        this._configChanged();
    }

    private _motionOccupancyColorChanged(ev: any): void {
        this._config = { 
            ...this._config, 
            dynamic_colors: {
                ...this._config.dynamic_colors,
                motion_occupancy: ev.target.value
            }
        };
        this._configChanged();
    }

    private _lightsColorChanged(ev: any): void {
        this._config = { 
            ...this._config, 
            dynamic_colors: {
                ...this._config.dynamic_colors,
                lights: ev.target.value
            }
        };
        this._configChanged();
    }

    private _defaultColorChanged(ev: any): void {
        this._config = { 
            ...this._config, 
            dynamic_colors: {
                ...this._config.dynamic_colors,
                default: ev.target.value
            }
        };
        this._configChanged();
    }

    private _motionDelaySecondsChanged(ev: any): void {
        const value = parseInt(ev.target.value);
        if (!isNaN(value) && value >= 0) {
            this._config = { 
                ...this._config, 
                dynamic_colors: {
                    ...this._config.dynamic_colors,
                    motion_delay_seconds: value
                }
            };
            this._configChanged();
        }
    }

    private _infoBoxDefaultsChanged(ev: any): void {
        this._config = {
            ...this._config,
            info_box_defaults: ev.detail.value
        };
        this._configChanged();
    }

    private _configChanged(): void {
        const event = new CustomEvent("config-changed", {
            detail: {
                config: {
                    ...this._config,
                    _previewRoomIndex: this._previewRoomIndex,
                    _editorMode: this._editorMode,
                    _selectedElementKey: this._selectedElementKey
                }
            },
            bubbles: true,
            composed: true,
        });
        this.dispatchEvent(event);
    }
}
