/* eslint-disable no-console */
import { ServiceProvider, injectServiceKeysSymbol } from "@entity-access/entity-access/dist/di/di.js";
import { Namespace, Socket } from "socket.io";
import { IClassOf } from "@entity-access/entity-access/dist/decorators/IClassOf.js";


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
        try {
            const socketRoom = this.server.to(room);
            if (!socketRoom) {
                console.error(`No room for ${room}`);
            }
            return socketRoom.emit(key, ... args);
        } catch (error) {
            console.error(error);
        }
    };
    return {
        value
    };
}

export class SocketNamespaceClient {

    protected socket: Socket;

    join(room, ... a: any[]) {
        return this.socket.join(room);
    }

    leave(room) {
        return this.socket.leave(room);
    }

}

export default abstract class SocketNamespace {

    protected namespace: string;

    protected server: Namespace;

    abstract get clientClass(): IClassOf<SocketNamespaceClient>;

    constructor() {

    }
}
