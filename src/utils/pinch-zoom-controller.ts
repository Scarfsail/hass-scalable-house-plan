const MIN_USER_ZOOM = 1.0;
const MAX_USER_ZOOM = 5.0;

type GestureState = 'idle' | 'pinching' | 'panning';

/**
 * PinchZoomController - Gesture handler for pinch-to-zoom and pan on the overview.
 *
 * Manages zoom/pan state for the overview container. During a gesture, the inner
 * div's transform is mutated directly (no LitElement re-renders at 60fps). The
 * onGestureEnd callback triggers a requestUpdate() to sync the Lit template.
 *
 * Touch event flow:
 * - 2 fingers: PINCHING → zoom around focal point + pan from midpoint movement
 * - 1 finger (zoom > 1): PANNING → pan within constrained bounds
 * - 1 finger (zoom = 1): pass-through to action handler (tap/hold on rooms)
 *
 * Wheel event flow (Windows touchpad / Ctrl+scroll):
 * - WheelEvent with ctrlKey: zoom around mouse cursor, suppress browser page zoom
 */
export class PinchZoomController {
    private _outerDiv: HTMLElement;
    private _innerDiv: HTMLElement;
    private _onGestureEnd: () => void;

    private _state: GestureState = 'idle';

    // Persistent zoom/pan state (survives individual gestures)
    private _userZoom = MIN_USER_ZOOM;
    private _panX = 0;
    private _panY = 0;

    // Base scale from overview's auto-fit calculation (updated each render)
    private _baseScaleX = 1.0;
    private _baseScaleY = 1.0;

    // Viewport and content dimensions for pan constraint clamping
    private _viewportW = 0;
    private _viewportH = 0;
    private _contentW = 0;
    private _contentH = 0;

    // Per-gesture tracking for pinch
    private _prevDistance = 0;
    private _prevMidX = 0;
    private _prevMidY = 0;

    // Per-gesture tracking for pan
    private _prevTouchX = 0;
    private _prevTouchY = 0;

    // Bound handlers stored for removeEventListener
    private _boundTouchStart: (e: TouchEvent) => void;
    private _boundTouchMove: (e: TouchEvent) => void;
    private _boundTouchEnd: (e: TouchEvent) => void;
    private _boundWheel: (e: WheelEvent) => void;
    private _boundPointerDown: (e: PointerEvent) => void;
    private _boundPointerMove: (e: PointerEvent) => void;
    private _boundPointerUp: (e: PointerEvent) => void;

    // Mouse/pen drag pan tracking (separate from touch gesture state)
    private _pointerPanId: number | null = null;
    private _pointerPanActive = false; // true only after exceeding move threshold
    private _pointerStartX = 0;
    private _pointerStartY = 0;
    private _prevPointerX = 0;
    private _prevPointerY = 0;

    public get userZoom(): number { return this._userZoom; }
    public get panX(): number { return this._panX; }
    public get panY(): number { return this._panY; }

    constructor(outerDiv: HTMLElement, innerDiv: HTMLElement, onGestureEnd: () => void) {
        this._outerDiv = outerDiv;
        this._innerDiv = innerDiv;
        this._onGestureEnd = onGestureEnd;

        this._boundTouchStart = this._handleTouchStart.bind(this);
        this._boundTouchMove = this._handleTouchMove.bind(this);
        this._boundTouchEnd = this._handleTouchEnd.bind(this);
        this._boundWheel = this._handleWheel.bind(this);
        this._boundPointerDown = this._handlePointerDown.bind(this);
        this._boundPointerMove = this._handlePointerMove.bind(this);
        this._boundPointerUp = this._handlePointerUp.bind(this);
    }

    public attach(): void {
        this._outerDiv.addEventListener('touchstart', this._boundTouchStart, { passive: false });
        this._outerDiv.addEventListener('touchmove', this._boundTouchMove, { passive: false });
        this._outerDiv.addEventListener('touchend', this._boundTouchEnd, { passive: false });
        this._outerDiv.addEventListener('touchcancel', this._boundTouchEnd, { passive: false });
        this._outerDiv.addEventListener('wheel', this._boundWheel, { passive: false });
        this._outerDiv.addEventListener('pointerdown', this._boundPointerDown);
        this._outerDiv.addEventListener('pointermove', this._boundPointerMove);
        this._outerDiv.addEventListener('pointerup', this._boundPointerUp);
        this._outerDiv.addEventListener('pointercancel', this._boundPointerUp);
    }

    public detach(): void {
        this._outerDiv.removeEventListener('touchstart', this._boundTouchStart);
        this._outerDiv.removeEventListener('touchmove', this._boundTouchMove);
        this._outerDiv.removeEventListener('touchend', this._boundTouchEnd);
        this._outerDiv.removeEventListener('touchcancel', this._boundTouchEnd);
        this._outerDiv.removeEventListener('wheel', this._boundWheel);
        this._outerDiv.removeEventListener('pointerdown', this._boundPointerDown);
        this._outerDiv.removeEventListener('pointermove', this._boundPointerMove);
        this._outerDiv.removeEventListener('pointerup', this._boundPointerUp);
        this._outerDiv.removeEventListener('pointercancel', this._boundPointerUp);
    }

