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
import SessionUser from "./core/SessionUser.js";
import CookieService from "./services/CookieService.js";
import TokenService from "./services/TokenService.js";

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
        host
    }:{
        createSocketService?: boolean,
        port: number,
        disableNoTlsWarning?: boolean,
        protocol: "http" | "http2" | "http2NoTLS",
        host: string,
        SNICallback?: (servername: string, cb: (err: Error | null, ctx?: SecureContext) => void) => void,
        acmeOptions?: IAcmeOptions
    }) {
        try {

            let httpServer = null as http.Server | http2.Http2Server | http2.Http2SecureServer;

            let socketServer = null as Server;
            if (createSocketService) {
                socketServer = new Server();
                const ss = ServiceProvider.resolve(this, SocketService as any) as SocketService;
                (ss as any).attach(socketServer);
                await (ss as any).init();
            }

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
                        SNICallback
                    }, (req, res) => this.process(req, res))

                    if (acmeOptions) {
                        const cs = ServiceProvider.resolve(this, ChallengeServer);
                        cs.start();
                    }

                    break;
                case "http2NoTLS":
                    httpServer = http2.createSecureServer({
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
                socketServer?.attach(server);
            });
            return httpServer;
        } catch (error) {
            console.error(error);
        }
        return null;
    }

    protected async process(req: any, resp: any) {

        req = Wrapped.request(req);
        resp = Wrapped.response(req, resp);

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
                await cookieService.createSessionUserFromCookie(tokenService.authCookieName, req.remoteIPAddress);
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
                const page = scope.create(pageClass);
                page.childPath = childPath;
                page.request = req;
                page.response = resp;
                const content = await page.all();
                resp.setHeader("cache-control", page.cacheControl);
                resp.removeHeader("etag");
                sent = true;
                await content.send(resp);
            } catch (error) {
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
                        resp.send(e1.stack ?? e1, 500);
                        console.error(e1);
                    }
                    return;
                }
                console.error(error);
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
