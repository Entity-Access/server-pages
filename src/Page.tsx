import busboy from "busboy";
import HtmlDocument from "./html/HtmlDocument.js";
import XNode from "./html/XNode.js";
import Content, { IPageResult, Redirect } from "./Content.js";
import { LocalFile } from "./core/LocalFile.js";
import TempFolder from "./core/TempFolder.js";
import SessionUser from "./core/SessionUser.js";
import { WrappedRequest, WrappedResponse } from "./core/Wrapped.js";
import { ServiceProvider } from "@entity-access/entity-access/dist/di/di.js";

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
export default class Page {

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

    get params() {
        return this.request?.query;
    }

    signal: AbortSignal;

    currentPath: string[];

    childPath: string[];

    /**
     * List of all paths that were tried before executing this page.
     */
    notFoundPath: string[];

    query: any;

    body: any;

    url: string;

    // request: Request;

    // response: Response;

    method: string;

    sessionUser: SessionUser;

    filePath: string;

    cacheControl: string;

    disposables: Disposable[] = [];

    private formDataPromise: Promise<IFormData>;

    constructor() {
        this.cacheControl = "no-cache, no-store, max-age=0";
    }

    all(params: any): IPageResult | Promise<IPageResult> {
        return this.notFound();
    }

    readFormData(): Promise<IFormData> {

        return this.formDataPromise ??= (async () => {
            let tempFolder: TempFolder;
            const result: IFormData = {
                fields: {},
                files: []
            };
            const req = this.request;
            const bb = busboy({ headers: req.headers , defParamCharset: "utf8" });
            const tasks = [];
            await new Promise((resolve, reject) => {

                bb.on("field", (name, value) => {
                    result.fields[name] = value;
                });

                bb.on("file", (name, file, info) => {
                    if(!tempFolder) {
                        tempFolder = new TempFolder();
                        this.disposables.push(tempFolder);
                    }
                    const tf = tempFolder.get(info.filename, info.mimeType);
                    tasks.push(tf.writeAll(file).then(() => {
                        result.files.push(tf);
                    }));
                });
                bb.on("error", reject);
                bb.on("close", resolve);
                req.pipe(bb);
            });
            await Promise.all(tasks);
            return result;
        })();
    }


    protected content(body: string, status = 200, contentType = "text/html") {
        return Content.create({ body, status, contentType });
    }

    protected json(o: any, indent = 0) {
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
