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


type UnwrappedRequest = IncomingMessage | Http2ServerRequest;

export interface IFormData {
    fields: { [key: string]: string};
    files: LocalFile[];
}

export interface IWrappedRequest {

    get host(): string;

    get path(): string;

    get asyncSessionUser(): Promise<SessionUser>;

    get asyncJsonBody(): Promise<any>;

    get asyncForm(): Promise<IFormData>;

    get query(): { [key: string]: string};

    get cookies(): { [key: string]: string};

    get URL(): URL;

    get remoteIPAddress(): string;

    accepts(): string[];
    accepts(... types: string[]): boolean;
}

export interface IWrappedResponse {

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

export type WrappedRequest = UnwrappedRequest & IWrappedRequest & {
    scope: ServiceProvider;
    response: WrappedResponse;
    disposables: Disposable[];
};

type UnwrappedResponse = ServerResponse | Http2ServerResponse;

export type WrappedResponse = UnwrappedResponse & IWrappedResponse & {
    request: WrappedRequest
};

const requestMethods: { [P in keyof IWrappedRequest]: (this: WrappedRequest) => any} = {
    remoteIPAddress(this: UnwrappedRequest) {
        return this.socket?.remoteAddress;
    },

    accepts(this: UnwrappedRequest) {
        const accepts = (this.headers.accept ?? "").split(";");
        return (...types: string[]) => {
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
    },

    URL(this: UnwrappedRequest) {
        const w = this as WrappedRequest;
        return new URL(this.url, `http://${w.host}`);
    },

    path(this: WrappedRequest) {
        return this.URL.pathname;
    },

    host(this: UnwrappedRequest) {
        return this.headers[":authority"] ?? this.headers["host"];
    },
    query(this: WrappedRequest) {
        const u = this.URL;
        const items = {};
        for (const [key, value] of u.searchParams.entries()) {
            items[key] = value;
        }
        return items;
    },
    cookies(this: UnwrappedRequest) {
        const cookie = this.headers.cookie;
        const cookies = parse(cookie);
        return cookies;
    },

    async asyncJsonBody(this: WrappedRequest) {
        const req = this;
        let buffer = null as Buffer;
        let encoding = this.headers["content-encoding"] ?? "utf-8";
        const contentType = this.headers["content-type"];
        if (!/\/json/i.test(contentType)) {
            return {};
        }
        await new Promise<void>((resolve, reject) => {
            req.pipe(new Writable({
                write(chunk, enc, callback) {
                    encoding ||= enc;
                    let b = typeof chunk === "string"
                        ? Buffer.from(chunk)
                        : chunk as Buffer;
                    buffer = buffer
                        ? Buffer.concat([buffer, b])
                        : b;
                    callback();
                },
                final(callback) {
                    resolve();
                    callback();
                },
            }), { end: true });
        });
        const text = buffer.toString(encoding as any);
        return JSON.parse(text);
    },

    async asyncSessionUser(this: WrappedRequest) {
        try {
            const cookieService = this.scope.resolve(CookieService);
            const cookie = this.cookies[cookieService.cookieName];
            const sessionUser = await cookieService.createSessionUserFromCookie(cookie, this.remoteIPAddress, this.response);
            return sessionUser;
        } catch (error) {
            console.error(error);
            return new SessionUser(null, null, null);
        }
    },

    async asyncForm(this: WrappedRequest) {
        let tempFolder: TempFolder;
        const result: IFormData = {
            fields: {},
            files: []
        };
        const req = this;
        const bb = busboy({ headers: req.headers, defParamCharset: "utf8" });
        const tasks = [];
        await new Promise((resolve, reject) => {

            bb.on("field", (name, value) => {
                result.fields[name] = value;
            });

            bb.on("file", (name, file, info) => {
                if (!tempFolder) {
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
    }
};

const responseMethods: { [P in keyof IWrappedResponse]: (this: WrappedResponse) => any} = {

    asyncEnd() {
        return () => new Promise<void>((resolve) => this.end(resolve));
    },

    asyncWrite() {
        return (buffer: Buffer, start?: number, length?: number) => {
            return new Promise((resolve) => 
                this.write(buffer, resolve)
            );
        };
    },

    cookie() {
        return (name: string, value: string, options = {}) => {
            const cv = this.getHeaders()["set-cookie"];
            const cookies = Array.isArray(cv) ? cv : [cv];
            const nk = cookies.filter((x) => x.startsWith(name + "="));
            nk.push(serialize(name, value, options));
            this.setHeader("set-cookie", nk);
        }
    },

    send(this: WrappedResponse) {
        return async (data: Buffer | string, status: number = 200) => {
            try {
                this.statusCode = status;
                this.writeHead(this.statusCode, this.getHeaders());
                await new Promise<void>((resolve, reject) => {
                    this.write(data, (error) => error ? reject(error) : resolve());
                });
                return this.asyncEnd();
            } catch (error) {
                console.error(error);
            }
        };
    },
    sendRedirect() {
        return (location: string, permanent = false) => {
            this.statusCode = 301;
            this.writeHead(this.statusCode, {
                location
            });
            return this.asyncEnd();
        }
    },
    sendFile() {
        return async (filePath: string, options?: {
            acceptRanges?: boolean,
            cacheControl?: boolean,
            maxAge?: number,
            etag?: boolean,
            immutable?: boolean,
            headers?: { [key: string]: string},
            lastModified?: boolean
        }) => {
             /** Calculate Size of file */
            const { size } = await stat(filePath);
            const range = this.request.headers.range;

            const lf = new LocalFile(filePath);

            /** Check for Range header */
            if (!range) {
                this.writeHead(200, {
                    "Content-Length": size,
                    "Content-Type": "video/mp4"
                });

                await lf.writeTo(this);

                return this.asyncEnd();
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
                return this.asyncEnd();
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
    },
};

export const Wrapped = {
    request: (req: UnwrappedRequest) => {
        for (const key in requestMethods) {
            if (Object.prototype.hasOwnProperty.call(requestMethods, key)) {
                const element = requestMethods[key];
                Object.defineProperty(req, key, {
                    get() {
                        const value = element.call(this);
                        Object.defineProperty(this, key, { value, enumerable: true, writable: false });
                        return value;
                    },
                    enumerable: true,
                    configurable: true
                });
            }
        }
        const wr = req as WrappedRequest;
        wr.disposables = [];
        return wr;
    },

    response: (req: WrappedRequest, res: UnwrappedResponse) => {
        for (const key in responseMethods) {
            if (Object.prototype.hasOwnProperty.call(responseMethods, key)) {
                const element = responseMethods[key];
                Object.defineProperty(res, key, {
                    get() {
                        const value = element.call(this);
                        Object.defineProperty(this, key, { value, enumerable: true, writable: false });
                        return value;
                    },
                    enumerable: true,
                    configurable: true
                });
            }
        }
        const wr = res as WrappedResponse;
        wr.request = req;
        req.response = wr;
        return wr;
    }
}