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
import ServerLogger from "./core/ServerLogger.js";

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
        //@ts-expect-error readonly
        const headers = p.headers = p.headers ? { ... p.headers } : {};
        if (p.contentType) {
            headers["content-type"] = p.contentType;
        }
        return p as Content;
    }

    send(res: WrappedResponse, user?: SessionUser): Promise<any> {
        let reader = this.reader;
        if (this.status >= 400 && !this.suppressLog) {
            reader = LogReadable.from(reader, (error) => ServerLogger.reportError({ error }));
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
            contentType += "; charset=utf-8";
        }

        if (typeof text === "string") {
            reader = Readable.from([ Buffer.from(text, "utf-8") ]);
        } else if (text instanceof XNode) {
            reader = Utf8Readable.from(text.readable());
        } else if (text instanceof Buffer) {
            reader = Readable.from([ text]);
        } else {
            reader = Utf8Readable.from(text as Iterable<string>);
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
        return Promise.resolve();
    }
}

export class FileResult extends Content {

    public contentDisposition: "inline" | "attachment" = "inline";
    // public cacheControl = "none";
    public maxAge = 2592000;
    public etag = false;
    public immutable = false;
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
            headers,
            contentType
        }: Partial<FileResult> = {}
    ) {
        super({ contentType, headers });
        // @ts-expect-error readonly
        this.headers ??= {};
        this.contentDisposition = contentDisposition;
        // this.cacheControl = cacheControl;
        this.maxAge = maxAge;
        this.etag = etag;
        this.immutable = immutable;
        const parsed = parse(filePath);
        this.fileName = fileName || parsed.base;
    }

    send(res: WrappedResponse) {    
        this.headers["content-disposition"] = `${this.contentDisposition};filename=${encodeURIComponent(this.fileName)}`
        // if (this.cacheControl) {
        //     this.headers["cache-control"] = this.cacheControl;
        // }
        if (this.contentType) {
            this.headers["content-type"] ??= this.contentType;
        }
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
        super(
            file.path,
            { ... p, contentType: p.contentType ?? file.contentType});
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
