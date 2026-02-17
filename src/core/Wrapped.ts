import { IncomingHttpHeaders, IncomingMessage, OutgoingHttpHeaders, ServerResponse } from "http";
import { Http2ServerRequest, Http2ServerResponse } from "http2";
import { SessionUser } from "./SessionUser.js";
import { SerializeOptions, parse, serialize } from "cookie";
import { LocalFile } from "./LocalFile.js";
import { Readable, Writable } from "stream";
import { ServiceProvider } from "@entity-access/entity-access/dist/di/di.js";
import { stat } from "fs/promises";
import { CacheProperty } from "./CacheProperty.js";
import Compression from "./Compression.js";
import { remoteAddressSymbol } from "./remoteAddressSymbol.js";
import { pipeline } from "stream/promises";
import ServerLogger from "./ServerLogger.js";


type UnwrappedRequest = IncomingMessage | Http2ServerRequest;

type UnwrappedResponse = ServerResponse | Http2ServerResponse;

export interface IFormData {
    fields: { [key: string]: string};
    files: LocalFile[];
}

const extendedSymbol = Symbol("extended");

export interface IWrappedRequest extends Disposable {

    signal?: AbortSignal;

    headers?: IncomingHttpHeaders;

    disposables?: Disposable[];

    response?: WrappedResponse;

    trustProxy?: boolean;

    /** host name without port */
    get hostName(): string;

    /** host name with port if present */
    get host(): string;

    get path(): string;

    get sessionUser(): SessionUser;

    get body(): any;

    get form(): IFormData;

    get params(): any;

    get query(): { [key: string]: string};

    get queryCaseInsensitive(): { [key: string]: string};

    get cookies(): { [key: string]: string};

    get URL(): URL;

    get remoteIPAddress(): string;

    accepts(): string[];
    accepts(... types: string[]): boolean;

    get acceptEncodings(): string[];
}


export interface IWrappedResponse extends Disposable {

    request?: WrappedRequest;

    compress?: "gzip" | "deflate" | null;

    sendReader(status: number, headers: OutgoingHttpHeaders, readable: Readable, compressible: boolean): Promise<void>;

    // sendGenerator(data: Iterable<Buffer> | AsyncIterable<Buffer>, status: number, headers?: OutgoingHttpHeaders): Promise<void>;

    // send(data: Buffer | string | Blob, status?: number): Promise<void>;

    // sendStatus(status?: number, headers?: OutgoingHttpHeaders): Promise<void>;

    sendRedirect(url: string, status?: number, headers?: OutgoingHttpHeaders): void;

    cookie(name: string, value: string, options?: { secure?: boolean, httpOnly?: boolean, maxAge?: number });

    // https://github.com/phoenixinfotech1984/node-content-range
    sendFile(filePath: string, options?: {
        acceptRanges?: boolean,
        cacheControl?: string,
        maxAge?: number,
        etag?: boolean,
        immutable?: boolean,
        headers?: { [key: string]: string | string[] | number},
        lastModified?: boolean
    }): Promise<void>;

}

export type WrappedRequest = IWrappedRequest & UnwrappedRequest;

export type WrappedResponse = IWrappedResponse & UnwrappedResponse;

