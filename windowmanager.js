import GLib from 'gi://GLib';

const WEBLING_CLASS = "com.github.noobaldrin.webling";

export class WindowManager {
    constructor(settings) {
        this._settings = settings;
        this._display = global.display;
        this._win = null;
        this._findWindowId = 0;
        this._resizeTimeoutId = 0;
        this._positionChangedTimeoutId = 0;
        this._setupListener();
    }

    _setupListener() {
        this._display.connectObject(
            'window-created', (display, window) => this._onWindowCreated(display, window),
            this
        );
    }

    _onWindowCreated(display, _window) {
        this._findWindowId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            if (_window.get_wm_class() !== WEBLING_CLASS)
                return GLib.SOURCE_REMOVE;

            this._win = _window;
            this._win.connectObject(
                "size-changed", (window) => this._onSizeChanged(window),
                "position-changed", (window) => this._onPositionChanged(window),
                "unmanaged", (window) => this._onUnmanaged(window),
                "notify::mapped", (window) => this._onMapped(window),
                "notify::above", (window) => this._onAbove(window),
                this
            );

            return GLib.SOURCE_REMOVE;
        });
    }

    _onSizeChanged(window) {
        if (this._resizeTimeoutId)
            return;

        this._resizeTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 350, () => this._onResizeTimeout(window));
    }

    _onResizeTimeout(window) {
        const rect = window.get_frame_rect();
        this._settings.set_int("win-size-height", rect.height);
        this._settings.set_int("win-size-width", rect.width);

        this._resizeTimeoutId = 0;

        return GLib.SOURCE_REMOVE;
    }

    _onPositionChanged(window) {
        if (this._positionChangedTimeoutId)
            return;

        this._positionChangedTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 350, () => this._onPositionChangeTimeout(window));
    }

    _onPositionChangeTimeout(window) {
        const rect = window.get_frame_rect();

        const display = window.get_display();
        const primaryMonitorIndex = display.get_primary_monitor();
        const monRect = display.get_monitor_geometry(primaryMonitorIndex);

        const x = rect.x;
        const y = rect.y;

        let currentMonitor = null;
        for (let i = 0; i < display.get_n_monitors(); i++) {
            const m = display.get_monitor_geometry(i);

            if (x >= m.x && x < m.x + m.width &&
                y >= m.y && y < m.y + m.height) {
                currentMonitor = i;
                break;
           }
        }

        if (currentMonitor === primaryMonitorIndex) {
            let relX = rect.x - monRect.x;
            let relY = rect.y - monRect.y;

            // Clamp to primary monitor bounds
            relX = Math.max(0, Math.min(relX, monRect.width - rect.width));
            relY = Math.max(0, Math.min(relY, monRect.height - rect.height));

            this._settings.set_int("win-pos-x", relX);
            this._settings.set_int("win-pos-y", relY);
        }

        this._positionChangedTimeoutId = 0;
        return GLib.SOURCE_REMOVE;
    }

    _onUnmanaged(window) {
        window.disconnectObject(this);
        this._win = null;
    }

    _onMapped(window) {
        if (!this.isWindowOnPrimary())
            this.moveWindowToPrimaryMonitor();

        const display = window.get_display();
        const primaryIndex = display.get_primary_monitor();
        const primaryRect = display.get_monitor_geometry(primaryIndex);

        // Get stored monitor relative from gsettings
        const relX = this._settings.get_int("win-pos-x");
        const relY = this._settings.get_int("win-pos-y");
        const width = this._settings.get_int("win-size-width");
        const height = this._settings.get_int("win-size-height");

        if (this._settings.get_boolean("always-on-top"))
            window.make_above();
        else window.unmake_above();

        window.move_resize_frame(
            false,
            primaryRect.x + relX,
            primaryRect.y + relY,
            width,
            height
        );
    }

    _onAbove(window) {
        this._settings.set_boolean("always-on-top", window.above);
    }

    setFocus() {
        if (!this._win)
            return;

        // Todo: work on behavior when under another window
        this._win.raise();
        this._win.focus(global.get_current_time());
    }

    isFocused() {
        if (!this._win)
            return false;

        return this._win.has_focus();
    }

    isInCurrentWorkspace() {
        if (!this._win)
            return false;

        const currentWorkspace = global.workspace_manager.get_active_workspace();
        const winCurrentWorkspace = this._win.get_workspace();
        return currentWorkspace === winCurrentWorkspace;
    }

    isWindowOnPrimary() {
        if (!this._win)
            return false;

        const primaryIndex = this._display.get_primary_monitor();
        const rect = this._win.get_frame_rect();
        const x = rect.x; // top-left corner
        const y = rect.y;

        let foundMonitor = null;

        for (let i = 0; i < this._display.get_n_monitors(); i++) {
            const m = this._display.get_monitor_geometry(i);
            if (x >= m.x && x < m.x + m.width &&
                y >= m.y && y < m.y + m.height) {
                foundMonitor = i;
                break;
            }
        }

        return foundMonitor === primaryIndex;
    }

    moveWindowToPrimaryMonitor() {
        if (!this._win)
            return;

        const primaryMonitor = this._display.get_primary_monitor();

        this._win.move_to_monitor(primaryMonitor);
    }

    moveWindowToCurrentWorkspace() {
        if (!this._win)
            return;

        this._win.change_workspace(global.workspace_manager.get_active_workspace());
    }

    debugCheck() {
        if (!this._win) {
            console.debug("_win is null");
            return;
        }

        console.debug("DEBUG")
    }

    _removeMainLoopSources() {
        if (this._resizeTimeoutId) {
            GLib.Source.remove(this._resizeTimeoutId);
            this._resizeTimeoutId = null;
        }

        if (this._positionChangedTimeoutId) {
            GLib.Source.remove(this._positionChangedTimeoutId);
            this._positionChangedTimeoutId = null;
        }

        if (this._findWindowId) {
            GLib.Source.remove(this._findWindowId);
            this._findWindowId = null;
        }
    }

    destroy() {
        this._display?.disconnectObject(this);
        this._display = null;

        this._win?.disconnectObject(this);
        this._win = null;

        this._settings = null;

        this._removeMainLoopSources();
    }
}