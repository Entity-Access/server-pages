/* eslint-disable no-console */
import { RegisterSingleton, ServiceProvider } from "@entity-access/entity-access/dist/di/di.js";
import express, { Request, Response } from "express";
import Page from "./Page.js";
import Content from "./Content.js";
import SessionUser from "./core/SessionUser.js";
import RouteTree from "./core/RouteTree.js";
import CookieService from "./services/CookieService.js";
import cookieParser from "cookie-parser";
import bodyParser from "body-parser";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Server, Socket } from "socket.io";
import { SocketNamespaceClient } from "./socket/SocketNamespace.js";
import SocketService from "./socket/SocketService.js";

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
    public build(app = express(), createSocketService = true) {
        try {
            const cookieService = ServiceProvider.resolve(this, CookieService);

            // etag must be set by individual request processors if needed.
            app.set("etag", false);

            app.use(cookieParser());
            app.use((req, res, next) => cookieService.createSessionUser(req, res).then(next, next));

            app.use(bodyParser.json());

            let socketServer = null as Server;
            if (createSocketService) {
                socketServer = new Server();
                socketServer.attachApp(app);
                const ss = ServiceProvider.resolve(this, SocketService as any) as SocketService;
                (ss as any).attach(socketServer);
            }
            app.all(/./, (req, res, next) => this.process(req, res).then(next, next));
            return app;
        } catch (error) {
            console.error(error);
        }
        return null;
    }

    protected async process(req: Request, resp: Response) {

        if((req as any).processed) {
            return;
        }
        (req as any).processed = true;

        // defaulting to no cache
        // static content delivery should override this
        resp.setHeader("cache-control", "no-cache");

        using scope = ServiceProvider.createScope(this);
        let sent = false;
        const acceptJson = req.accepts().some((s) => /\/json$/i.test(s));
        try {
            const sessionUser = (req as any).user;
            scope.add(SessionUser, sessionUser);
            const path = req.path.substring(1).split("/");
            const method = req.method;
            const params = { ... req.params, ... req.query, ... req.body ?? {} };
            const { pageClass, childPath } = (await this.root.getRoute({
                method,
                current: "",
                path,
                params,
                sessionUser
            })) ?? {
                pageClass: Page,
                childPath: path
            };
            const page = scope.create(pageClass);
            page.method = method;
            page.childPath = childPath;
            page.body = req.body;
            page.query = req.query;
            page.sessionUser = sessionUser;
            (page as any).req = req;
            (page as any).res = resp;
            const content = await page.all(params);
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
                    resp.send(e1.stack ?? e1);
                    console.error(e1);
                }
                return;
            }
            console.error(error);
        }
    }

}
