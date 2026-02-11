import { LitElement, html, svg, css } from "lit-element";
import { customElement, property, state } from "lit/decorators.js";

/**
 * Room bounds shape used by the handles component
 */
export interface RoomBounds {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
}

/**
 * Event detail dispatched when a boundary point is moved or copied
 */
export interface BoundaryPointChangedDetail {
    roomIndex: number;
    pointIndex: number;
    newPoint: [number, number];
    mode: 'move' | 'copy';
}

/**
 * Event detail dispatched when a boundary point is deleted
 */
export interface BoundaryPointDeletedDetail {
    roomIndex: number;
    pointIndex: number;
}

/** Handle size in pixels (constant regardless of zoom) */
const HANDLE_SIZE = 10;

/** Drag threshold in pixels before drag activates */
const DRAG_THRESHOLD = 3;

/**
 * Drag state tracked during an active boundary point drag.
 * NOT reactive (@state) - we use direct DOM manipulation during drag
 * to avoid re-renders that would destroy SVG elements and lose pointer capture.
 */
interface DragState {
    pointIndex: number;
    startClientX: number;
    startClientY: number;
    originalPoint: [number, number];
    isCtrlHeld: boolean;
    pointerId: number;
    isDragging: boolean;
    /** The <rect> element being dragged (for direct DOM updates) */
    handleElement: SVGRectElement;
}

/**
 * BoundaryHandles - Renders draggable handles at each vertex of a room boundary polygon.
 *
 * IMPORTANT: During drag, all visual updates happen via direct DOM manipulation (setAttribute)
 * rather than reactive @state updates. This prevents LitElement re-renders from destroying
 * SVG elements mid-drag, which would lose pointer capture and kill the drag.
 *
 * Features:
 * - Drag handles to reposition boundary vertices
 * - CTRL+drag to copy (insert new) vertex
 * - Ghost polygon preview during drag
 * - Click to select, Delete key to remove point
 * - Escape to cancel drag
 * - Minimum 3 points enforced for deletion
 */
@customElement("boundary-handles-shp")
export class BoundaryHandles extends LitElement {
    @property({ attribute: false }) boundary!: [number, number][];
    @property({ type: Number }) roomIndex!: number;
    @property({ type: Number }) scale!: number;
    @property({ attribute: false }) roomBounds!: RoomBounds;

    /** Non-reactive drag state - updated imperatively, never triggers render */
    private _dragState: DragState | null = null;

    /** Selected point index - owned by editor, passed down as property */
    @property({ attribute: false }) selectedPointIndex: number | null = null;

    /** Cached parent scale factor for compensating CSS transforms */
    private _parentScale: number | null = null;

    connectedCallback() {
        super.connectedCallback();
        document.addEventListener('keydown', this._handleKeyDown);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        document.removeEventListener('keydown', this._handleKeyDown);
        // Clean up document listeners if drag was in progress
        this._removeDocumentListeners();
    }

    static styles = css`
        :host {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 5;
        }

        svg {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            overflow: visible;
        }

        .boundary-handle {
            pointer-events: all;
            cursor: grab;
        }

        .boundary-handle:hover {
            filter: brightness(0.9);
        }

        .ghost-polygon {
            pointer-events: none;
        }

        .drag-preview-handle {
            pointer-events: none;
        }

        .point-label {
            pointer-events: none;
            user-select: none;
        }
    `;

    /** Convert config X coordinate to screen X */
    private _toScreenX(configX: number): number {
        return (configX - this.roomBounds.minX) * this.scale;
    }

    /** Convert config Y coordinate to screen Y */
    private _toScreenY(configY: number): number {
        return (configY - this.roomBounds.minY) * this.scale;
    }

    /**
     * Compensate for parent CSS scale transforms.
     * Walks up the DOM (including shadow boundaries) to find a scaled ancestor.
     */
    private _compensateParentScale(dxScreen: number, dyScreen: number): { dx: number; dy: number } {
        if (this._parentScale === null) {
            this._parentScale = 1;
            let element: HTMLElement | null = this as HTMLElement;
            for (let i = 0; i < 20 && element; i++) {
                const nextElement: HTMLElement | null = element.parentElement;
                if (nextElement) {
                    element = nextElement;
                } else {
                    const root = element.getRootNode();
                    if (root instanceof ShadowRoot && root.host) {
                        element = root.host as HTMLElement;
                    } else {
                        break;
                    }
                }
                if (!element) break;

                const transform = window.getComputedStyle(element).transform;
                if (transform && transform !== 'none') {
                    try {
                        const matrix = new DOMMatrix(transform);
                        const scaleX = matrix.a;
                        if (Math.abs(scaleX - 1) > 0.01) {
                            this._parentScale = scaleX;
                            break;
                        }
                    } catch {
                        // Continue searching
                    }
                }
            }
        }

        return {
            dx: dxScreen / this._parentScale,
            dy: dyScreen / this._parentScale,
        };
    }

