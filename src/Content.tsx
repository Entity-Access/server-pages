/* eslint-disable no-console */
import { File } from "buffer";
import XNode from "./html/XNode.js";
import { parse } from "path";
import { LocalFile } from "./core/LocalFile.js";
import { SessionUser } from "./core/SessionUser.js";
import { WrappedResponse } from "./core/Wrapped.js";
import { OutgoingHttpHeaders } from "http";
import { Readable } from "stream";
import Utf8Readable from "./core/Utf8Readable.js";
import LogReadable from "./core/LogReadable.js";

const EmptyReader = () => Readable.from([]);

export interface IContent {
    body?: string | Buffer | XNode;
    status?: number;
    contentType?: string;
    headers?: OutgoingHttpHeaders;
    suppressLog?: boolean;
    compress?: boolean;
}

export default class Content {

    public readonly reader: Readable;
    public readonly status: number = 200;
    public readonly contentType: string = "plain/text";
    public readonly headers: OutgoingHttpHeaders;

    public readonly compress: boolean;

    public suppressLog: boolean;

    constructor(
        p: Partial<Content>
    ) {
        Object.setPrototypeOf(p, new.target.prototype);
        (p as any).status ??= 200;
        (p as any).compress ??= true;
        if (p.contentType) {
            const headers = ((p as any).headers ??= {}) as OutgoingHttpHeaders;
            headers["content-type"] = p.contentType;
        }
        return p as Content;
    }

    send(res: WrappedResponse, user?: SessionUser): Promise<any> {
        let reader = this.reader;
        if (this.status >= 400 && !this.suppressLog) {
            console.error(`${res.req.method} ${res.req.url}\n${this.status}-User-${user?.userID}`);
            reader = LogReadable.from(reader, console.error);
        }
        return res.sendReader(this.status, this.headers, reader, this.compress);
    }

    static readable(readable: Readable, { status = 200, headers = void 0 as OutgoingHttpHeaders }) {
        return new Content({
            reader: readable,
            status,
            headers
        });
    }


    static html(text: string | Iterable<string> | XNode, {
        status = 200,
        headers = void 0 as OutgoingHttpHeaders,
        contentType = "text/html" as string,
        compress = true,
        suppressLog = false
    } = {}) {
        return this.text(text, {
            status,
            contentType,
            headers,
            compress,
            suppressLog
        })
    }

    static create(p: IContent)
    {
        return this.text(p.body, p);
    }

    /**
     * Do not use this to serialize large objects
     * @param m model
     * @returns string
     */
    static nativeJson(m, { status = 200, headers = void 0 as OutgoingHttpHeaders } = {}) {
        return this.text(JSON.stringify(m), { status, headers, contentType: "application/json"});
    }

    static text(
        text: string | Buffer | Iterable<string> | XNode,
        {
            status = 200,
            headers = void 0 as OutgoingHttpHeaders,
            contentType = void 0 as string,
            compress = true,
            suppressLog = false
        } = {
        }) {

        let reader: Readable;

        contentType ??= "text/plain";
        if (!contentType.includes(":")) {
            contentType += "; charset=utf8";
        }

        if (typeof text === "string") {
            reader = Readable.from([ Buffer.from(text, "utf8") ]);
        } else if (text instanceof XNode) {
            reader = Utf8Readable.from(text.readable());
        } else if (text instanceof Buffer) {
            reader = Readable.from([ text]);
        } else {
            reader = Utf8Readable.from(text);
        }

        return new Content({
            reader,
            status,
            headers,
            contentType,
            compress,
            suppressLog
        });
    }
}

export class StatusResult extends Content {
    constructor(status, headers: OutgoingHttpHeaders) {
        super({ reader: null, status, headers });
    }

    send(res: WrappedResponse, user?: SessionUser): Promise<any> {
        res.writeHead(this.status, this.headers);
        return res.asyncEnd();
    }
}

export class FileResult extends Content {

