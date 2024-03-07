import busboy from "busboy";
import HtmlDocument from "./html/HtmlDocument.js";
import XNode from "./html/XNode.js";
import Content, { IPageResult, Redirect } from "./Content.js";
import { LocalFile } from "./core/LocalFile.js";
import { WrappedRequest, WrappedResponse } from "./core/Wrapped.js";
import { ServiceProvider } from "@entity-access/entity-access/dist/di/di.js";
import { IClassOf } from "@entity-access/entity-access/dist/decorators/IClassOf.js";
import { OutgoingHttpHeaders } from "http";

export const isPage = Symbol("isPage");


export interface IRouteCheck {
    scope: ServiceProvider;
    method: string;
    current: string;
    path: string[];
    request: WrappedRequest;
}

export interface IFormData {
    fields: { [key: string]: string};
    files: LocalFile[];
}

/**
 * Page should not contain any reference to underlying request/response objects.
 */
export default abstract class Page {

    static [isPage] = true;

    
    /**
     * This static method determines if the path can be handled by this page or not.
     * @param pageContext page related items
     * @returns true if it can handle the path, default is true
     */
    static canHandle(pageContext: IRouteCheck) : boolean | Promise<boolean> {
        return true;
    }

    request: WrappedRequest;

    response: WrappedResponse;

    get query(): any {
        return this.request?.query;
    }

    get body(): any {
        return this.request?.body;
    }

    get form() {
        return this.request?.form;
    }

    get sessionUser() {
        return this.request?.sessionUser;
    }

    get url() {
        return this.request?.URL.toString();
    }

    get method() {
        return this.request?.method;
    }

    get headers() {
        return this.request?.headers;
    }

    signal: AbortSignal;

    currentPath: string[];

    childPath: string[];

    filePath: string;

    cacheControl: string;

    disposables: Disposable[] = [];

    private formDataPromise: Promise<IFormData>;

    constructor() {
        this.cacheControl = "no-cache, no-store, max-age=0";
    }

    abstract run(): IPageResult | Promise<IPageResult>;

    resolve<T>(c: IClassOf<T>): T {
        return ServiceProvider.resolve(this, c);
    }

    reportError(error) {
        console.error(error);
    }

    protected content(h: Partial<Content>): Content;
    protected content(body: string, status?: number, contentType?: string, headers?: OutgoingHttpHeaders): Content;
    protected content(body: string | Partial<Content>, status?: number, contentType?: string, headers?: OutgoingHttpHeaders) {
        if (typeof body !== "object") {
            return body = { body, status, contentType, headers};
        }
        body.status ??= 200;
        body.contentType ??= "text/html";
        return Content.create(body);
    }

    protected json(o: any, indent = 0, headers = void 0 as OutgoingHttpHeaders) {
        const content = indent
            ? JSON.stringify(o, undefined, indent)
            : JSON.stringify(o);
        return this.content(content, 200, "application/json");
    }

    protected redirect(location: string) {
        return new Redirect(location);
    }

    protected notFound(): Content | Promise<Content> {
        return Content.html(<HtmlDocument>
                <head>
                    <title>Not found</title>
                </head>
                <body>
                    The page you are looking for is not found.
                    <pre>{this.url} not found</pre>
                </body>
            </HtmlDocument>,
            404
        );
    }

    protected serverError(error, status = 500): Content | Promise<Content> {
        return Content.create({
            body: <HtmlDocument>
                    <head>
                        <title>Server Error</title>
                    </head>
                    <body>
                        There was an error processing you request.
                        <pre>{error.stack ?? error}</pre>
                    </body>
                </HtmlDocument>,
            status
        });
    }
}
