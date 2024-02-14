/* eslint-disable no-console */
import { RegisterSingleton, ServiceProvider } from "@entity-access/entity-access/dist/di/di.js";
import Page from "./Page.js";
import Content from "./Content.js";
import RouteTree from "./core/RouteTree.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Server } from "socket.io";
import * as http from "http";
import * as http2 from "http2";
import SocketService from "./socket/SocketService.js";
import { Wrapped } from "./core/Wrapped.js";
import { SecureContext } from "node:tls";
import  AcmeCertificateService, { IAcmeOptions } from "./ssl/AcmeCertificateService.js";
import ChallengeServer from "./ssl/ChallengeServer.js";
import { SessionUser } from "./core/SessionUser.js";
import CookieService from "./services/CookieService.js";
import TokenService from "./services/TokenService.js";
import Executor from "./core/Executor.js";
import { WebSocket } from "ws";

RegisterSingleton
export default class ServerPages {

    public static create(globalServiceProvider: ServiceProvider = new ServiceProvider()) {
        const sp = globalServiceProvider.create(ServerPages);
        return sp;
    }

    private root: RouteTree = new RouteTree();

    /**
     * We will register all sub folders starting with given path.
     * @param folder string
     * @param start string
     */
    public registerRoutes(folder: string, start: string = "/") {
        const startRoute = start.split("/").filter((x) => x);
        let root = this.root;
        for (const iterator of startRoute) {
            root = root.getOrCreate(iterator);
        }
        root.register(folder);
    }

    public registerEntityRoutes() {
        this.registerRoutes(join(fileURLToPath(dirname(import.meta.url)), "./routes"))
    }

    /**
     * All services should be registered before calling build
     * @param app Express App
     */
    public async build({
        createSocketService = true,
        port = 8080,
        protocol = "http",
        disableNoTlsWarning = false,
        SNICallback,
        acmeOptions,
        host,
        allowHTTP1 = true
    }:{
        createSocketService?: boolean,
        port: number,
        disableNoTlsWarning?: boolean,
        protocol: "http" | "http2" | "http2NoTLS",
        host: string,
        SNICallback?: (servername: string, cb: (err: Error | null, ctx?: SecureContext) => void) => void,
        acmeOptions?: IAcmeOptions,
        allowHTTP1?: boolean
    }) {
        try {

            let httpServer = null as http.Server | http2.Http2Server | http2.Http2SecureServer;

            switch(protocol) {
                case "http":
                    httpServer = http.createServer((req, res) => this.process(req, res))
                    break;
                case "http2":
                    let sc = null;
                    SNICallback ??= (name, cb) => {
                        if (host) {
                            if (name !== host) {
                                name = host;
                            }
                        }
                        const acme = ServiceProvider.resolve(this, AcmeCertificateService);
                        acme.getSecureContext({ ... ( acmeOptions ?? {}),  host: name }).then((v) => {
                            cb(null, v);
                        },cb);
                    };
                    httpServer = http2.createSecureServer({
                        SNICallback,
                        allowHTTP1,
                        settings: {
                            enableConnectProtocol: createSocketService
                        }
                    }, (req, res) => req.method !== "CONNECT" && this.process(req, res))

                    if (acmeOptions) {
                        const cs = ServiceProvider.resolve(this, ChallengeServer);
                        cs.start();
                    }

                    break;
                default:
                    httpServer = http2.createSecureServer({
                        allowHTTP1,
                        settings: {
                            enableConnectProtocol: createSocketService
                        }
                    },(req, res) => this.process(req, res))
                    if (!disableNoTlsWarning) {
                        console.warn("Http2 without SSL should not be used in production");
                    }
                    break;
            }


            await new Promise<void>((resolve, reject) => {
                const server = httpServer.listen(port, () => {
                    resolve();
                });
            });

            if (createSocketService) {
                const socketServer = new Server(httpServer);
                const ss = ServiceProvider.resolve(this, SocketService as any) as SocketService;
                await (ss as any).attach(socketServer);

                if (protocol === "http2" || protocol === "http2NoTLS") {
                    httpServer.prependListener("stream", (stream, headers) => {
                        if (headers[":method"] === "CONNECT") {
                            try {
                                
                                // this keeps socket alive...
                                stream.setTimeout(0);
                                (stream as any).setKeepAlive?.(true, 0);
                                (stream as any).setNoDelay = function() {
                                    // this will keep the stream open
                                };
                                // const websocket = new WebSocket(null, void 0, {
                                //     headers
                                // });
                                // websocket.setSocket(stream, Buffer.alloc(0), {
                                //     maxPayload: 104857600,
                                //     skipUTF8Validation: false,
                                // });
                                const path = headers[":path"];
                                const url = new URL(path, "http://a");
                                const _query = {};
                                for (const [key, value] of url.searchParams.entries()) {
                                    _query[key] = value;
                                }
                                // fake build request
                                const req = {
                                    url: path,
                                    headers,
//                                     websocket,
                                    _query
                                };
                                // (socketServer.engine as any)
                                //     .onWebSocket(req, stream, websocket);
                                stream.respond({
                                    ":status": 200
                                });
                                (socketServer.engine as any)
                                    .handleUpgrade(req, stream, headers);
                                // stream.respond({
                                //     ":status": 200
                                // });
                            } catch (error) {
                                console.error(error);
                            }
                        }
                    });
                }
            }

            return httpServer;
        } catch (error) {
            console.error(error);
        }
        return null;
    }