    /**
     * Dispatch selection change to editor (which owns the selection state).
     * Also clears element selection via mutual exclusion in the editor.
     */
    private _dispatchSelection(pointIndex: number | null): void {
        window.dispatchEvent(new CustomEvent('scalable-house-plan-boundary-point-selected', {
            detail: { pointIndex }
        }));
    }

    // ─── Drag via document-level listeners ───────────────────────────

    private _onHandlePointerDown = (e: PointerEvent, pointIndex: number): void => {
        if (e.button !== 0) return;
        e.stopPropagation();
        e.preventDefault();

        // Notify editor of selection change (editor owns the selection state)
        this._dispatchSelection(pointIndex);

        const handleEl = e.currentTarget as SVGRectElement;

        this._dragState = {
            pointIndex,
            startClientX: e.clientX,
            startClientY: e.clientY,
            originalPoint: [...this.boundary[pointIndex]] as [number, number],
            isCtrlHeld: e.ctrlKey,
            pointerId: e.pointerId,
            isDragging: false,
            handleElement: handleEl,
        };

        // Reset cached parent scale for each new drag
        this._parentScale = null;

        // Attach move/up to document so we never lose events, even if
        // LitElement re-renders the SVG underneath us.
        document.addEventListener('pointermove', this._onDocumentPointerMove);
        document.addEventListener('pointerup', this._onDocumentPointerUp);

        // Capture pointer on the handle element for reliable delivery
        handleEl.setPointerCapture(e.pointerId);
    };

    private _removeDocumentListeners(): void {
        document.removeEventListener('pointermove', this._onDocumentPointerMove);
        document.removeEventListener('pointerup', this._onDocumentPointerUp);
    }

    private _onDocumentPointerMove = (e: PointerEvent): void => {
        if (!this._dragState || this._dragState.pointerId !== e.pointerId) return;

        // Update CTRL state live
        this._dragState.isCtrlHeld = e.ctrlKey;

        const dxScreen = e.clientX - this._dragState.startClientX;
        const dyScreen = e.clientY - this._dragState.startClientY;
        const { dx, dy } = this._compensateParentScale(dxScreen, dyScreen);

        // Check threshold
        if (!this._dragState.isDragging) {
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance < DRAG_THRESHOLD) return;
            this._dragState.isDragging = true;
            this._ensureOverlayElements();
        }

        // Calculate new screen position for the dragged point
        const origScreenX = this._toScreenX(this._dragState.originalPoint[0]);
        const origScreenY = this._toScreenY(this._dragState.originalPoint[1]);
        const newScreenX = origScreenX + dx;
        const newScreenY = origScreenY + dy;
        const halfHandle = HANDLE_SIZE / 2;

        // ── Direct DOM manipulation (no reactive updates!) ──

        // 1) Move the preview handle
        const previewHandle = this.renderRoot.querySelector('.drag-preview-handle') as SVGRectElement | null;
        if (previewHandle) {
            previewHandle.setAttribute('x', String(newScreenX - halfHandle));
            previewHandle.setAttribute('y', String(newScreenY - halfHandle));
            previewHandle.setAttribute('fill', this._dragState.isCtrlHeld ? '#4CAF50' : '#FF9800');
            previewHandle.setAttribute('visibility', 'visible');
        }

        // 2) Update ghost polygon
        const ghostPolygon = this.renderRoot.querySelector('.ghost-polygon') as SVGPolygonElement | null;
        if (ghostPolygon) {
            ghostPolygon.setAttribute('points', this._buildPreviewPoints(newScreenX, newScreenY));
            ghostPolygon.setAttribute('stroke', this._dragState.isCtrlHeld ? '#4CAF50' : '#2196F3');
            ghostPolygon.setAttribute('visibility', 'visible');
        }

