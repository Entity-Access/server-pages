import { IncomingMessage } from "http";
import { Http2ServerRequest } from "http2";
import SessionUser from "./SessionUser.js";

export type WrappedRequest = (IncomingMessage | Http2ServerRequest) & ( {
    get host(): string;

    get sessionUser(): Promise<SessionUser>;

    get query(): { [key: string]: string};

    get cookies(): { [key: string]: string};

});

const methods = {
    host() {
        return this.headers[":authority"] ?? this.headers["host"];
    },
    query(this: WrappedRequest) {
        const u = new URL(this.url, "http://nowhere.com");
        const items = {};
        for (const [key, value] of u.searchParams.entries()) {
            items[key] = value;
        }
        return items;
    },
    cookies(this: WrappedRequest) {
        const cookie = this.headers.cookie;
        
    },
    sessionUser(this: WrappedRequest) {

    }
};

export const Wrapped = (req: IncomingMessage | Http2ServerRequest) => {
    for (const key in methods) {
        if (Object.prototype.hasOwnProperty.call(methods, key)) {
            const element = methods[key];
            Object.defineProperty(req, key, {
                get() {
                    Object.defineProperty(this, key, { value: element(), enumerable: true, writable: false });
                },
                enumerable: true,
                configurable: true
            });
        }
    }
    return req as WrappedRequest;
}