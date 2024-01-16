import { IncomingMessage } from "http";
import { Http2ServerRequest } from "http2";

export type WrappedRequest = (IncomingMessage | Http2ServerRequest) & ( {
    get host(): string
});

export const Wrapped = (req: IncomingMessage | Http2ServerRequest) => {
    const wr = req as Http2ServerRequest;
    if (typeof wr.authority === "undefined") {
        Object.defineProperty(wr, "host", {
            get: () => wr.headers[":authority"] ?? wr.headers["host"]
        });
    }
    return wr as WrappedRequest;
}