const extendRequest = (A: typeof IncomingMessage | typeof Http2ServerRequest) => {

    let c = A[extendedSymbol];
    if (!c) {
        c = class IntermediateRequest extends A implements IWrappedRequest{

            scope: ServiceProvider;
            disposables: Disposable[];

            trustProxy: boolean;

            signal?: AbortSignal;

            get hostName(): string {
                let host = this.host;
                const index = host.indexOf(":");
                if (index !== -1) {
                    host = host.substring(0, index);
                }
                return CacheProperty.value(this, "hostName", host);
            }

            get acceptEncodings(): string[] {
                const r = this as any as (Http2ServerRequest  | IncomingMessage);
                const acceptEncoding = r.headers["accept-encoding"]?.toString();
                if (!acceptEncoding) {
                    return [];
                }
                const encodings = acceptEncoding.split(/[\,\;]/);
                return encodings;
            }

            get host(): string {
                const r = this as any as (Http2ServerRequest  | IncomingMessage);
                const host = (r as Http2ServerRequest).authority || r.headers[":authority"] || r.headers.host || "";
                return CacheProperty.value(this, "host", host);
            }
            get path(): string {
                return this.URL.pathname;
            }
            get cookies(): { [key: string]: string; } {
                const cookie = (this as any as UnwrappedRequest).headers.cookie;
                let cookies;
                if (cookie) {
                    try {
                        cookies = parse(cookie);
                    } catch {
                        // we will ignore this.. just in case...
                    }
                }
                return CacheProperty.value(this, "cookies", cookies ?? {});
            }
            get URL(): URL {
                const r = this as any as (Http2ServerRequest  | IncomingMessage);
                let protocol = (r.socket as any).encrypted ? "https" : "http";
                const hp = r.headers["x-forwarded-proto"];
                if (hp) {
                    protocol = hp.toString() as any;
                }
                const url = new URL(r.url.replace(/\/{2,100}/g, "/"), `${protocol}://${this.host || "0.0.0.0"}`);
                return CacheProperty.value(this, "URL", url);
            }
            get remoteIPAddress(): string {
                const r = this as any as (Http2ServerRequest  | IncomingMessage);
                let ip = r.socket[remoteAddressSymbol] || r.socket.remoteAddress;
                if ((this as any).trustProxy) {
                    ip = r.socket[remoteAddressSymbol] || (r.headers["x-forwarded-for"])?.toString() || r.socket.remoteAddress
                }
                return CacheProperty.value(this, "remoteIPAddress", ip);
            }

            [Symbol.dispose]() {
                const { disposables } = this;
                if (!disposables) {
                    return;
                }
                this.disposables = null;
                if (!Array.isArray(disposables)) {
                    return;
                }
                for (const disposable of disposables) {
                    disposable?.[Symbol.dispose]();
                }
            }

            accepts(... types: string[]): any {
                const h = this as any as IncomingMessage;
                const accepts = (h.headers.accept ?? "").split(";");
                const value = (...types: string[]) => {
                    if (types.length > 0) {
                        for (const type of types) {
                            for (const iterator of accepts) {
                                if (iterator.includes(type)) {
                                    return true;
                                }
                            }
                        }
                        return false;
                    }
                    return accepts;
                };

                Object.defineProperty(this, "accepts", {
                    value,
                    enumerable: true,
                    configurable: true
                });

                return value( ... types);
            }
        
            get query(): any {
                const value = {};
                for (const [key, v] of this.URL.searchParams.entries()) {
                    value[key] = v;
                }
                return CacheProperty.value(this, "query", value);
            }

            get queryCaseInsensitive(): any {
                const value = {};
                for (const [key, v] of this.URL.searchParams.entries()) {
                    value[key.toLowerCase()] = v;
                }
                return CacheProperty.value(this, "query", new Proxy(value, {
                    get(t, p) {
                        if(typeof p === "string") {
                            return value[p.toLowerCase()];
                        }
                        return value[p];
                    }
                }));
            }
        
            get body(): any {
                throw new Error("Please decorate `Ensure.parseBody` callee or call `await Ensure.parseBody(this)` before accessing this member");                
            }
        
            get form(): any {
                throw new Error("Please decorate `Ensure.parseForm` callee or call `await Ensure.parseForm(this)` before accessing this member");        
            }
        
            get params(): any {
                throw new Error("Please decorate `Ensure.parseAll` callee or call `await Ensure.parseAll(this)` before accessing this member");        
            }
        
            get sessionUser(): any {
                throw new Error("Please decorate `Ensure.authorize` callee or call `await Ensure.authorize(this)` before accessing this member");
            }
    
        }
        A[extendedSymbol] = c;
    }
    return c;
};

