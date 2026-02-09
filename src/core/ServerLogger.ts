import { RegisterSingleton } from "@entity-access/entity-access/dist/di/di.js";

@RegisterSingleton
export default class ServerLogger {

    static error = (error) => ServerLogger.reportError({ error });

    static reportError({ url = void 0, serverID = void 0, host = void 0, route = void 0, error = void 0, info = void 0, ip = void 0, referrer = void 0, userAgent = void 0, status = void 0}) {
        const { instance } = ServerLogger;
        if (instance) {
            return instance.reportError({ url, status, serverID, route, host, error, info, ip, referrer, userAgent });
        }
        const cause = error.cause?.stack ?? error.cause?.toString();
        const at = (function getStack() {
            const obj = { stack : void 0};
            if ("captureStackTrace" in Error) {
                Error.captureStackTrace(obj, getStack); // Exclude getStack from the trace
            }
            return obj.stack;
        })();
        console.error(JSON.stringify({ url, status, serverID, host, route, error, cause, info, ip, referrer, userAgent, at }));
    }

    private static instance: ServerLogger;

    constructor() {
        ServerLogger.instance = this;
    }

    reportError({ url, serverID = void 0, host = void 0, route = void 0, error = void 0, info = void 0, userAgent = void 0, referrer = void 0, ip = void 0, status = void 0}) {

        // we will ignore stream closure errors
        if (/(ERR_STREAM_PREMATURE_CLOSE)|(ERR_STREAM_UNABLE_TO_PIPE)/.test(error)) {
            return;
        }

        const cause = error.cause?.stack ?? error.cause?.toString();
        const at = (function getStack() {
            const obj = { stack : void 0};
            if ("captureStackTrace" in Error) {
                Error.captureStackTrace(obj, getStack); // Exclude getStack from the trace
            }
            return obj.stack;
        })();
        console.error(JSON.stringify({
            serverID,
            url,
            host,
            route,
            status,
            userAgent,
            referrer,
            ip,
            error: error.stack ?? error.toString(),
            cause,
            info,
            at,
        }));
    }

}