        // 3) Hide/fade the original handle
        const handles = this.renderRoot.querySelectorAll('.boundary-handle');
        const draggedHandle = handles[this._dragState.pointIndex] as SVGRectElement | undefined;
        if (draggedHandle) {
            if (this._dragState.isCtrlHeld) {
                // Copy mode: show original faded
                draggedHandle.setAttribute('opacity', '0.35');
            } else {
                // Move mode: hide original
                draggedHandle.setAttribute('opacity', '0');
            }
        }

        e.preventDefault();
    };

    private _onDocumentPointerUp = (e: PointerEvent): void => {
        if (!this._dragState || this._dragState.pointerId !== e.pointerId) return;

        // Release pointer capture
        try {
            this._dragState.handleElement.releasePointerCapture(e.pointerId);
        } catch {
            // Element may have been removed from DOM
        }

        this._removeDocumentListeners();

        if (!this._dragState.isDragging) {
            // Was just a click - selection already set in pointerdown
            this._dragState = null;
            return;
        }

        const dxScreen = e.clientX - this._dragState.startClientX;
        const dyScreen = e.clientY - this._dragState.startClientY;
        const { dx, dy } = this._compensateParentScale(dxScreen, dyScreen);

        // Convert to config-space delta
        const dxConfig = dx / this.scale;
        const dyConfig = dy / this.scale;

        const newX = Math.round(this._dragState.originalPoint[0] + dxConfig);
        const newY = Math.round(this._dragState.originalPoint[1] + dyConfig);

        const mode = this._dragState.isCtrlHeld ? 'copy' : 'move';
        const pointIndex = this._dragState.pointIndex;

        // Clear drag state BEFORE dispatching event (which triggers re-render)
        this._dragState = null;

        window.dispatchEvent(new CustomEvent<BoundaryPointChangedDetail>(
            'scalable-house-plan-boundary-point-changed', {
                detail: {
                    roomIndex: this.roomIndex,
                    pointIndex,
                    newPoint: [newX, newY],
                    mode,
                }
            }
        ));

        // Force re-render to reset all DOM manipulations (opacity, visibility, etc.)
        this.requestUpdate();
    };

    /**
     * Build ghost polygon points string for the current drag position.
     */
    private _buildPreviewPoints(newScreenX: number, newScreenY: number): string {
        if (!this._dragState) return '';

        const { pointIndex, isCtrlHeld } = this._dragState;
        const points: string[] = [];

        for (let i = 0; i < this.boundary.length; i++) {
            if (i === pointIndex && !isCtrlHeld) {
                // Move mode: replace this point with preview position
                points.push(`${newScreenX},${newScreenY}`);
            } else {
                points.push(
                    `${this._toScreenX(this.boundary[i][0])},${this._toScreenY(this.boundary[i][1])}`
                );
            }

            // Copy mode: insert the new point after the source
            if (i === pointIndex && isCtrlHeld) {
                points.push(`${newScreenX},${newScreenY}`);
            }
        }

        return points.join(' ');
    }

    /**
     * Ensure the overlay elements (ghost polygon, preview handle) exist and are hidden.
     * These are always rendered in the template but start with visibility:hidden.
     * This method is called once when drag actually starts.
     */
    private _ensureOverlayElements(): void {
        const previewHandle = this.renderRoot.querySelector('.drag-preview-handle') as SVGRectElement | null;
        if (previewHandle) {
            previewHandle.setAttribute('visibility', 'hidden');
        }
        const ghostPolygon = this.renderRoot.querySelector('.ghost-polygon') as SVGPolygonElement | null;
        if (ghostPolygon) {
            ghostPolygon.setAttribute('visibility', 'hidden');
        }
    }

    private _handleKeyDown = (e: KeyboardEvent): void => {
        // Escape: cancel drag
        if (e.key === 'Escape' && this._dragState?.isDragging) {
            try {
                this._dragState.handleElement.releasePointerCapture(this._dragState.pointerId);
            } catch { /* ok */ }
            this._removeDocumentListeners();
            this._dragState = null;
            // Force re-render to restore handle visuals
            this.requestUpdate();
            return;
        }

        // Remaining key handlers require a selected point and no active drag
        if (this.selectedPointIndex === null || this._dragState) return;

        // Don't interfere with typing in input fields
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

        // Arrow keys: nudge selected point by 1px
        const arrowKeys: Record<string, [number, number]> = {
            'ArrowLeft':  [-1,  0],
            'ArrowRight': [ 1,  0],
            'ArrowUp':    [ 0, -1],
            'ArrowDown':  [ 0,  1],
        };

        const nudge = arrowKeys[e.key];
        if (nudge) {
            e.preventDefault();

            const point = this.boundary[this.selectedPointIndex];
            if (!point) return;

            window.dispatchEvent(new CustomEvent<BoundaryPointChangedDetail>(
                'scalable-house-plan-boundary-point-changed', {
                    detail: {
                        roomIndex: this.roomIndex,
                        pointIndex: this.selectedPointIndex,
                        newPoint: [point[0] + nudge[0], point[1] + nudge[1]],
                        mode: 'move',
                    }
                }
            ));
            return;
        }

        // Delete/Backspace: remove selected point
        if (e.key === 'Delete' || e.key === 'Backspace') {
            // Minimum 3 points
            if (this.boundary.length <= 3) return;

            e.preventDefault();

            window.dispatchEvent(new CustomEvent<BoundaryPointDeletedDetail>(
                'scalable-house-plan-boundary-point-deleted', {
                    detail: {
                        roomIndex: this.roomIndex,
                        pointIndex: this.selectedPointIndex,
                    }
                }
            ));

            // Clear selection via editor
            this._dispatchSelection(null);
        }
    };

    /**
     * Get fill color for a handle based on its state (selection only - drag visuals are imperative)
     */
    private _getHandleFill(index: number): string {
        if (this.selectedPointIndex === index) {
            return '#2196F3';
        }
        return '#FFFFFF';
    }

    /**
     * Get stroke color for a handle based on its state
     */
    private _getHandleStroke(index: number): string {
        if (this.selectedPointIndex === index) {
            return '#FFFFFF';
        }
        return '#2196F3';
    }

    render() {
        if (!this.boundary || this.boundary.length === 0) return html``;

        const scaledWidth = this.roomBounds.width * this.scale;
        const scaledHeight = this.roomBounds.height * this.scale;
        const halfHandle = HANDLE_SIZE / 2;

        // Build initial polygon points (used for ghost polygon initial value)
        const currentPoints = this.boundary
            .map(p => `${this._toScreenX(p[0])},${this._toScreenY(p[1])}`)
            .join(' ');

        return html`
            ${svg`
                <svg viewBox="0 0 ${scaledWidth} ${scaledHeight}"
                     preserveAspectRatio="none"
                     style="width: ${scaledWidth}px; height: ${scaledHeight}px;">

                    <!-- Ghost polygon preview (hidden until drag starts, updated imperatively) -->
                    <polygon
                        class="ghost-polygon"
                        points="${currentPoints}"
                        fill="none"
                        stroke="#2196F3"
                        stroke-width="1.5"
                        stroke-dasharray="4,4"
                        opacity="0.6"
                        visibility="hidden"
                    />

                    <!-- Vertex handles -->
                    ${this.boundary.map((point, index) => {
                        const sx = this._toScreenX(point[0]);
                        const sy = this._toScreenY(point[1]);
                        const isSelected = this.selectedPointIndex === index;

                        return svg`
                            <rect
                                x="${sx - halfHandle}"
                                y="${sy - halfHandle}"
                                width="${HANDLE_SIZE}"
                                height="${HANDLE_SIZE}"
                                rx="2"
                                ry="2"
                                fill="${this._getHandleFill(index)}"
                                stroke="${this._getHandleStroke(index)}"
                                stroke-width="${isSelected ? 2.5 : 2}"
                                class="boundary-handle"
                                @pointerdown=${(e: PointerEvent) => this._onHandlePointerDown(e, index)}
                            />
                        `;
                    })}

                    <!-- Drag preview handle (hidden until drag starts, updated imperatively) -->
                    <rect
                        class="drag-preview-handle"
                        x="0" y="0"
                        width="${HANDLE_SIZE}"
                        height="${HANDLE_SIZE}"
                        rx="2" ry="2"
                        fill="#FF9800"
                        stroke="#FFFFFF"
                        stroke-width="2"
                        visibility="hidden"
                    />

                    <!-- Point index labels -->
                    ${this.boundary.map((point, index) => {
                        const sx = this._toScreenX(point[0]);
                        const sy = this._toScreenY(point[1]);
                        return svg`
                            <text
                                x="${sx}"
                                y="${sy - halfHandle - 4}"
                                text-anchor="middle"
                                font-size="10"
                                fill="#2196F3"
                                class="point-label"
                            >${index}</text>
                        `;
                    })}
                </svg>
            `}
        `;
    }
}