const extendResponse = (A: (new() => ServerResponse) | (new () => Http2ServerResponse)) => {
    let c = A[extendedSymbol];
    if (!c) {
        c = class WrappedResponse extends A implements IWrappedResponse {

            statusCode: number;
            disposed = null;

            compress?: "gzip" | "deflate" | null;

            [Symbol.dispose](this: UnwrappedResponse) {
                if ((this as any as WrappedResponse).disposed) {
                    return true;
                }
                (this as any as WrappedResponse).disposed = true;
                return this.end();
            }

            async sendReader(this: UnwrappedResponse, status: number, headers: OutgoingHttpHeaders, readable: Readable, compressible: boolean = true) {
                const signal = (this.req as WrappedRequest).signal;
                if (compressible) {
                    const encodings = (this.req as WrappedRequest).acceptEncodings;
                    if (encodings.includes("gzip")) {
                        this.setHeader("content-encoding", "gzip");
                        readable = Compression.gzip(readable);
                    } else if (encodings.includes("deflate")) {
                        this.setHeader("content-encoding", "deflate");
                        readable = Compression.deflate(readable);
                    }
                }
                this.writeHead(status, headers);
                await pipeline(readable, this, { end: true, signal });
                return;
                // return new Promise<void>((resolve, reject) => {
                //     readable.pipe(this, { end: true })
                //         .on("finish", resolve)
                //         .on("error", reject);
                // });
                // for await(const chunk of readable.iterator()) {
                //     signal.throwIfAborted();
                //     await new Promise((resolve) => this.write(chunk, resolve));
                // }
                // await new Promise<void>((resolve) => this.end(resolve));
            }
        
            cookie(this: UnwrappedResponse, name: string, value: string, options: SerializeOptions = {}) {
                const headers = this.getHeaders();
                const cv = headers["set-cookie"];
                const cookies = Array.isArray(cv)
                    ? cv
                    : (cv ? [cv] : []);
                options.path ||= "/";
                cookies.push(serialize(name, value, options));
                this.setHeader("set-cookie",cookies);
            }

            async sendRedirect(this: UnwrappedResponse, location: string, status = 301, headers: OutgoingHttpHeaders = {}) {
                this.statusCode = status;
                headers.location = location;
                this.writeHead(this.statusCode, headers);
            }

            async sendFile(this: UnwrappedResponse, filePath: string, options?: {
                    acceptRanges?: boolean,
                    cacheControl?: string,
                    maxAge?: number,
                    etag?: boolean,
                    immutable?: boolean,
                    headers?: { [key: string]: string},
                    lastModified?: boolean
                }) {
                let sent = false;

                try {
                    /** Calculate Size of file */
                    const { size } = await stat(filePath);
                    const range = (this as any as IWrappedResponse).request.headers.range;
        
                    const lf = new LocalFile(filePath);

                    const headers = this.getHeaders();
                    const oh = options?.headers;
                    if (oh) {
                        for (const key in oh) {
                            if (Object.hasOwn(oh, key)) {
                                const element = oh[key];
                                headers[key] = element;
                            }
                        }
                    }

                    /** Check for Range header */
                    if (!range) {
                        headers["content-length"] = size;
                        this.writeHead(200, headers);
                        sent = true;
                        await lf.writeTo(this);
                        return;
                    }
        
                    /** Extracting Start and End value from Range Header */
                    let [start, end] = range.replace(/bytes=/, "").split("-") as any[];
                    start = parseInt(start, 10);
                    end = end ? parseInt(end, 10) : size - 1;
        
                    if (!isNaN(start) && isNaN(end)) {
                        start = start;
                        end = size - 1;
                    }
                    if (isNaN(start) && !isNaN(end)) {
                        start = size - end;
                        end = size - 1;
                    }
        
                    // Handle unavailable range request
                    if (start >= size || end >= size) {
                        // Return the 416 Range Not Satisfiable.
                        headers["content-range"] = `bytes */${size}`;
                        this.writeHead(416, headers);
                        sent = true;
                        return;
                    }
        
                    /** Sending Partial Content With HTTP Code 206 */
                    headers["accept-ranges"] = "bytes";
                    headers["content-range"] = `bytes ${start}-${end}/${size}`;
                    headers["content-length"] = end - start + 1;
                    this.writeHead(206, headers);
                    sent = true;
                    await lf.writeTo(this, start, end);
                    return;
                } catch (error) {
                    ServerLogger.reportError({ error });
                    if (sent) {
                        return;
                    }
                    return (this as any).send(error.stack ?? error.toString(), 500);                    
                }
    
            }
        }
    }
    return c;
}


export const Wrapped = {
    request: (req: UnwrappedRequest): WrappedRequest => {
        const { constructor } = Object.getPrototypeOf(req);
        const { prototype } = extendRequest(constructor);
        Object.setPrototypeOf(req, prototype);
        const wr = req as WrappedRequest;
        wr.disposables = [];
        const ac = new AbortController();
        wr.signal = ac.signal;
        req.once("close", () => req.complete
            ? void 0
            : ac.abort("aborted")
        );
        return req as any;
    },

    response: (req: WrappedRequest, res: UnwrappedResponse): WrappedResponse => {
        const { constructor } = Object.getPrototypeOf(res);
        const { prototype } = extendResponse(constructor);
        Object.setPrototypeOf(res, prototype);
        const wr = res as WrappedResponse;
        wr.request = req;
        req.response = wr;
        return res as any;
    }
}