import { readdirSync } from "fs";
import { join } from "path";
import Page from "../Page.js";
import SessionUser from "./SessionUser.js";
import { IRouteCheck, isPage } from "../Page.js";
import { pathToFileURL } from "url";
import Content, { IPageResult } from "../Content.js";

export interface IRouteHandler {
    get?: Promise<typeof Page>;
    post?: Promise<typeof Page>;
    put?: Promise<typeof Page>;
    patch?: Promise<typeof Page>;
    delete?: Promise<typeof Page>;
    head?: Promise<typeof Page>;
    index?: Promise<typeof Page>;
}

type IPageRoute = { default: typeof Page };

export default class RouteTree {
    
    private children = new Map<string,RouteTree>();

    private handler: IRouteHandler;

    constructor(public readonly path: string = "/") {

    }

    getOrCreate(name: string): RouteTree {
        let child = this.children.get(name);
        if (!child) {
            child = new RouteTree(this.path + name + "/");
            this.children.set(name, child);
        }
        return child;
    }

    public async getRoute(rc: IRouteCheck): Promise<{ pageClass: typeof Page, childPath: string[] }> {
        if (rc.path.length > 0) {
            const { path: [current, ... rest] } = rc;
            const childRouteCheck = { ... rc, current, path: rest };
            const childRoute = this.children.get(current);
            if (childRoute) {
                const nested = await childRoute.getRoute(childRouteCheck);
                if (nested) {
                    return nested;
                }
            }
        }

        if (!this.handler) {
            // we will not be able to handle this route
            return;
        }

        const { method } = rc;

        const pageClassPromise = this.handler[method] ?? this.handler["index"];
        if (pageClassPromise) {
            const pageClass = await pageClassPromise;
            if(pageClass.canHandle(rc)) {
                return { pageClass, childPath: rc.path };
            }
        }
    }
    
    public register(folder: string) {

        for (const iterator of readdirSync(folder, { withFileTypes: true , recursive: false})) {
            if (iterator.isDirectory()) {
                const rt = this.getOrCreate(iterator.name);
                rt.register(folder + "/" + iterator.name);
                continue;
            }

            if (!iterator.name.endsWith(".js")) {
                continue;
            }

            let name: keyof IRouteHandler;

            switch(iterator.name) {
                case "index.js":
                    name = "index";
                    break;
                case "get.js":
                    name = "get";
                    break;
                case "post.js":
                    name = "post";
                    break;
                case "put.js":
                    name = "put";
                    break;
                case "patch.js":
                    name = "patch";
                    break;
                case "head.js":
                    name = "head";
                    break;
                case "delete.js":
                    name = "delete";
                    break;
            }

            const handler = pathToFileURL(join(folder, iterator.name)).toString();
            console.log(`Registering Route ${this.path} with ${handler}`);

            const promise = (async () => {
                const { default: pageClass } = await import(handler);
                if (pageClass[isPage]) {
                    return pageClass as typeof Page;
                }
                return class extends Page {
                    async all(params: any) {
                        const r = await pageClass.call(this, params);
                        return Content.create(r);
                    }
                }
            })();

            (this.handler ??= { [name]: promise});
        }

    }

}
