import { readdirSync } from "fs";
import { join } from "path";
import Page from "../Page.js";
import { IRouteCheck, isPage } from "../Page.js";
import { pathToFileURL } from "url";
import Content from "../Content.js";
import { prepareSymbol } from "../decorators/Prepare.js";

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


function escapeRegex(string) {
    return string.replace(/[/\-\\^$*+?.()|[\]{}]/g, '\\$&');
}

export default class RouteTree {
    
    private children = new Map<string,RouteTree>();

    private regexChild: { regex: RegExp , name: string, paramName: string, route: RouteTree};

    private handler: IRouteHandler;

    constructor(public readonly path: string = "/") {

    }

    getOrCreate(name: string): RouteTree {

        // if it has [ ]

        const extractParams = /([^\[]+)?(\[[^\]]+\])(.+)?/.exec(name);
        if (extractParams) {
            if (this.regexChild) {
                if (this.regexChild.name !== name) {
                    throw new Error("Multiple parameters not supported in same folder");
                }
                return this.regexChild.route;
            }
            const [text, prefix, paramName, suffix] = extractParams;
            const route = new RouteTree(this.path + name + "/");
            const tokens = [];

            if (prefix) {
                tokens.push(escapeRegex(prefix));
            }
            tokens.push("(.+)")
            if (suffix) {
                tokens.push("(?=" + escapeRegex(suffix) + ")")
            }

            this.regexChild = {
                name,
                paramName: paramName.substring(1, paramName.length-1),
                regex: new RegExp(tokens.join("")),
                route
            };
            return route;
        }

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

            const { regexChild } = this;

            if (regexChild) {
                const m = regexChild.regex.exec(current);
                if (m?.length) {
                    const value = m[1];
                    rc.route[regexChild.paramName] = value;
                    return regexChild.route.getRoute(childRouteCheck);
                }
            }
        }

        if (!this.handler) {
            // we will not be able to handle this route
            return;
        }

        const { method } = rc;

        const pageClassPromise = (this.handler[method] ??= this.handler[method.toLowerCase()]) ?? this.handler["index"];
        if (pageClassPromise) {
            const pageClass = await pageClassPromise;
            if(await pageClass.canHandle(rc)) {
                return { pageClass, childPath: rc.path };
            }
        }
    }
    
    public register(folder: string, log?:(text: string) => any) {

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
            log?.(`Registering Route ${this.path} with ${handler}`);

            const promise = (async () => {
                const { default: pageClass } = await import(handler);
                if (!pageClass) {
                    return class extends Page {
                        run() {
                            return this.notFound();
                        }
                    };
                }
                if (pageClass[isPage]) {
                    return pageClass as typeof Page;
                }
                const c = class extends Page {

                    [prepareSymbol] = pageClass[prepareSymbol];

                    async run() {
                        const r = await pageClass.call(this);
                        return Content.create(r);
                    }
                }
                return c;
            })();

            (this.handler ??= {})[name] = promise;
        }

    }

}
