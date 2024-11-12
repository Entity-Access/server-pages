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
import { Wrapped, WrappedRequest } from "./core/Wrapped.js";
import { SecureContext } from "node:tls";
import  AcmeCertificateService, { IAcmeOptions } from "./ssl/AcmeCertificateService.js";
import ChallengeServer from "./ssl/ChallengeServer.js";
import { SessionUser } from "./core/SessionUser.js";
import CookieService from "./services/CookieService.js";
import TokenService from "./services/TokenService.js";
import Executor from "./core/Executor.js";
import { WebSocket } from "ws";
import { UrlParser } from "./core/UrlParser.js";
import { createConnection } from "node:net";
import HttpIPCProxyReceiver from "./core/HttpIPCProxyReceiver.js";

export const wsData = Symbol("wsData");

const isNotConnect = (req: http.IncomingMessage) => {
    return !(/^connect/i.test(req.method)
        || /^websocket/i.test(req.headers["upgrade"])
        || /^upgrade/i.test(req.headers["connection"]?.toString()))
};


const isNotConnect2 = (req: http2.Http2ServerRequest) => {
    return !(/^connect/i.test(req.method)
        || /^connect/i.test(req.headers[":method"])
        || /^upgrade/i.test(req.headers["connection"]))
};
export default class ServerPages {

    public static create(globalServiceProvider: ServiceProvider = new ServiceProvider()) {
        const sp = globalServiceProvider.create(ServerPages);
        return sp;
    }

    private root: RouteTree = new RouteTree();

    /**
     * Cache routeTree based on host to improve performance
     */
    public getRouteTreeForHost: (host: string) => Promise<RouteTree>;

    /**
     * We will register all sub folders starting with given path.
     * @param folder string
     * @param start string
     */
    public registerRoutes(folder: string, start: string = "/", root = this.root) {
        const startRoute = start.split("/").filter((x) => x);
        for (const iterator of startRoute) {
            root = root.getOrCreate(iterator);
        }
        root.register(folder);
    }

