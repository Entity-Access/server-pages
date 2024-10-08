/* eslint-disable no-console */
import { File } from "buffer";
import XNode from "./html/XNode.js";
import { parse } from "path";
import { LocalFile } from "./core/LocalFile.js";
import { SessionUser } from "./core/SessionUser.js";
import { WrappedResponse } from "./core/Wrapped.js";
import { OutgoingHttpHeaders } from "http";

export interface IPageResult {
    send(res: WrappedResponse, user?: SessionUser): Promise<any>;
}

export class StatusResult implements IPageResult {

    constructor(
        public readonly status,
        public readonly headers?: OutgoingHttpHeaders
    ) {

    }

    send(res: WrappedResponse, user?: SessionUser): Promise<any> {
        return res.sendStatus(this.status, this.headers);
    }

}

export class TempFileResult implements IPageResult {

    public contentDisposition: "inline" | "attachment" = "inline";
    public cacheControl = true;
    public maxAge = 2592000;
    public etag = false;
    public immutable = false;
    constructor(
        private file: LocalFile,
        {
            contentDisposition = "inline",
            cacheControl = true,
            maxAge = 2592000,
            etag = false,
            immutable = false
        }: Partial<TempFileResult> = {}
    ) {
        this.contentDisposition = contentDisposition;
        this.cacheControl = cacheControl;
        this.maxAge = maxAge;
        this.etag = etag;
        this.immutable = immutable;
    }

    send(res: WrappedResponse) {
        res.setHeader("content-disposition", `${this.contentDisposition};filename=${encodeURIComponent(this.file.fileName)}`);
        return res.sendFile(this.file.path,{
            headers: {
                "content-type": this.file.contentType
            },
            acceptRanges: true,
            cacheControl: this.cacheControl,
            maxAge: this.maxAge,
            etag: this.etag,
            immutable: this.immutable,
            lastModified: false
        });
    }

}

export class FileResult implements IPageResult {

    public contentDisposition: "inline" | "attachment" = "inline";
    public cacheControl = true;
    public maxAge = 2592000;
    public etag = false;
    public immutable = false;
    private fileName;
    constructor(
        private filePath: string,
        {
            contentDisposition = "inline",
            cacheControl = true,
            maxAge = 2592000,
            etag = false,
            immutable = false
        }: Partial<FileResult> = {}
    ) {
        this.contentDisposition = contentDisposition;
        this.cacheControl = cacheControl;
        this.maxAge = maxAge;
        this.etag = etag;
        this.immutable = immutable;
        const parsed = parse(filePath);
        this.fileName = parsed.base;
    }

    send(res: WrappedResponse) {
    
        res.setHeader("content-disposition", `${this.contentDisposition};filename=${encodeURIComponent(this.fileName)}`);
        return res.sendFile(this.filePath,{
            acceptRanges: true,
            cacheControl: this.cacheControl,
            maxAge: this.maxAge,
            etag: this.etag,
            immutable: this.immutable
        });
    }

}

export class Redirect implements IPageResult {

    constructor(public location: string, public status = 301, public headers = void 0 as OutgoingHttpHeaders) {

    }

    async send(res: WrappedResponse) {
        return res.sendRedirect(this.location, this.status, this.headers);
    }

}

export default class Content implements IPageResult {

    public static json(json: any, status = 200) {
        return new Content({
            body: JSON.stringify(json),
            contentType: "application/json",
            status,
            compress: "gzip"
        });
    }

    public static html(html, status = 200) {
        return new Content({
            body: html,
            contentType: "text/html",
            status,
            compress: "gzip"
        });
    }

    public static create(
        body: Partial<Content>
    ) {
        return new Content(body);
    }


    public status: number;

    public contentType: string;

    public suppressLog: boolean;

    public body: string | Buffer | XNode;

    public headers: OutgoingHttpHeaders;

    public compress: "gzip" | "deflate" | null = null;

    private constructor(p: Partial<Content>) {
        Object.setPrototypeOf(p, Content.prototype);
        p.contentType ??= "text/plain";
        p.status ??= 200;
        if (p.body === void 0) {
            throw new Error(`Body cannot be undefined`);
        }
        return p as Content;
    }

    public async send(res: WrappedResponse, user?: SessionUser) {
        const { status, body, contentType } = this;
        const { headers } = this;
        if (headers) {
            for (const key in headers) {
                if (Object.hasOwn(headers, key)) {
                    const element = headers[key];
                    res.setHeader(key, element);
                }
            }
        }

        res.compress = this.compress;

        res.setHeader("content-type", contentType);
        res.statusCode = status;
        if (typeof body === "string") {
            if (status >= 300 && !this.suppressLog) {
                const u = user ? `User: ${user.userID},${user.userName}` : "User: Anonymous";
                console.error(`${res.req.method} ${res.req.url}\n${status}\n${u}\n${body}`);
            } else {
                res.compress ||= "gzip";
            }
            res.send(body);
            return;
        }
        if (body instanceof XNode) {
            const text = body.render();
            if (status >= 300 && !this.suppressLog) {
                console.error(`${res.req.method} ${res.req.url}\n${status}\n${text}`);
            } else {
                res.compress ||= "gzip";
            }
            res.send(text);
            return;
        }
        if (status >= 300 && !this.suppressLog) {
            console.error(`${res.req.method} ${res.req.url}\n${status}\nBINARY DATA`);
        }
        res.send(body);
        return;
    }

}
