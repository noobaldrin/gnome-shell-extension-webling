import GLib from 'gi://GLib';

const WEBLING_CLASS = "com.github.noobaldrin.webling";

export class WindowManager {
    constructor(settings) {
        this._settings = settings;
        this._metaWindow = global.display;
        this._win = null;
        this._windowCreatedId = 0;
        this._windowResizedId = 0;
        this._windowPositionChangedId = 0;
        this._windowMappedId = 0;
        this._windowUnmanagedId = 0;
        this._setupListener();
    }

    _setupListener() {
        this._windowCreatedId = this._metaWindow.connect('window-created', (display, window) => {
            GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                if (window.get_wm_class() === WEBLING_CLASS) {
                    this._win = window;

                    this._resizeTimeout = 0;
                    this._windowResizedId = this._win.connect("size-changed", (window) => {
                        if (this._resizeTimeout)
                            GLib.source_remove(this._resizeTimeout);

                        this._resizeTimeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => {
                            const rect = window.get_frame_rect();
                            this._settings.sizepos.set_int("win-size-height", rect.height);
                            this._settings.sizepos.set_int("win-size-width", rect.width);

                            this._resizeTimeout = 0;
                        });
                    });

                    this._positionChangedTimeout = 0;
                    this._windowPositionChangedId = this._win.connect("position-changed", (window) => {
                        if (this._positionChangedTimeout)
                            GLib.source_remove(this._positionChangedTimeout);

                        this._positionChangedTimeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => {
                            const rect = window.get_frame_rect();
                            const display = global.display;
                            const primaryIndex = display.get_primary_monitor();
                            const monRect = display.get_monitor_geometry(primaryIndex);

                            const x = rect.x;
                            const y = rect.y;

                            let currentMonitor = null;
                            for (let i = 0; i < display.get_n_monitors(); i++) {
                                const m = display.get_monitor_geometry(i);
                                if (x >= m.x && x < m.x + m.width &&
                                    y >= m.y && y < m.y + m.height)
                                {
                                    currentMonitor = i;
                                    break;
                                }
                            }

                            if (currentMonitor === primaryIndex) {
                                let relX = rect.x - monRect.x;
                                let relY = rect.y - monRect.y;

                                // Clamp to primay monitor bounds
                                relX = Math.max(0, Math.min(relX, monRect.width - rect.width));
                                relY = Math.max(0, Math.min(relY, monRect.height - rect.height));

                                this._settings.sizepos.set_int("win-pos-x", relX);
                                this._settings.sizepos.set_int("win-pos-y", relY);
                            }

                            this._positionChangedTimeout = 0;
                        });
                    });

                    this._windowMappedId = this._win.connect("notify::mapped", () => {
                        if (!this.isWindowOnPrimary())
                            this.moveWindowToPrimaryMonitor();

                        const display = global.display;
                        const primaryIndex = display.get_primary_monitor();
                        const primaryRect = display.get_monitor_geometry(primaryIndex);

                        // Read stored monitor-relative coordinates
                        const relX = this._settings.sizepos.get_int("win-pos-x");
                        const relY = this._settings.sizepos.get_int("win-pos-y");
                        const width = this._settings.sizepos.get_int("win-size-width");
                        const height = this._settings.sizepos.get_int("win-size-height");

                        if (this._settings.toggles.get_boolean("always-on-top"))
                            this._win.make_above();
                        else this._win.unmake_above();

                        this._win.move_resize_frame(
                            false,
                            primaryRect.x + relX,
                            primaryRect.y + relY,
                            width,
                            height
                        );
                    });

                    this._windowUnmanagedId = this._win.connect("unmanaged", () => {
                        this._win.disconnect(this._windowResizedId);
                        this._win.disconnect(this._windowPositionChangedId);
                        this._win.disconnect(this._wmMappedId);
                        this._win = null;
                    });

                    return GLib.SOURCE_REMOVE;
                }
            });
        });
    }

    setFocus() {
        if (!this._win)
            return;

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
        if (!this._win) return false;

        const display = global.display;
        const primaryIndex = display.get_primary_monitor();
        const rect = this._win.get_frame_rect();
        const x = rect.x; // top-left corner
        const y = rect.y;

        let foundMonitor = null;

        for (let i = 0; i < display.get_n_monitors(); i++) {
            const m = display.get_monitor_geometry(i);
            if (x >= m.x && x < m.x + m.width &&
                y >= m.y && y < m.y + m.height)
            {
                foundMonitor = i;
                break;
            }
        }

        return foundMonitor === primaryIndex;
    }

    moveWindowToPrimaryMonitor() {
        if (!this._win)
            return;

        const display = global.display;
        const primaryMonitor = display.get_primary_monitor();

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

        // This will be printed in /var/log/messages
        console.debug("DEBUG")
    }

}