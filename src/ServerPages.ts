/* eslint-disable no-console */
import { ServiceProvider } from "@entity-access/entity-access/dist/di/di.js";
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
import { SessionUser } from "./core/SessionUser.js";
import Executor from "./core/Executor.js";
import { WebSocket } from "ws";
import { UrlParser } from "./core/UrlParser.js";
import Http2IPCProxyReceiver from "./core/Http2IPCProxyReceiver.js";
import { Readable } from "node:stream";
import AuthorizationService from "./services/AuthorizationService.js";
import TimeoutTracker from "./core/TimeoutTracker.js";
import { IncomingMessage, ServerResponse } from "node:http";
import sleep from "./sleep.js";
import ServerLogger from "./core/ServerLogger.js";
import { performance } from "node:perf_hooks";
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
    logger: ServerLogger;

    static enableResponseCompression = true;

    static log = void 0 as (text: string) => void;


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
        host,
        trustProxy = false,
        allowHTTP1 = true
    }:{
        createSocketService?: boolean,
        port: number,
        http1Port: number,
        trustProxy: boolean,
        disableNoTlsWarning?: boolean,
        protocol: "http" | "http2" | "http2NoTLS",
        host: string,
        SNICallback?: (servername: string, cb: (err: Error | null, ctx?: SecureContext) => void) => void,
        allowHTTP1?: boolean
    }) {

        let listeningServer = null as http.Server | http2.Http2Server | http2.Http2SecureServer | Http2IPCProxyReceiver;

        // let http1Server = null as http.Server;
        this.logger = ServiceProvider.resolve(this, ServerLogger);

        try {

            let httpServer = null as http.Server | http2.Http2Server | http2.Http2SecureServer;

            switch(protocol) {
                case "http":
                    httpServer = http.createServer({
                        keepAlive: true,
                        keepAliveInitialDelay: 15000,
                        keepAliveTimeout:60000
                    },(req, res) => isNotConnect(req) && this.process(req, res, trustProxy));
                    listeningServer = httpServer;
                    break;
                default:
                    throw new Error(`Unknown protocol ${protocol}`);
            }

            httpServer.on("error", (error: any) => this.reportError({
                url: "error",
                error
            }));
            httpServer.on("sessionError" ,(error: any) => this.reportError({
                url: "error",
                error
            }));

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

            // if (http1Server) {
            //     await new Promise<void>((resolve) => {
            //         http1Server.listen(http1Port, resolve);
            //     });
            // }

            if (createSocketService) {
                const socketServer = new Server(httpServer, {
                    
                });
                // if (http1Server) {
                //     // this is a special case
                //     // as HTTP2 without SSL does not accept HTTP1
                //     // so we are creating HTTP1 separately
                //     socketServer.attach(http1Server);
                // }
                const ss = ServiceProvider.resolve(this, SocketService as any) as SocketService;
                await (ss as any).attach(socketServer);

                socketServer.engine.on("connection_error", (err) => {
                    console.log(err.req);      // the request object
                    console.log(err.code);     // the error code, for example 1
                    console.log(err.message);  // the error message, for example "Session ID unknown"
                    console.log(err.context);  // some additional error context                    
                });
            }
            return httpServer;
        } catch (error) {
            this.reportError(error);
        }
        return null;
    }

    protected async process(rIn: IncomingMessage, resp1: ServerResponse, trustProxy: boolean) {


        const start = performance.now();
        const { log } = ServerPages;

        const prefix = `${rIn.method} ${rIn.url}`;

        log?.(`${prefix}`);

        using req = Wrapped.request(rIn);
        using resp = Wrapped.response(req, resp1) as WrappedResponse;

        resp.compress = ServerPages.enableResponseCompression;
        
        const url = rIn.url;
        if (/\%00/.test(url)) {
            await sleep(5000);
            resp.sendRedirect("https://0.0.0.0", 419);
            return;
        }

        
        req.disposables.push(TimeoutTracker.create(() => `Request: ${req.url} took longer than 30 seconds`));

        req.trustProxy = trustProxy;

        // console.log(JSON.stringify({ method, url}));

        req.response = resp;

        if((req as any).processed) {
            return;
        }
        (req as any).processed = true;

        // defaulting to no cache
        // static content delivery should override this
        resp.setHeader("cache-control", "no-cache");

        using scope = ServiceProvider.createScope(this);
        let sent = false;
        const user = scope.resolve(SessionUser);
        user.resp = resp;
        const ip = user.ipAddress = req.remoteIPAddress;
        const referrer = req.headers.referer;

        const authService = scope.resolve(AuthorizationService);

        user.authorize = () => authService.authorizeRequest(user, {
            ip: req.remoteIPAddress,
            cookies: req.cookies,
            authorization: req.headers.authorization
        });
        const acceptJson = req.accepts("json");

        const hostName = req.hostName;

        const userAgent = req.headers["user-agent"];

        let routeName = void 0;

        try {

            const root = this.getRouteTreeForHost
                ? (await this.getRouteTreeForHost(hostName)) ?? this.root
                : this.root;

            
            const path = UrlParser.parse(req.path);
            const method = req.method;
            const route = {};
            const { pageClass, childPath } = (await root.getRoute({
                scope,
                method: method.toLowerCase(),
                current: "",
                path,
                route,
                request: req
            }, this.rewriteFileRoute)) ?? {
                pageClass: Page,
                childPath: path
            };
            routeName = pageClass.name;

            log?.(`${prefix} Route Resolved ${routeName}`);

            const page = scope.create(pageClass as any) as Page;
            page.childPath = childPath;
            page.request = req;
            page.response = resp;
            page.disposables = req.disposables;
            page.route = route;
            page.signal = req.signal;
            scope.add(Page, page);

            const beforeRun = performance.now();
            const resolve = beforeRun - start;

            log?.(`${prefix} Executing`);


            const content = await Executor.run(page);
            resp.setHeader("cache-control", page.cacheControl);
            resp.removeHeader("etag");

            log?.(`${prefix} Sending`);
            const total = performance.now() - beforeRun;
            resp.setHeader("server-timing", `resolve;dur=${resolve.toFixed(2)},exec;dur=${total.toFixed(2)}`);

            sent = true;
            await content.send(resp, user);
            log?.(`${prefix} Sent`);
        } catch (error) {
            if(/(^Abort)|(ERR_STREAM_PREMATURE_CLOSE)|(ERR_STREAM_UNABLE_TO_PIPE)/.test(error?.stack)) {
                // we will not log this error
                return;
            }
            if (!sent) {
                try {

                    if (acceptJson || error.errorModel) {

                        const jsonError = await Content.nativeJson({
                            details: error.stack ?? error,
                            ... error.errorModel ?? {},
                            message: error.message ?? error,
                        }, { status: error.errorModel?.status ?? 500});
                        jsonError.suppressLog = true;
                        await jsonError.send(resp, user);
                        this.reportError({ url, error, route: routeName, info: error.errorModel, userAgent, ip, referrer });
                        return;
                    }

                    const content = Content.html(`<!DOCTYPE html>\n<html><body><pre>Server Error for ${req.url}\r\n${error?.stack ?? error}</pre></body></html>`,
                        { status: 500});
                    content.suppressLog = true;
                    await content.send(resp, user);
                    this.reportError({ url, route: routeName, error, userAgent, ip, referrer });
                } catch (e1) {
                    e1 = e1.stack ?? e1.toString();
                    this.reportError({ url, route: routeName, error: e1, userAgent, ip, referrer });
                    try {
                        await resp.sendReader(500, {}, Readable.from([ e1]));
                    } catch {
                        // do nothing
                    }
                }
                return;
            }
            this.reportError({ url, route: routeName, error, userAgent, ip, referrer });
        }

    }

    reportError({ url = void 0, error = void 0, host = void 0, route = void 0, info = void 0, userAgent = void 0, ip = void 0, referrer = void 0 }) {
        this.logger.reportError({ url, host, route, serverID: this.serverID, error, info, userAgent, ip, referrer });
    }

}