    /**
     * Called from the overview's updated() lifecycle hook after each render.
     * Resets zoom/pan if the base scale changes (e.g. window resize), otherwise
     * re-clamps pan to the (potentially new) viewport dimensions.
     */
    public updateBaseScale(
        baseScaleX: number,
        baseScaleY: number,
        viewportW: number,
        viewportH: number,
        contentW: number,
        contentH: number
    ): void {
        const scaleChanged =
            Math.abs(this._baseScaleX - baseScaleX) > 0.001 ||
            Math.abs(this._baseScaleY - baseScaleY) > 0.001;

        this._baseScaleX = baseScaleX;
        this._baseScaleY = baseScaleY;
        this._viewportW = viewportW;
        this._viewportH = viewportH;
        this._contentW = contentW;
        this._contentH = contentH;

        if (scaleChanged) {
            this._userZoom = MIN_USER_ZOOM;
            this._panX = 0;
            this._panY = 0;
        } else {
            this._clampPan();
        }
    }

    private _handleTouchStart(e: TouchEvent): void {
        if (e.touches.length >= 2) {
            // Suppress browser native pinch-zoom
            e.preventDefault();
            const t1 = e.touches[0];
            const t2 = e.touches[1];
            this._prevDistance = this._getDistance(t1, t2);
            const mid = this._getMidpoint(t1, t2);
            this._prevMidX = mid.x;
            this._prevMidY = mid.y;
            this._state = 'pinching';
        } else if (e.touches.length === 1 && this._userZoom > MIN_USER_ZOOM) {
            // Single finger at zoom > 1: begin pan, let action handler handle tap/hold
            // naturally (touchmove will set cancelled=true in action handler if user pans)
            const touch = e.touches[0];
            const pos = this._getTouchPos(touch);
            this._prevTouchX = pos.x;
            this._prevTouchY = pos.y;
            this._state = 'panning';
        }
    }

    private _handleTouchMove(e: TouchEvent): void {
        if (this._state === 'idle') return;

        e.preventDefault();

        if (this._state === 'pinching') {
            if (e.touches.length >= 2) {
                const t1 = e.touches[0];
                const t2 = e.touches[1];

                const newDistance = this._getDistance(t1, t2);
                const newMid = this._getMidpoint(t1, t2);

                // Incremental zoom ratio, clamped to allowed range
                const rawRatio = newDistance / this._prevDistance;
                const newZoom = Math.max(MIN_USER_ZOOM, Math.min(MAX_USER_ZOOM, this._userZoom * rawRatio));
                const actualRatio = newZoom / this._userZoom;

                // Keep focal point (prev midpoint) stationary as zoom changes,
                // then shift by midpoint movement for simultaneous panning.
                // panX_new = newMidX - (prevMidX - panX) * actualRatio
                this._panX = newMid.x - (this._prevMidX - this._panX) * actualRatio;
                this._panY = newMid.y - (this._prevMidY - this._panY) * actualRatio;
                this._userZoom = newZoom;

                this._clampPan();
                this._applyTransform();

                this._prevDistance = newDistance;
                this._prevMidX = newMid.x;
                this._prevMidY = newMid.y;
            } else if (e.touches.length === 1) {
                // One finger lifted mid-pinch: transition to panning
                this._state = 'panning';
                const touch = e.touches[0];
                const pos = this._getTouchPos(touch);
                this._prevTouchX = pos.x;
                this._prevTouchY = pos.y;
            }
        } else if (this._state === 'panning') {
            if (e.touches.length >= 1) {
                const touch = e.touches[0];
                const pos = this._getTouchPos(touch);

                this._panX += pos.x - this._prevTouchX;
                this._panY += pos.y - this._prevTouchY;

                this._clampPan();
                this._applyTransform();

                this._prevTouchX = pos.x;
                this._prevTouchY = pos.y;
            }
        }
    }

    private _handleTouchEnd(e: TouchEvent): void {
        if (this._state === 'idle') return;

        if (e.touches.length === 0) {
            this._state = 'idle';
            this._onGestureEnd();
        } else if (e.touches.length === 1 && this._state === 'pinching') {
            // One finger remains after pinch: transition to panning
            this._state = 'panning';
            const touch = e.touches[0];
            const pos = this._getTouchPos(touch);
            this._prevTouchX = pos.x;
            this._prevTouchY = pos.y;
        }
    }

