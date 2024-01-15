/* eslint-disable no-console */
import Inject, { ServiceProvider, injectServiceKeysSymbol } from "@entity-access/entity-access/dist/di/di.js";
import type SocketService from "./SocketService.js";
import { parse } from "cookie";
import { Namespace, Server, Socket } from "socket.io";
import { camelToChain } from "../core/camelToChain.js";
import TokenService from "../services/TokenService.js";
import CookieService from "../services/CookieService.js";
import SessionUser from "../core/SessionUser.js";


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

    public static server: Namespace;

    public static attach(server: Server, name?: string) {
        if (!name) {
            name = this.name;
            if (name.endsWith("Namespace")) {
                name = name.substring(0, name.length - "Namespace".length);
            }
            name = camelToChain(name);
        }
        console.log(`Listening Sockets on /${name}`);
        const s = server.of("/" + name);
        this.server = s;
        const tokenService = ServiceProvider.resolve(this,TokenService);
        const cookieService = ServiceProvider.resolve(this, CookieService);
        s.on("connection", (socket) => {
            socket.onAny(async (methodName, ... args: any[]) => {
                const cookies = parse(socket.request.headers.cookie);
                const cookie = cookies[tokenService.authCookieName];
                const sessionUser = await cookieService.createSessionUserFromCookie(cookie, socket.handshake.address);
                const scope = ServiceProvider.createScope(this);
                try {
                    scope.add(SessionUser, sessionUser);
                    const socketEvent = scope.create(this as any);
                    (socketEvent as any).socket = socket;
                    const method = socketEvent[methodName];
                    const types = method[injectServiceKeysSymbol] as any[];
                    if (types) {
                        for (let index = args.length; index < types.length; index++) {
                            const element = scope.resolve(types[index]);
                            args.push(element);
                        }
                    }
                    await socketEvent[methodName](... args);
                } catch (error) {
                    console.error(error);
                } finally {
                    scope.dispose();
                }
            });
        });
    }

    protected room: string;

    protected socket: Socket;

    abstract join(... a: any[]);

    leave() {
        return this.socket.leave(this.room);
    }

}
