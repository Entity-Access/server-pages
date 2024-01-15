/* eslint-disable no-console */
import { ServiceProvider, injectServiceKeysSymbol } from "@entity-access/entity-access/dist/di/di.js";
import { Namespace, Socket } from "socket.io";


export function Receive(target, key) {
    const method = target[key] as (socket: Socket, ... a: any) => any;
    target[key] = async function(this: SocketNamespace, ... a: any[]) {
        const types = method[injectServiceKeysSymbol] as any[];
        if (types) {
            for (let index = a.length; index < types.length; index++) {
                const element = ServiceProvider.resolve(this, types[index]);
                a.push(element);
            }
        }
        return method.apply(this, a);
    };
}

export function Send(target: typeof SocketNamespace, key) {
    const value = function(this: SocketNamespace, room, ... args: any[]) {
        return target.server?.to(room)?.emit(key, ... args);
    };
    return {
        value
    };
}

export default abstract class SocketNamespace {

    public static namespace: string;

    public static server: Namespace;

    protected room: string;

    protected socket: Socket;

    abstract join(... a: any[]);

    leave() {
        return this.socket.leave(this.room);
    }

}
