/* eslint-disable no-console */
import { RegisterScoped, RegisterSingleton, RegisterTransient, ServiceProvider, injectServiceKeysSymbol } from "@entity-access/entity-access/dist/di/di.js";
import { Namespace, Server, Socket } from "socket.io";
import ServerPages from "../ServerPages.js";


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

export function Send(target: SocketNamespace, key) {
    const value = function(this: SocketNamespace, room, ... args: any[]) {
        return target.server?.to(room)?.emit(key, ... args);
    };
    return {
        value
    };
}

@RegisterScoped
export abstract class SocketNamespaceClient {

    protected socket: Socket;

    protected server: Namespace;

    protected room: string;

    constructor() {

    }

    abstract join(... a: any[]);

    leave() {
        return this.socket.leave(this.room);
    }
}

export default class SocketNamespace {

    public namespace: string;

    public server: Namespace;

    public send(room: string, message, ... args: any[]) {
        return this.server?.to(room)?.emit(message, ... args);
    }

}
