import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

export const BUS_NAME = 'com.github.noobaldrin.webling';
export const DBusClient = {
    call(busName, objectPath, interfaceName, methodName, parameters = null, callback = null) {
        Gio.DBus.session.call(
            busName,
            objectPath,
            interfaceName,
            methodName,
            parameters,
            null,
            Gio.DBusCallFlags.NONE,
            -1,
            null,
            (conn, res) => {
                try {
                    const result = conn.call_finish(res);
                    callback?.(null, result.deep_unpack());
                } catch (e) {
                    callback?.(e, null);
                }
            }
        );
    },

    checkNameHasOwner(busName, callback) {
        this.call(
            'org.freedesktop.DBus',
            '/org/freedesktop/DBus',
            'org.freedesktop.DBus',
            'NameHasOwner',
            GLib.Variant.new_tuple([GLib.Variant.new_string(busName)]),
            callback
        );
    }
};

export function dbuscall(method) {
    DBusClient.call(
        BUS_NAME,
        '/com/github/noobaldrin/webling',
        'com.github.noobaldrin.webling',
        method
    );
}
