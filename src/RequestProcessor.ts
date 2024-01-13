/* eslint-disable no-console */
import TimedCache from "@entity-access/entity-access/dist/common/cache/TimedCache.js";
import { ServiceProvider } from "@entity-access/entity-access/dist/di/di.js";
import { Request, Response } from "express";
import { existsSync } from "fs";
import Page, { IPageContext, isPage } from "./Page.js";
import Content from "./Content.js";
import NotFoundPage from "./NotFoundPage.js";
import { join } from "path";
import SessionUser from "../server/middleware/auth/SessionUser.js";
import { globalServices } from "../globalServices.js";

// const pageCache = new TimedCache<string,[typeof Page, IPageContext]>();

export default class RequestProcessor {

    pageCache = new TimedCache<string,[typeof Page, IPageContext]>();

    constructor(private root: string) {
        if (this.root.startsWith("file:\\")) {
            this.root = this.root.substring(6);
        } else {
            if (this.root.startsWith("file:/")) {
                this.root = this.root.substring(5);
            }
        }

        console.log(`Started Routing on ${this.root}`);
    }

    public async process(req: Request, resp: Response) {

        if((req as any).processed) {
            return;
        }
        (req as any).processed = true;

        // defaulting to no cache
        // static content delivery should override this
        resp.setHeader("cache-control", "no-cache");

        using scope = globalServices.createScope();
        let sent = false;
        const acceptJson = req.accepts().some((s) => /\/json$/i.test(s));
        try {
            scope.add(SessionUser, req.user);
            const pagePath = req.path.substring(1);
            const [pageClass, pc] = await this.getPage(pagePath, req, resp);
            const page = scope.create(pageClass);
            for (const key in pc) {
                if (Object.prototype.hasOwnProperty.call(pc, key)) {
                    const element = pc[key];
                    page[key] = element;
                }
            }
            (page as any).req = req;
            const content = await page.all({ ... req.params, ... req.query, ... req.body ?? {} });
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

    private async getPage(pagePath: string, request: Request, response: Response) {
        const ac = new AbortController();
        const result = await this.pageCache.getOrCreateAsync(pagePath, async (pagePathKey) => {
            const pc = {
                currentPath: [],
                childPath: pagePathKey.split("/"),
                // notFoundPath: [],
                body: request.body,
                query: request.query,
                method: request.method,
                signal: null,
                url: request.url,
                sessionUser: request.user,
                filePath: ""
            };
            return (await this.getPageAt(this.root, pc)) ?? [NotFoundPage, pc];
        });
        const [page, c] = result;
        const signal = ac.signal;
        request.on("close", () => ac.abort());
        return [page, { ... c,
            signal,
            body: request.body,
            query: request.query,
            method: request.method,
            sessionUser: request.user,
        }] as [typeof Page, IPageContext];
    }

    private async getPageAt(
        filePath: string,
        {
            currentPath,
            childPath,
            ... a
        }: IPageContext,
    ): Promise<[typeof Page, IPageContext]> {

        let callCanHandle = false;
        if (childPath.length) {
            const [child, ... children] = childPath;
            const pageAt = await this.getPageAt(join(filePath, child), {
                ... a,
                currentPath: [ ... currentPath, child ],
                childPath: children
            });
            if (pageAt !== null) {
                return pageAt;
            }
            callCanHandle = true;
        }

        // get method name first...
        const folder = filePath;

        filePath = join(folder, a.method.toLocaleLowerCase() + ".js");
        if (!existsSync(filePath)) {
            // console.log(`${filePath} does not exist`);

            filePath = join(folder, "index.js");
            if(!existsSync(filePath)) {
                // console.log(`${filePath} does not exist`);
                return null;
            }
        }

        const imported = await import("file://" + filePath);
        const pageFunction = imported.default;
        if (!pageFunction) {
            return null;
        }
        a.filePath = filePath;
        let pageClass = pageFunction as typeof Page;
        if (!pageFunction[isPage]) {
            pageClass = class extends Page {

                async all(params: any): Promise<Content> {
                    const r = await pageFunction.call(this, params);
                    return Content.create(r);
                }
            };
        }

        if(callCanHandle) {
            if(!pageClass.canHandle({ ... a, currentPath, childPath})) {
                return null;
            }
        }

        return [pageClass, { currentPath, childPath, ... a}];
    }

}