    protected async process(req: any, resp: any) {

        // const { method, url } = req;

        req = Wrapped.request(req);
        resp = Wrapped.response(req, resp);

        // console.log(JSON.stringify({ method, url}));

        req.response = resp;

        if((req as any).processed) {
            return;
        }
        (req as any).processed = true;

        try {

            // defaulting to no cache
            // static content delivery should override this
            resp.setHeader("cache-control", "no-cache");

            using scope = ServiceProvider.createScope(this);
            let sent = false;
            const user = scope.resolve(SessionUser);
            user.resp = resp;
            user.authorize = async () => {
                const cookieService = scope.resolve(CookieService);
                const tokenService = scope.resolve(TokenService);
                const cookie = req.cookies[tokenService.authCookieName];
                await cookieService.createSessionUserFromCookie(cookie, req.remoteIPAddress);
                (user as any).isAuthorized = true;
            };
            const acceptJson = req.accepts("json");


            try {
                const path = req.path.split("/").filter((x) => x);
                const method = req.method;
                const { pageClass, childPath } = (await this.root.getRoute({
                    scope,
                    method,
                    current: "",
                    path,
                    request: req
                })) ?? {
                    pageClass: Page,
                    childPath: path
                };
                const page = scope.create(pageClass as any) as Page;
                page.childPath = childPath;
                page.request = req;
                page.response = resp;
                const content = await Executor.run(page);
                resp.setHeader("cache-control", page.cacheControl);
                resp.removeHeader("etag");
                sent = true;
                await content.send(resp);
            } catch (error) {
                console.error(`Failed: ${req.url}`);
                if (!sent) {
                    try {

                        if (acceptJson || error.errorModel) {
                            await Content.json(
                                    {
                                        ... error.errorModel ?? {},
                                        message: error.message ?? error,
                                        detail: error.stack ?? error,
                                    }
                            , 500).send(resp);
                            return;
                        }

                        const content = Content.html(`<!DOCTYPE html>\n<html><body><pre>Server Error for ${req.url}\r\n${error?.stack ?? error}</pre></body></html>`, 500);
                        await content.send(resp);
                    } catch (e1) {
                        e1 = e1.stack ?? e1.toString();
                        resp.send(e1, 500);
                        console.error(e1);
                    }
                    return;
                }
                console.error(error.stack ?? error.toString());
            }
        } finally {
            if(Array.isArray(req.disposables)) {
                for (const iterator of req.disposables) {
                    iterator[Symbol.dispose]?.();
                }
            }
        }
    }

}
