import GObject from 'gi://GObject';
import St from 'gi://St';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';

import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import {DBusClient, dbuscall, BUS_NAME} from "./dbus.js";
import {WindowManager} from "./windowmanager.js";

const APP_PATH = `${GLib.get_home_dir()}/.local/bin/webling`;

export const Indicator = GObject.registerClass(
    class Indicator extends PanelMenu.Button {
        _init(settings) {
            super._init(0.0, _('Webling button'));
            this._settings = settings;

            this.add_child(new St.Icon({
                icon_name: 'web-browser-symbolic',
                style_class: 'system-status-icon',
            }));

            this._wm = new WindowManager(settings);

            this.connect('button-press-event', this._onButtonPressed.bind(this));

            this._alwaysOnTopItem = new PopupMenu.PopupSwitchMenuItem(_("Always On Top"));
            this._alwaysOnTopId = this._alwaysOnTopItem.connect('toggled', (item, state) => {
                this._settings.toggles.set_boolean("always-on-top", state);
                if (!this._wm._win)
                    return;

                if (state)
                    this._wm._win.make_above();
                else this._wm._win.unmake_above();
            })

            this._settings.toggles.connect("changed::always-on-top", (settings_, key) => {
                // Todo: Seems like an undefined behavior when menu is hidden
                // Object Gjs_ui_popupMenu_PopupMenuItem (0x56537dbca500), has been already disposed — impossible
                // to access it. This might be caused by the object having been destroyed from C code using something
                // such as destroy(), dispose(), or remove() vfuncs.
                this._alwaysOnTopItem.setToggleState(settings_.get_boolean(key));
            });

            this._prefsItem = new PopupMenu.PopupMenuItem(_('Preferences'));
            this._prefsItemId = this._prefsItem.connect('activate', () => {
                // Preferences will come later
            });

            this._closeItem = new PopupMenu.PopupMenuItem(_('Close'));
            this._closeItemId = this._closeItem.connect('activate', () => {
                dbuscall('Close');
            });

            this.menu.addMenuItem(this._alwaysOnTopItem);
            this.menu.addMenuItem(this._prefsItem);
            this.menu.addMenuItem(this._closeItem);
        }

        _onButtonPressed(actor, event) {
            DBusClient.checkNameHasOwner(BUS_NAME, (err, result) => {
                if (err || !Array.isArray(result)) {
                    console.debug(err ?? new Error('webling: Invalid DBus response'));
                    return;
                }

                switch (event.get_button()) {
                    case 1: {
                        this.menu.close();

                        const [isRunning] = result;
                        if (!isRunning) {
                            this.launchApp();
                            return;
                        }

                        if (!this._wm.isFocused())
                            this._wm.setFocus();

                        if (!this._wm.isInCurrentWorkspace()) {
                            this._wm.moveWindowToCurrentWorkspace();
                            GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                                dbuscall('Show');
                            });
                            return;
                        } else if (this._wm.isInCurrentWorkspace()) {
                            GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                                dbuscall('Toggle');
                            });
                            return;
                        }

                        break;
                    }
                    case 3:
                        this.menu.open(true);
                        break;
                    case 2:
                        // Middle click used for debugging
                        this.menu.close();

                        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                            dbuscall('Debug');
                            this._wm.debugCheck();
                        });

                        break;
                }
            });

            return Clutter.EVENT_STOP;
        }

        launchApp() {
            if (!GLib.find_program_in_path(APP_PATH)) {
                this.showBinaryMissingDialog(APP_PATH);
                return;
            }

            Gio.Subprocess.new([APP_PATH], Gio.SubprocessFlags.NONE);
            console.log("Webling launching...");
        }

        showBinaryMissingDialog(binaryName) {
            const dialog = new ModalDialog.ModalDialog({ styleClass: 'system-dialog' });

            const content = new St.BoxLayout({
                vertical: true,
                style_class: 'modal-dialog-content',
                width: 300
            });

            const messageLabel = new St.Label({
                text: `The application\n"${binaryName}"\nis not found.\n`
            });
            content.add_child(messageLabel);

            const linkButton = new St.Button({ style_class: 'modal-dialog-link', x_expand: true });
            const linkLabel = new St.Label({ text: 'Install from GitHub' });
            linkButton.set_child(linkLabel);

            linkButton.connect('clicked', () => {
                Gio.AppInfo.launch_default_for_uri('https://github.com/noobaldrin/webling', null);
            });

            content.add_child(linkButton);
            dialog.contentLayout.add_child(content);

            dialog.setButtons([
                {
                    label: 'Go to https://github.com/noobaldrin/webling',
                    action: () => dialog.close(),
                    key: Clutter.KEY_Escape
                }
            ]);

            dialog.open();
        }

        destroy() {
            this._closeItem.disconnect(this._closeItemId);
            this._prefsItem.disconnect(this._prefsItemId);
            this._alwaysOnTopItem.disconnect(this._alwaysOnTopId);
            this._wm.destroy();
            super.destroy();
        }

    });