    public registerEntityRoutes(start = "/", tree = this.root) {
        this.registerRoutes(join(fileURLToPath(dirname(import.meta.url)), "./routes"), start, tree)
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
        trustProxy = false,
        allowHTTP1 = true
    }:{
        createSocketService?: boolean,
        port: number,
        trustProxy: boolean,
        disableNoTlsWarning?: boolean,
        protocol: "http" | "http2" | "http2NoTLS",
        host: string,
        SNICallback?: (servername: string, cb: (err: Error | null, ctx?: SecureContext) => void) => void,
        acmeOptions?: IAcmeOptions,
        allowHTTP1?: boolean
    }) {

        let listeningServer = null as http.Server | http2.Http2Server | http2.Http2SecureServer | HttpIPCProxyReceiver;

        let http1Server = null as http.Server;

        try {

            let httpServer = null as http.Server | http2.Http2Server | http2.Http2SecureServer;

            switch(protocol) {
                case "http":
                    httpServer = http.createServer((req, res) => isNotConnect(req) && this.process(req, res, trustProxy));
                    listeningServer = httpServer;
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
                    }, (req, res) => this.process(req, res, trustProxy))

                    if (acmeOptions) {
                        const cs = ServiceProvider.resolve(this, ChallengeServer);
                        cs.start();
                    }
                    httpServer.on("connect", () => {
                        // undocumented and needed.
                    });
                    listeningServer = httpServer;
                    break;
                case "http2NoTLS":
                    httpServer = http2.createServer({
                        settings: {
                            enableConnectProtocol: createSocketService
                        }
                    },(req, res) => isNotConnect2(req) && this.process(req, res, trustProxy))
                    // if (!disableNoTlsWarning) {
                    //     console.warn("Http2 without SSL should not be used in production");
                    // }
                    httpServer.on("connect", () => {
                        // undocumented and needed.
                    });
                    http1Server = http.createServer((req, res) => isNotConnect(req) && this.process(req, res, trustProxy));
                    listeningServer = new HttpIPCProxyReceiver(httpServer, http1Server);
                    break;
                default:
                    throw new Error(`Unknown protocol ${protocol}`);
            }


            await new Promise<void>((resolve, reject) => {
                listeningServer.listen(port, () => {
                    resolve();
                });
            });

            if (createSocketService) {
                const socketServer = new Server(httpServer, {
                    
                });
                if (http1Server) {
                    // this is a special case
                    // as HTTP2 without SSL does not accept HTTP1
                    // so we are creating HTTP1 separately
                    socketServer.attach(http1Server);
                }
                const ss = ServiceProvider.resolve(this, SocketService as any) as SocketService;
                await (ss as any).attach(socketServer);

                socketServer.engine.on("connection_error", (err) => {
                    console.log(err.req);      // the request object
                    console.log(err.code);     // the error code, for example 1
                    console.log(err.message);  // the error message, for example "Session ID unknown"
                    console.log(err.context);  // some additional error context                    
                });

                if (protocol === "http2" || protocol === "http2NoTLS") {
                    httpServer.prependListener("stream", (stream, headers) => this.forwardConnect(socketServer, stream, headers));
                }
            }

            return httpServer;
        } catch (error) {
            console.error(error);
        }
        return null;
    }

    private async forwardConnect(socketServer, stream: http2.ServerHttp2Stream, headers: http2.IncomingHttpHeaders) {
        if (headers[":method"] !== "CONNECT") {
            return;
        }
        try {
            
            // this keeps socket alive...
            stream.setTimeout(0);
            (stream as any).setKeepAlive?.(true, 0);
            (stream as any).setNoDelay = function() {
                // this will keep the stream open
            };
            const websocket = new WebSocket(null, void 0, {
                headers
            });

            websocket.setSocket(stream, Buffer.alloc(0), {
                maxPayload: 104857600,
                skipUTF8Validation: false,
                allowSynchronousEvents: false,
                handshakeTimeout: 5000
            });
            const path = headers[":path"];
            const url = new URL(path, `http://${headers[":authority"] ?? headers.host}`);
            const _query = {};
            for (const [key, value] of url.searchParams.entries()) {
                _query[key] = value;
            }
            // forcing upgrade
            headers["upgrade"] = "websocket";
            headers["connection"] = "upgrade";
            // fake build request
            const req = {
                url: path,
                method: "GET",
                headers,
                websocket,
                connection: {
                    encrypted: true
                },
                _query
            };
            // (socketServer.engine as any)
            //     .onWebSocket(req, stream, websocket);
            stream.respond({ ":status": 200 }, { endStream: false });
            // (socketServer.engine as any)
            //     .handleUpgrade(req, stream, Buffer.from([]));
            // (socketServer.engine as any)
            //     .onWebSocket(req, stream, websocket);
            (socketServer.engine as any)
                .handshake("websocket", req, () => {
                    try { stream.end(); } catch {}
                });
            // stream.respond({
            //     ":status": 200
            // });
        } catch (error) {
            console.error(error);
        }
    }

    protected async process(req: any, resp: any, trustProxy: boolean) {

        // const { method, url } = req;

        req = Wrapped.request(req);

        req.trustProxy = trustProxy;

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

            const hostName = req.hostName;


            try {

                const root = this.getRouteTreeForHost
                    ? (await this.getRouteTreeForHost(hostName)) ?? this.root
                    : this.root;

                
                const path = UrlParser.parse(req.path);
                const method = req.method;
                const route = {};
                const { pageClass, childPath } = (await root.getRoute({
                    scope,
                    method,
                    current: "",
                    path,
                    route,
                    request: req
                })) ?? {
                    pageClass: Page,
                    childPath: path
                };
                const page = scope.create(pageClass as any) as Page;
                page.childPath = childPath;
                page.request = req;
                page.response = resp;
                page.route = route;
                scope.add(Page, page);
                const content = await Executor.run(page);
                resp.setHeader("cache-control", page.cacheControl);
                resp.removeHeader("etag");
                sent = true;
                await content.send(resp, user);
            } catch (error) {
                console.error(`Failed: ${req.URL}`);
                if (!sent) {
                    try {

                        if (acceptJson || error.errorModel) {
                            await Content.json(
                                    {
                                        details: error.stack ?? error,
                                        ... error.errorModel ?? {},
                                        message: error.message ?? error,
                                    }
                            , error.errorModel?.status ?? 500).send(resp);
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
