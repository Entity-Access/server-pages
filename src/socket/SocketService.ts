/* eslint-disable no-console */
import Inject, { RegisterSingleton, ServiceProvider, injectServiceKeysSymbol } from "@entity-access/entity-access/dist/di/di.js";
import { Http2SecureServer } from "http2";
import { Server as HttpServer } from "http";
import { Server as HttpsServer } from "https";
import { parse } from "cookie";

import { Server, Socket } from "socket.io";
import CookieService from "../services/CookieService.js";
import TokenService from "../services/TokenService.js";
import SocketNamespace from "./SocketNamespace.js";
import { camelToChain } from "../core/camelToChain.js";

export default abstract class SocketService {

    @Inject
    private tokenService: TokenService;

    protected server: Server;

    constructor() {
        this.server = new Server();
    }

    protected async init() {

    }

    private attach(
        server: Server): Server {

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
        const { tokenService } = this;
        s.on("connection", (socket) => {
            socket.onAny(async (methodName, ... args: any[]) => {
                const cookies = parse(socket.request.headers.cookie);
                const scope = ServiceProvider.createScope(this);
                try {
                    const cookieService = scope.resolve(CookieService);
                    const cookie = cookies[tokenService.authCookieName];
                    await cookieService.createSessionUserFromCookie(cookie, socket.handshake.address);
                    scope.add(Socket, socket);
                    const method = sns[methodName];
                    const types = method[injectServiceKeysSymbol] as any[];
                    if (types) {
                        for (let index = args.length; index < types.length; index++) {
                            const element = scope.resolve(types[index]);
                            args.push(element);
                        }
                    }
                    await sns[methodName](... args);
                } catch (error) {
                    console.error(error);
                } finally {
                    scope.dispose();
                }
            });
        });
    }

}