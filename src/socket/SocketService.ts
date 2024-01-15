/* eslint-disable no-console */
import Inject, { RegisterSingleton } from "@entity-access/entity-access/dist/di/di.js";
import { Http2SecureServer } from "http2";
import { Server as HttpServer } from "http";
import { Server as HttpsServer } from "https";
import { parse } from "cookie";

import { Server, Socket } from "socket.io";
import CookieService from "../services/CookieService.js";
import TokenService from "../services/TokenService.js";

@RegisterSingleton
export default class SocketService {

    @Inject
    private tokenService: TokenService;

    @Inject
    private cookieService: CookieService;

    private server: Server;

    constructor() {
        this.server = new Server();
    }

    attach(server: Http2SecureServer | HttpsServer | HttpServer): Server {

        this.server.attach(server);

        return this.server;
    }

}