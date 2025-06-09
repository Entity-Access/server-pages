/* eslint-disable no-console */
import Inject, { ServiceProvider } from "@entity-access/entity-access/dist/di/di.js";
import Page from "./Page.js";
import Content from "./Content.js";
import RouteTree from "./core/RouteTree.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Server } from "socket.io";
import * as http from "http";
import * as http2 from "http2";
import SocketService from "./socket/SocketService.js";
import { Wrapped, WrappedResponse } from "./core/Wrapped.js";
import { SecureContext } from "node:tls";
import  AcmeCertificateService, { IAcmeOptions } from "./ssl/AcmeCertificateService.js";
import ChallengeServer from "./ssl/ChallengeServer.js";
import { SessionUser } from "./core/SessionUser.js";
import CookieService from "./services/CookieService.js";
import TokenService from "./services/TokenService.js";
import Executor from "./core/Executor.js";
import { WebSocket } from "ws";
import { UrlParser } from "./core/UrlParser.js";
import Http2IPCProxyReceiver from "./core/Http2IPCProxyReceiver.js";
import JsonGenerator from "@entity-access/entity-access/dist/common/JsonGenerator.js";
import { Readable } from "node:stream";
import SecureContextService from "./ssl/SecureContextService.js";
import AuthenticationService from "./services/AuthenticationService.js";
import TimeoutTracker from "./core/TimeoutTracker.js";
import { Http2SecureServer } from "node:http2";
import { randomUUID } from "node:crypto";

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

const sensitiveRoutes = (name: string) => name;

export default class ServerPages {

    serverID: any;


    public static create(globalServiceProvider: ServiceProvider = new ServiceProvider()) {
        const sp = globalServiceProvider.create(ServerPages);
        return sp;
    }

    public get caseInsensitiveRoutes() {
        return this.rewriteFileRoute == sensitiveRoutes;
    }

    public set caseInsensitiveRoutes(v: boolean) {
        if (v) {
            this.rewriteFileRoute = (x) => /[\[\]]/i.test(x) ? x : x.toLowerCase();
        } else {
            this.rewriteFileRoute = sensitiveRoutes;
        }
    }

    private rewriteFileRoute = sensitiveRoutes;
    private root: RouteTree = new RouteTree();

