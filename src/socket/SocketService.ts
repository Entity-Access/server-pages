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
import AuthorizationService from "../services/AuthorizationService.js";
import { SessionUser } from "../core/SessionUser.js";

export default abstract class SocketService {

    @Inject
    private tokenService: TokenService;

    protected server: Server;

    constructor() {
        this.server = new Server();
    }

    protected async init() {

    }

    private async attach(
        server: Server) {

        this.server = server;

        const keys = (o) => {
            const proto = Object.getPrototypeOf(o);
            if (!proto || proto === Object || proto === Object.prototype) {
                return Object.getOwnPropertyNames(proto);
            }
            return [
                ... Object.getOwnPropertyNames(proto),
                ... keys(proto)
            ]
        }

        for (const key of [ ... Object.keys(this),... keys(this)]) {
            const element = this[key];
            if (element instanceof SocketNamespace) {
                this.attachNamespace(element);
            }
        }
        await this.init();
        return this.server;
    }

    private attachNamespace(sns: SocketNamespace, name?) {
        if (!name) {
            name = sns.constructor.name;
            if (name.endsWith("Namespace")) {
                name = name.substring(0, name.length - "Namespace".length);
            }
            name = camelToChain(name);
        }
        console.log(`Listening Sockets on /${name}`);
        const s = this.server.of("/" + name);
        (sns as any).namespace = name;
        (sns as any).server = s;
        s.on("connection", (socket) => {
            socket.onAny(async (methodName, ... args: any[]) => {
                const cookies = parse(socket.request.headers.cookie);
                const scope = ServiceProvider.createScope(this);
                const authService = ServiceProvider.resolve(this, AuthorizationService);
                try {
                    const user = scope.resolve(SessionUser);
                    const ip = socket.conn.remoteAddress;
                    await authService.authorizeRequest(user, { ip, cookies });
                    scope.add(Socket, socket);
                    const clientClass = sns.clientClass ?? SocketNamespaceClient;
                    let c = scope.resolve(clientClass, true);
                    if (!c) {
                        c = scope.create(clientClass);
                        scope.add(sns.clientClass, c);
                    }
                    (c as any).socket = socket;
                    const method = c[methodName];
                    const types = method[injectServiceKeysSymbol] as any[];
                    if (types) {
                        for (let index = args.length; index < types.length; index++) {
                            const element = scope.resolve(types[index]);
                            args.push(element);
                        }
                    }
                    await c[methodName](... args);
                } catch (error) {
                    console.error(error);
                } finally {
                    scope.dispose();
                }
            });
        });
    }

}