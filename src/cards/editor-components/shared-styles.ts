import { css } from "lit-element";

export const sharedStyles = css`
    /* Section Styles */
    .config-section {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding-bottom: 4px;
        margin-top: 8px;
        border-bottom: 2px solid var(--divider-color);
    }

    .section-title {
        font-size: 16px;
        font-weight: 600;
        color: var(--primary-text-color);
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .section-title ha-icon {
        --mdc-icon-size: 18px;
        color: var(--primary-color);
    }

    /* Button Styles */
    .add-button {
        background: var(--primary-color);
        color: white;
        border: none;
        border-radius: 20px;
        padding: 8px 16px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 500;
        transition: all 0.2s ease;
    }

    .add-button:hover {
        background: var(--primary-color);
        opacity: 0.9;
        transform: translateY(-1px);
    }

    .add-button ha-icon {
        --mdc-icon-size: 16px;
    }

    /* Collapsible Section Styles */
    .collapsible-section .section-header {
        cursor: pointer;
        user-select: none;
        position: relative;
    }

    .collapsible-section .section-header:hover {
        opacity: 0.8;
    }

    .collapsible-section .section-header .expand-icon {
        --mdc-icon-size: 20px;
        margin-right: 8px;
        transition: transform 0.2s ease;
        color: var(--secondary-text-color);
    }

    .collapsible-section .section-header .expand-icon.expanded {
        transform: rotate(90deg);
    }

    .collapsible-section .section-header ha-icon-button,
    .collapsible-section .section-header .add-button {
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.2s ease;
    }

    .collapsible-section .section-header.expanded ha-icon-button,
    .collapsible-section .section-header.expanded .add-button {
        opacity: 1;
        pointer-events: auto;
    }

    .collapsible-section .section-content {
        display: none;
        padding-top: 8px;
    }

    .collapsible-section .section-content.expanded {
        display: block;
    }

    .icon-button {
        background: none;
        border: none;
        cursor: pointer;
        padding: 8px;
        border-radius: 50%;
        transition: background 0.2s ease;
    }

    .icon-button:hover {
        background: var(--secondary-background-color);
    }

    .icon-button.danger:hover {
        background: var(--error-color);
        color: white;
    }

    .icon-button ha-icon {
        --mdc-icon-size: 16px;
    }

    /* Item Styles (for layers, groups, elements) */
    .item {
        border: 1px solid var(--divider-color);
        border-radius: 8px;
        background: var(--secondary-background-color);
        margin-bottom: 12px;
        overflow: hidden;
        transition: all 0.2s ease;
    }

    .item:hover {
        border-color: var(--primary-color);
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }

    .item-header {
        display: flex;
        align-items: center;
        padding: 16px;
        cursor: pointer;
        user-select: none;
        background: var(--card-background-color);
    }

    .item-header:hover {
        background: var(--secondary-background-color);
    }

    .expand-icon {
        --mdc-icon-size: 20px;
        margin-right: 12px;
        transition: transform 0.2s ease;
        color: var(--secondary-text-color);
    }

    .expand-icon.expanded {
        transform: rotate(90deg);
    }

    .item-info {
        flex: 1;
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 0; /* Allow flex items to shrink below content size */
    }

    .item-info > div {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
        min-width: 0;
    }

    .item-icon {
        --mdc-icon-size: 18px;
        color: var(--primary-color);
        flex-shrink: 0;
    }

    .item-name {
        font-weight: 500;
        color: var(--primary-text-color);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        min-width: 0;
    }

    .item-details {
        display: flex;
        align-items: center;
        gap: 12px;
        font-size: 12px;
        color: var(--secondary-text-color);
        flex-shrink: 0;
    }

    .item-badge {
        background: var(--primary-color);
        color: white;
        padding: 2px 8px;
        border-radius: 10px;
        font-size: 10px;
        font-weight: 500;
    }

    .item-badge.inactive {
        background: var(--disabled-color);
    }

    .item-actions {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .item-content {
        padding: 16px;
        border-top: 1px solid var(--divider-color);
        background: var(--card-background-color);
        display: none;
    }

    .item-content.expanded {
        display: block;
    }

    /* Form Styles */
    .form-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
    }

    .form-grid ha-textfield {
        width: 100%;
    }

    .form-toggles {
        grid-column: 1 / -1;
        display: flex;
        gap: 16px;
    }

    /* Empty State Styles */
    .empty-state {
        text-align: center;
        padding: 40px 20px;
        color: var(--secondary-text-color);
    }

    .empty-state ha-icon {
        --mdc-icon-size: 48px;
        margin-bottom: 16px;
        opacity: 0.5;
    }

    .empty-state-title {
        font-size: 16px;
        font-weight: 500;
        margin-bottom: 8px;
    }

    .empty-state-subtitle {
        font-size: 14px;
        opacity: 0.8;
    }

    /* Empty Drop Zone Styles */
    .empty-drop-zone {
        min-height: 100px;
        border: 2px dashed var(--divider-color);
        border-radius: 8px;
        transition: all 0.2s ease;
        position: relative;
    }

    .empty-drop-zone:hover {
        border-color: var(--primary-color);
        background: var(--primary-color-fade, rgba(33, 150, 243, 0.05));
    }

    /* Show visual feedback when dragging over empty drop zone */
    ha-sortable.dragover .empty-drop-zone {
        border-color: var(--primary-color);
        background: var(--primary-color-fade, rgba(33, 150, 243, 0.1));
        border-style: solid;
    }

    ha-sortable .empty-drop-zone {
        margin: 8px 0;
    }

    /* Make empty drop zones more prominent */
    .empty-drop-zone::before {
        content: "Drop here";
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        color: var(--secondary-text-color);
        font-size: 12px;
        opacity: 0;
        transition: opacity 0.2s ease;
        pointer-events: none;
    }

    .empty-drop-zone:hover::before,
    ha-sortable.dragover .empty-drop-zone::before {
        opacity: 0.7;
    }

    /* Placeholder Styles */
    .placeholder {
        margin-top: 16px;
        padding: 16px;
        background: var(--secondary-background-color);
        border-radius: 4px;
        text-align: center;
        color: var(--secondary-text-color);
        font-style: italic;
    }

    /* Drag & Drop Styles */
    .handle {
        cursor: grab;
        opacity: 0.6;
        transition: opacity 0.2s ease;
        margin-left: 8px;
        color: var(--secondary-text-color);
    }

    .handle:hover {
        opacity: 1;
        color: var(--primary-text-color);
    }

    .handle:active {
        cursor: grabbing;
    }

    .sortable-item {
        position: relative;
        transition: transform 0.2s ease;
        display: flex;
        align-items: flex-start;
        gap: 8px;
    }

    .sortable-content {
        flex: 1;
        min-width: 0;
    }

    .sortable-ghost {
        opacity: 0.5;
        background: var(--primary-color);
        border-radius: 8px;
    }

    .sortable-chosen .handle {
        cursor: grabbing;
        color: var(--primary-color);
    }

    .sortable-drag {
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        transform: rotate(2deg);
    }

    /* Color Field with Swatch */
    .color-field-wrapper {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .color-field-wrapper ha-textfield {
        flex: 1;
        min-width: 0;
    }

    .color-swatch {
        width: 28px;
        height: 28px;
        border-radius: 4px;
        flex-shrink: 0;
        border: 1px solid var(--divider-color);
        /* Checkerboard to visualize alpha */
        background-image:
            linear-gradient(45deg, #ccc 25%, transparent 25%),
            linear-gradient(-45deg, #ccc 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, #ccc 75%),
            linear-gradient(-45deg, transparent 75%, #ccc 75%);
        background-size: 8px 8px;
        background-position: 0 0, 0 4px, 4px -4px, -4px 0px;
        background-color: white;
        position: relative;
        overflow: hidden;
    }

    .color-swatch::after {
        content: '';
        position: absolute;
        inset: 0;
        background-color: inherit;
    }

    /* Interactive Editor Mode - Selected Element Styles */
    .selected-element {
        outline: 3px solid var(--primary-color) !important;
        outline-offset: 2px;
        border-radius: 4px;
        transition: outline 0.2s ease;
        z-index: 1000;
        position: relative;
    }

    .selected-element::after {
        content: '';
        position: absolute;
        inset: -2px;
        border-radius: 4px;
        background: var(--primary-color);
        opacity: 0.1;
        pointer-events: none;
    }
`;