    public set logRoutes(log: (text: string) => any) {
        this.root.log = log;
    }

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
            root = root.getOrCreate(this.rewriteFileRoute(iterator));
        }
        root.register(folder, this.rewriteFileRoute);
    }

    public registerEntityRoutes(start = "/", tree = this.root) {
        this.registerRoutes(join(fileURLToPath(dirname(import.meta.url)), "./routes"), start, tree);
    }

    /**
     * All services should be registered before calling build
     * @param app Express App
     */
    public async build({
        createSocketService = true,
        port = 8080,
        protocol = "http",
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

        let listeningServer = null as http.Server | http2.Http2Server | http2.Http2SecureServer | Http2IPCProxyReceiver;

        let http1Server = null as http.Server;

        let acme = ServiceProvider.resolve(this, SecureContextService);
        acme.options = acmeOptions ?? {};

        acmeOptions ??= {};

        try {

            let httpServer = null as http.Server | http2.Http2Server | http2.Http2SecureServer;

            switch(protocol) {
                case "http":
                    httpServer = http.createServer((req, res) => isNotConnect(req) && this.process(req, res, trustProxy));
                    listeningServer = httpServer;
                    break;
                case "http2":
                    let sc = null;
                    SNICallback ??= acme.SNICallback;
                    httpServer = http2.createSecureServer({
                        SNICallback,
                        allowHTTP1,
                        keepAlive: true,
                        keepAliveInitialDelay: 5000,
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
                    // httpServer = http2.createServer({
                    //     settings: {
                    //         enableConnectProtocol: createSocketService,
                    //     }
                    // },(req, res) => isNotConnect2(req) && this.process(req, res, trustProxy))
                    // // if (!disableNoTlsWarning) {
                    // //     console.warn("Http2 without SSL should not be used in production");
                    // // }
                    // httpServer.on("connect", () => {
                    //     // undocumented and needed.
                    // });
                    // http1Server = http.createServer((req, res) => isNotConnect(req) && this.process(req, res, trustProxy));
                    // listeningServer = new HttpIPCProxyReceiver(httpServer, http1Server);

                    httpServer = http2.createSecureServer({
                        SNICallback: null,
                        allowHTTP1,
                        keepAlive: true,
                        keepAliveInitialDelay: 5000,
                        settings: {
                            enableConnectProtocol: createSocketService
                        }
                    }, (req, res) => this.process(req, res, true))

                    httpServer.on("connect", () => {
                        // undocumented and needed.
                    });
                    httpServer.on("clientError",() => {
                        // ignore
                    });
                    listeningServer = new Http2IPCProxyReceiver(httpServer as Http2SecureServer);

                    httpServer.listen(0, () => console.log(`Http2IPC Started`));

                    break;
                default:
                    throw new Error(`Unknown protocol ${protocol}`);
            }

            httpServer.on("error", console.error);
            httpServer.on("sessionError" ,console.error);

            http1Server?.on("error", console.error);
            http1Server?.on("sessionError" ,console.error);

            await new Promise<void>((resolve, reject) => {

                if (/^\d+$/.test(port as any)) {

                    listeningServer.listen({
                        port,
                        host
                    }, () => {
                        resolve();
                    });
                } else {
                    listeningServer.listen(port, () => {
                        resolve();
                    });
                }
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

    protected async process(req: any, resp1: any, trustProxy: boolean) {

        // const { method, url } = req;


        req = Wrapped.request(req);

        req.disposables.push(TimeoutTracker.create(() => `Request: ${req.url} took longer than 30 seconds`));

        req.trustProxy = trustProxy;

        const resp = Wrapped.response(req, resp1) as WrappedResponse;

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
            user.ipAddress = req.remoteIPAddress;

            const authService = scope.resolve(AuthenticationService);

            user.authorize = () => authService.authorize(user, { ip: req.remoteIPAddress, cookies: req.cookies });
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
                }, this.rewriteFileRoute)) ?? {
                    pageClass: Page,
                    childPath: path
                };
                const page = scope.create(pageClass as any) as Page;
                page.childPath = childPath;
                page.request = req;
                page.response = resp;
                page.route = route;
                page.signal = req.signal;
                scope.add(Page, page);
                const content = await Executor.run(page);
                resp.setHeader("cache-control", page.cacheControl);
                resp.removeHeader("etag");
                sent = true;
                await content.send(resp, user);
            } catch (error) {
                if(/(^Abort)|(ERR_STREAM_PREMATURE_CLOSE)/.test(error?.stack)) {
                    // we will not log this error
                    return;
                }
                if (this.serverID) {
                    console.error(`Failed: ${this.serverID}:  ${req.URL}`);
                } else {
                    console.error(`Failed: ${req.URL}`);
                }
                if (!sent) {
                    try {

                        if (acceptJson || error.errorModel) {

                            await Content.nativeJson({
                                details: error.stack ?? error,
                                ... error.errorModel ?? {},
                                message: error.message ?? error,
                            }, { status: error.errorModel?.status ?? 500}).send(resp);

                            return;
                        }

                        const content = Content.html(`<!DOCTYPE html>\n<html><body><pre>Server Error for ${req.url}\r\n${error?.stack ?? error}</pre></body></html>`,
                            { status: 500});
                        await content.send(resp);
                    } catch (e1) {
                        e1 = e1.stack ?? e1.toString();
                        console.error(e1);
                        try {
                            await resp.sendReader(500, {}, Readable.from([ e1]), true);
                        } catch {
                            // do nothing
                        }
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
