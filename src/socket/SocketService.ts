/* eslint-disable no-console */
import Inject, { RegisterSingleton, ServiceProvider, injectServiceKeysSymbol } from "@entity-access/entity-access/dist/di/di.js";
import { Http2SecureServer } from "http2";
import { Server as HttpServer } from "http";
import { Server as HttpsServer } from "https";
import { parse } from "cookie";

import { Server, Socket } from "socket.io";
import CookieService from "../services/CookieService.js";
import TokenService from "../services/TokenService.js";
import SocketNamespace, { SocketNamespaceClient } from "./SocketNamespace.js";
import { camelToChain } from "../core/camelToChain.js";
import SessionUser from "../core/SessionUser.js";

@RegisterSingleton
export default abstract class SocketService {

    @Inject
    private tokenService: TokenService;

    @Inject
    private cookieService: CookieService;

    protected server: Server;

    constructor() {
        this.server = new Server();
    }

    protected abstract namespaces(): Array<typeof SocketNamespaceClient>;

    private attach(
        server: Server): Server {

        this.server = server;
        for (const iterator of this.namespaces()) {
            this.attachNamespace(iterator);
        }
        return this.server;
    }
    private attachNamespace(iterator: typeof SocketNamespaceClient, name?) {
        if (!name) {
            name = iterator.name;
            if (name.endsWith("Namespace")) {
                name = name.substring(0, name.length - "Namespace".length);
            }
            name = camelToChain(name);
        }
        console.log(`Listening Sockets on /${name}`);
        const s = this.server.of("/" + name);
        const { tokenService, cookieService } = this;
        const sns = ServiceProvider.create(this, SocketNamespace);
        sns.namespace = name;
        sns.server = s;
        s.on("connection", (socket) => {
            socket.onAny(async (methodName, ... args: any[]) => {
                const cookies = parse(socket.request.headers.cookie);
                const cookie = cookies[tokenService.authCookieName];
                const sessionUser = await cookieService.createSessionUserFromCookie(cookie, socket.handshake.address);
                const scope = ServiceProvider.createScope(this);
                try {
                    scope.add(SessionUser, sessionUser);
                    const socketEvent = scope.create(iterator as any) as SocketNamespaceClient;
                    (socketEvent as any).socket = socket;
                    (socketEvent as any).server = s;
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

}