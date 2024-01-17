import busboy from "busboy";
import { IncomingMessage, OutgoingMessage, ServerResponse } from "http";
import { Http2ServerRequest, Http2ServerResponse } from "http2";
import SessionUser from "./SessionUser.js";
import { parse, serialize } from "cookie";
import TempFolder from "./TempFolder.js";
import { LocalFile } from "./LocalFile.js";
import { Writable } from "stream";
import { ServiceProvider } from "@entity-access/entity-access/dist/di/di.js";
import CookieService from "../services/CookieService.js";
import { stat } from "fs/promises";
import TokenService from "../services/TokenService.js";
import { CacheProperty } from "./CacheProperty.js";


type UnwrappedRequest = IncomingMessage | Http2ServerRequest;

type UnwrappedResponse = ServerResponse | Http2ServerResponse;

export interface IFormData {
    fields: { [key: string]: string};
    files: LocalFile[];
}

const extendedSymbol = Symbol("extended");

export interface IWrappedRequest {

    headers?: any;

    disposables?: Disposable[];

    response?: WrappedResponse;

    get host(): string;

    get path(): string;

    get sessionUser(): SessionUser;

    get body(): any;

    get form(): IFormData;

    get params(): any;

    get query(): { [key: string]: string};

    get cookies(): { [key: string]: string};

    get URL(): URL;

    get remoteIPAddress(): string;

    accepts(): string[];
    accepts(... types: string[]): boolean;
}


export interface IWrappedResponse {

    request?: WrappedRequest;

    asyncEnd();

    asyncWrite(buffer: Buffer): Promise<void>;

    send(data: Buffer | string | Blob, status?: number): Promise<void>;

    sendRedirect(url: string, permanent?: boolean): void;

    cookie(name: string, value: string, options?: { secure?: boolean, httpOnly?: boolean, maxAge?: number });

    // https://github.com/phoenixinfotech1984/node-content-range
    sendFile(filePath: string, options?: {
        acceptRanges?: boolean,
        cacheControl?: boolean,
        maxAge?: number,
        etag?: boolean,
        immutable?: boolean,
        headers?: { [key: string]: string},
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

            get host(): string {
                const r = this as any as (Http2ServerRequest  | IncomingMessage);
                const host = (r as Http2ServerRequest).authority || r.headers[":authority"] || r.headers.host || null;
                return CacheProperty.value(this, "host", host);
            }
            get path(): string {
                return this.URL.pathname;
            }
            get cookies(): { [key: string]: string; } {
                const cookie = (this as any as UnwrappedRequest).headers.cookie;
                const cookies = parse(cookie);
                return CacheProperty.value(this, "cookies", cookies);
            }
            get URL(): URL {
                const r = this as any as (Http2ServerRequest  | IncomingMessage);
                const url = new URL(r.url, `https:${this.host}`);
                return CacheProperty.value(this, "URL", url);
            }
            get remoteIPAddress(): string {
                const r = this as any as (Http2ServerRequest  | IncomingMessage);
                return CacheProperty.value(this, "remoteIPAddress", r.socket.remoteAddress);
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
                throw new Error("Please decorate `Ensure.parseQuery` callee or call `await Ensure.parseQuery(this)` before accessing this member");                        
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

const extendResponse = (A: typeof ServerResponse | typeof Http2ServerResponse) => {
    let c = A[extendedSymbol];
    if (!c) {
        c = class WrappedResponse extends A implements IWrappedResponse {

            statusCode: number;

            asyncEnd(this: UnwrappedResponse) {
                return new Promise<void>((resolve) => this.end(resolve));
            }
        
            asyncWrite(this: UnwrappedResponse, buffer: Buffer, start?: number, length?: number) {
                return new Promise<void>((resolve, reject) => 
                    this.write(buffer, (error) => error ? reject(error) : resolve())
                );        
            }
        
            cookie(this: UnwrappedResponse, name: string, value: string, options = {}) {
                const cv = this.getHeaders()["set-cookie"];
                const cookies = Array.isArray(cv) ? cv : [cv];
                const nk = cookies.filter((x) => !x.startsWith(name + "="));
                nk.push(serialize(name, value, options));
                this.setHeader("set-cookie", nk);
            }
        
            async send(this: UnwrappedResponse, data: Buffer | string, status: number = 200) {
                try {
                    const wrapped = (this as any as WrappedResponse);
                    wrapped.statusCode = status;
                    this.writeHead(wrapped.statusCode, this.getHeaders());
                    await new Promise<void>((resolve, reject) => {
                        this.write(data, (error) => error ? reject(error) : resolve());
                    });
                    return (this as any).asyncEnd();
                } catch (error) {
                    console.error(error);
                }
            }

            async sendRedirect(this: UnwrappedResponse, location: string, permanent = false) {
                this.statusCode = 301;
                this.writeHead(this.statusCode, {
                    location
                });
                return (this as any as IWrappedResponse).asyncEnd();
            }

            async sendFile(this: UnwrappedResponse, filePath: string, options?: {
                    acceptRanges?: boolean,
                    cacheControl?: boolean,
                    maxAge?: number,
                    etag?: boolean,
                    immutable?: boolean,
                    headers?: { [key: string]: string},
                    lastModified?: boolean
                }) {
                    /** Calculate Size of file */
                const { size } = await stat(filePath);
                const range = (this as any as IWrappedResponse).request.headers.range;
    
                const lf = new LocalFile(filePath);
    
                /** Check for Range header */
                if (!range) {
                    this.writeHead(200, {
                        "Content-Length": size,
                        "Content-Type": "video/mp4"
                    });
    
                    await lf.writeTo(this);
    
                    return (this as any).asyncEnd();
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
                    this.writeHead(416, {
                        "Content-Range": `bytes */${size}`
                    });
                    return (this as any).asyncEnd();
                }
    
                /** Sending Partial Content With HTTP Code 206 */
                this.writeHead(206, {
                    "Content-Range": `bytes ${start}-${end}/${size}`,
                    "Accept-Ranges": "bytes",
                    "Content-Length": end - start + 1,
                    "Content-Type": "video/mp4"
                });
    
                await lf.writeTo(this, start, end);
    
            }
        }
    }
    return c;
}


export const Wrapped = {
    request: (req: UnwrappedRequest) => {
        let prototype = Object.getPrototypeOf(req);
        const { constructor } = prototype;
        prototype = extendRequest(constructor);
        Object.setPrototypeOf(req, prototype);
        const wr = req as WrappedRequest;
        wr.disposables = [];
        return req;
    },

    response: (req: WrappedRequest, res: UnwrappedResponse) => {
        let prototype = Object.getPrototypeOf(res);
        const { constructor } = prototype;
        prototype = extendResponse(constructor);
        Object.setPrototypeOf(res, prototype);
        const wr = res as WrappedResponse;
        wr.request = req;
        req.response = wr;
        return res;
    }
}