    private _handleWheel(e: WheelEvent): void {
        // Normalize delta to approximate pixel values across deltaMode variants
        let deltaX = e.deltaX;
        let deltaY = e.deltaY;
        if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) { deltaX *= 16; deltaY *= 16; }
        else if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) { deltaX *= 600; deltaY *= 600; }

        if (e.ctrlKey) {
            // Windows touchpad pinch and Ctrl+scroll: zoom the overview instead of the page.
            e.preventDefault();

            const zoomFactor = Math.exp(-deltaY / 300);
            const newZoom = Math.max(MIN_USER_ZOOM, Math.min(MAX_USER_ZOOM, this._userZoom * zoomFactor));
            const actualRatio = newZoom / this._userZoom;
            this._userZoom = newZoom;

            // Zoom around the mouse cursor position
            const rect = this._outerDiv.getBoundingClientRect();
            const fx = e.clientX - rect.left;
            const fy = e.clientY - rect.top;
            this._panX = fx - (fx - this._panX) * actualRatio;
            this._panY = fy - (fy - this._panY) * actualRatio;
        } else if (this._userZoom > MIN_USER_ZOOM) {
            // Two-finger scroll on touchpad (or plain scroll wheel): pan when zoomed in.
            e.preventDefault();
            this._panX -= deltaX;
            this._panY -= deltaY;
        } else {
            return;
        }

        this._clampPan();
        this._applyTransform();
        this._onGestureEnd();
    }

    private _handlePointerDown(e: PointerEvent): void {
        // Only handle mouse/pen; touch is handled by touch event listeners
        if (e.pointerType === 'touch') return;
        if (e.button !== 0) return;
        if (this._userZoom <= MIN_USER_ZOOM) return;

        this._pointerPanId = e.pointerId;
        this._pointerPanActive = false;
        this._pointerStartX = e.clientX;
        this._pointerStartY = e.clientY;
        this._prevPointerX = e.clientX;
        this._prevPointerY = e.clientY;
    }

    private _handlePointerMove(e: PointerEvent): void {
        if (e.pointerType === 'touch') return;
        if (this._pointerPanId === null || e.pointerId !== this._pointerPanId) return;

        if (!this._pointerPanActive) {
            const dx = e.clientX - this._pointerStartX;
            const dy = e.clientY - this._pointerStartY;
            if (Math.sqrt(dx * dx + dy * dy) < 5) return;
            this._pointerPanActive = true;
            this._outerDiv.setPointerCapture(e.pointerId);
            // Start delta from the initial pointerdown position, not where we crossed the threshold
            this._prevPointerX = this._pointerStartX;
            this._prevPointerY = this._pointerStartY;
        }

        this._panX += e.clientX - this._prevPointerX;
        this._panY += e.clientY - this._prevPointerY;
        this._prevPointerX = e.clientX;
        this._prevPointerY = e.clientY;

        this._clampPan();
        this._applyTransform();
    }

    private _handlePointerUp(e: PointerEvent): void {
        if (e.pointerType === 'touch') return;
        if (e.pointerId !== this._pointerPanId) return;

        if (this._pointerPanActive) {
            this._outerDiv.releasePointerCapture(e.pointerId);
            this._onGestureEnd();
            // Consume the resulting click so a room tap doesn't fire after dragging.
            // Only on pointerup — pointercancel produces no click, so registering here
            // would eat the next unrelated tap instead.
            if (e.type === 'pointerup') {
                this._outerDiv.addEventListener('click', (ev) => ev.stopPropagation(), { once: true, capture: true });
            }
        }

        this._pointerPanId = null;
        this._pointerPanActive = false;
    }

    private _applyTransform(): void {
        const sx = this._baseScaleX * this._userZoom;
        const sy = this._baseScaleY * this._userZoom;
        this._innerDiv.style.transform = `translate(${this._panX}px, ${this._panY}px) scale(${sx}, ${sy})`;
    }

    /**
     * Constrain pan so content never scrolls fully out of the viewport.
     * When content fits within the viewport (effectiveW <= viewportW), pan is locked to 0.
     * When content overflows, pan range is [viewportW - effectiveW, 0].
     */
    private _clampPan(): void {
        const effectiveW = this._contentW * this._baseScaleX * this._userZoom;
        const effectiveH = this._contentH * this._baseScaleY * this._userZoom;

        const minPanX = Math.min(0, this._viewportW - effectiveW);
        const minPanY = Math.min(0, this._viewportH - effectiveH);
        const maxPanX = Math.max(0, this._viewportW - effectiveW);
        const maxPanY = Math.max(0, this._viewportH - effectiveH);

        this._panX = Math.max(minPanX, Math.min(maxPanX, this._panX));
        this._panY = Math.max(minPanY, Math.min(maxPanY, this._panY));
    }

    private _getDistance(t1: Touch, t2: Touch): number {
        const dx = t1.clientX - t2.clientX;
        const dy = t1.clientY - t2.clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    private _getMidpoint(t1: Touch, t2: Touch): { x: number; y: number } {
        const rect = this._outerDiv.getBoundingClientRect();
        return {
            x: (t1.clientX + t2.clientX) / 2 - rect.left,
            y: (t1.clientY + t2.clientY) / 2 - rect.top,
        };
    }

    private _getTouchPos(touch: Touch): { x: number; y: number } {
        const rect = this._outerDiv.getBoundingClientRect();
        return {
            x: touch.clientX - rect.left,
            y: touch.clientY - rect.top,
        };
    }
}