    public contentDisposition: "inline" | "attachment" = "inline";
    // public cacheControl = "none";
    public maxAge = 2592000;
    public etag = false;
    public immutable = false;
    public headers = void 0 as OutgoingHttpHeaders;
    protected lastModified = false;
    public fileName;
    constructor(
        private filePath: string,
        {
            contentDisposition = "inline",
//             cacheControl = "none",
            maxAge = 2592000,
            etag = false,
            immutable = false,
            fileName,
            headers
        }: Partial<FileResult> = {}
    ) {
        super({});
        this.contentDisposition = contentDisposition;
        // this.cacheControl = cacheControl;
        this.maxAge = maxAge;
        this.etag = etag;
        this.immutable = immutable;
        this.headers = headers ?? {};
        const parsed = parse(filePath);
        this.fileName = fileName || parsed.base;
    }

    send(res: WrappedResponse) {    
        this.headers["content-disposition"] = `${this.contentDisposition};filename=${encodeURIComponent(this.fileName)}`
        // if (this.cacheControl) {
        //     this.headers["cache-control"] = this.cacheControl;
        // }
        return res.sendFile(this.filePath,{
            acceptRanges: true,
            // cacheControl: this.cacheControl,
            maxAge: this.maxAge,
            etag: this.etag,
            immutable: this.immutable,
            headers: this.headers,
            lastModified: this.lastModified
        });
    }

}

export class TempFileResult extends FileResult {

    constructor(
        file: LocalFile, p: Partial<TempFileResult> = {}
    ) {
        super(file.path, p.fileName ? p : (p.fileName = file.fileName, (p.headers ??={})["content-type"] = file.contentType, p));
        this.lastModified = false;
    }

}



export class Redirect extends Content {

    constructor(public location: string, status = 301, headers = void 0 as OutgoingHttpHeaders) {
        super({ status, headers });
    }


    async send(res: WrappedResponse) {
        return res.sendRedirect(this.location, this.status, this.headers);
    }

}

// export default class Content extends PageResult {

//     // public static json(json: any, status = 200) {
//     //     return new Content({
//     //         body: JSON.stringify(json),
//     //         contentType: "application/json",
//     //         status,
//     //         compress: "gzip"
//     //     });
//     // }

//     // public static html(html, status = 200) {
//     //     return new Content({
//     //         body: html,
//     //         contentType: "text/html",
//     //         status,
//     //         compress: "gzip"
//     //     });
//     // }

//     public static create(
//         body: Partial<Content>
//     ) {
//         return new Content(body);
//     }


//     public status: number;

//     public contentType: string;

//     public suppressLog: boolean;

//     public body: string | Buffer | XNode;

//     public headers: OutgoingHttpHeaders;

//     public compress: "gzip" | "deflate" | null = null;

//     private constructor(p: Partial<Content>) {
//         super();
//         Object.setPrototypeOf(p, Content.prototype);
//         p.contentType ??= "text/plain";
//         p.status ??= 200;
//         if (p.body === void 0) {
//             throw new Error(`Body cannot be undefined`);
//         }
//         return p as Content;
//     }

//     public async send(res: WrappedResponse, user?: SessionUser) {
//         const { status, body, contentType } = this;
//         const { headers } = this;
//         if (headers) {
//             for (const key in headers) {
//                 if (Object.hasOwn(headers, key)) {
//                     const element = headers[key];
//                     res.setHeader(key, element);
//                 }
//             }
//         }

//         res.compress = this.compress;

//         res.setHeader("content-type", contentType);
//         res.statusCode = status;
//         if (typeof body === "string") {
//             if (status >= 300 && !this.suppressLog) {
//                 const u = user ? `User: ${user.userID},${user.userName}` : "User: Anonymous";
//                 console.error(`${res.req.method} ${res.req.url}\n${status}\n${u}\n${body}`);
//             } else {
//                 res.compress ||= "gzip";
//             }
//             res.sendReader(status, headers, Readable.from([  body ]));
//             return;
//         }
//         if (body instanceof XNode) {
//             const text = body.render();
//             if (status >= 300 && !this.suppressLog) {
//                 console.error(`${res.req.method} ${res.req.url}\n${status}\n${text}`);
//             } else {
//                 res.compress ||= "gzip";
//             }
//             res.send(text);
//             return;
//         }
//         if (status >= 300 && !this.suppressLog) {
//             console.error(`${res.req.method} ${res.req.url}\n${status}\nBINARY DATA`);
//         }
//         res.send(body);
//         return;
//     }

// }
