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
            this.add_child(new St.Icon({
                icon_name: 'web-browser-symbolic',
                style_class: 'system-status-icon',
            }));

            this._settings = settings;
            this._wm = new WindowManager(settings);

            this._missingBinaryDialog = null;
            this._dialogContent = null;
            this._messageLabel = null;
            this._linkButton = null;
            this._linkLabel = null;

            this._buttonPressedId = 0;
            this._alwaysOnTopSettingsId = 0;
            this._alwaysOnTopItemId = 0;
            this._prefsItemId = 0;
            this._closeItemId = 0;
            this._winShowId = 0;
            this._winToggleId = 0;
            this._winDebugId = 0;

            this._buttonPressedId = this.connect('button-press-event', (actor, event) => this._onButtonPressed(actor, event));

            this._alwaysOnTopItem = new PopupMenu.PopupSwitchMenuItem(_("Always On Top"));
            this._alwaysOnTopItemId = this._alwaysOnTopItem.connect('toggled', (item, state) => this._onAlwaysOnTop(item, state));
            this._alwaysOnTopSettingsId = this._settings.connect("changed::always-on-top", (settings_, key) => this._onSettingsAlwaysOnTop(settings_, key));

            this._prefsItem = new PopupMenu.PopupMenuItem(_('Preferences'));
            this._prefsItemId = this._prefsItem.connect('activate', () => this._onOpenPreferences());
            this._closeItem = new PopupMenu.PopupMenuItem(_('Close'));
            this._closeItemId = this._closeItem.connect('activate', () => this._onCloseWindow());

            this.menu.addMenuItem(this._alwaysOnTopItem);
            this.menu.addMenuItem(this._prefsItem);
            this.menu.addMenuItem(this._closeItem);

            this._alwaysOnTopItem.setToggleState(settings.get_boolean('always-on-top'));
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
                            this._winShowId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                                dbuscall('Show');
                                return GLib.SOURCE_REMOVE;
                            });
                            return;
                        } else if (this._wm.isInCurrentWorkspace()) {
                            this._winToggleId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                                dbuscall('Toggle');
                                return GLib.SOURCE_REMOVE;
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

                        this._winDebugId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                            dbuscall('Debug');
                            this._wm.debugCheck();
                            return GLib.SOURCE_REMOVE;
                        });

                        break;
                }
            });

            return Clutter.EVENT_STOP;
        }

        _onAlwaysOnTop(item, state) {
            this._settings.set_boolean("always-on-top", state);

            if (!this._wm._win)
                return;

            if (state)
                this._wm._win.make_above();
            else this._wm._win.unmake_above();
        }

        _onSettingsAlwaysOnTop(settings_, key) {
            // Todo: Seems like an undefined behavior when menu is hidden
            // Object Gjs_ui_popupMenu_PopupMenuItem (0x56537dbca500), has been already disposed — impossible
            // to access it. This might be caused by the object having been destroyed from C code using something
            // such as destroy(), dispose(), or remove() vfuncs.
            this._alwaysOnTopItem.setToggleState(settings_.get_boolean(key));
        }

        _onOpenPreferences() {
            // Todo: Make preferences window for modifying behaviors
            console.log("Preferences under construction");
        }

        _onCloseWindow() {
            dbuscall('Close');
        }

        launchApp() {
            if (!GLib.find_program_in_path(APP_PATH)) {
                console.log("Webling app not found!");
                this.showBinaryMissingDialog(APP_PATH);
                return;
            }

            console.log("Webling launching...");
            Gio.Subprocess.new([APP_PATH], Gio.SubprocessFlags.NONE);
        }

        showBinaryMissingDialog(binaryName) {
            const missingBinaryDialog = new ModalDialog.ModalDialog({ styleClass: 'system-dialog' });
            this._missingBinaryDialog = missingBinaryDialog;

            const dialogContent = new St.BoxLayout({
                vertical: true,
                style_class: 'modal-dialog-content',
                width: 300
            });
            this._dialogContent = dialogContent;

            const messageLabel = new St.Label({
                text: `The application\n"${binaryName}"\nis not found.\n`
            });
            this._messageLabel = messageLabel;
            dialogContent.add_child(messageLabel);

            const linkButton = new St.Button({ style_class: 'modal-dialog-link', x_expand: true });
            this._linkButton = linkButton;

            const linkLabel = new St.Label({ text: 'Install from GitHub' });
            this._linkLabel = linkLabel;
            linkButton.set_child(linkLabel);

            this._linkButtonId = linkButton.connect('clicked', () => {
                Gio.AppInfo.launch_default_for_uri('https://github.com/noobaldrin/weblingbrowser', null);
            });

            dialogContent.add_child(linkButton);
            missingBinaryDialog.contentLayout.add_child(dialogContent);

            missingBinaryDialog.setButtons([
                {
                    label: 'Go to https://github.com/noobaldrin/weblingbrowser',
                    action: () => this._cleanupBinaryMissingDialog(),
                    key: Clutter.KEY_Escape
                }
            ]);

            this._missingBinaryDialogDestroyId = missingBinaryDialog.connect('destroy', () => {
                this._cleanupBinaryMissingDialog();
            });

            missingBinaryDialog.open();
        }

        _cleanupBinaryMissingDialog() {
            if (!this._missingBinaryDialog)
                return;

            if (this._missingBinaryDialogDestroyId) {
                this._missingBinaryDialog?.disconnect(this._missingBinaryDialogDestroyId);
                this._missingBinaryDialogDestroyId = null;
            }

            if (this._linkButtonId) {
                this._linkButton?.disconnect(this._linkButtonId)
                this._linkButtonId = null;
            }

            this._missingBinaryDialog?.close();

            this._linkLabel?.destroy();
            this._linkButton?.destroy();
            this._messageLabel?.destroy();
            this._dialogContent?.destroy();
            this._missingBinaryDialog?.destroy();

            this._linkLabel = null;
            this._linkButton = null;
            this._messageLabel = null;
            this._dialogContent = null;
            this._missingBinaryDialog = null;
        }

        destroy() {
            this._cleanupBinaryMissingDialog();

            if (this._closeItemId) {
                this._closeItem?.disconnect(this._closeItemId);
                this._closeItemId = null;
            }
            this._closeItem?.destroy();
            this._closeItem = null;

            if (this._prefsItemId) {
                this._prefsItem?.disconnect(this._prefsItemId);
                this._prefsItemId = null;
            }
            this._prefsItem?.destroy();
            this._prefsItem = null;

            if (this._alwaysOnTopItemId) {
                this._alwaysOnTopItem?.disconnect(this._alwaysOnTopItemId);
                this._alwaysOnTopItemId = null;
            }
            this._alwaysOnTopItem?.destroy();

            if (this._buttonPressedId) {
                this.disconnect(this._buttonPressedId);
                this._buttonPressedId = null;
            }

            if (this._winShowId) {
                GLib.Source.remove(this._winShowId);
                this._winShowId = null;
            }

            if (this._winToggleId) {
                GLib.Source.remove(this._winToggleId);
                this._winToggleId = null;
            }

            if (this._winDebugId) {
                GLib.Source.remove(this._winDebugId);
                this._winDebugId = null;
            }

            if (this._alwaysOnTopSettingsId) {
                this._settings?.disconnect(this._alwaysOnTopSettingsId);
                this._alwaysOnTopSettingsId = null;
            }
            this._settings = null;

            this._wm?.destroy();
            this._wm = null;
            super.destroy();
        }
    });