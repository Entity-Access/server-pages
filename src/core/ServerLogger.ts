import { RegisterSingleton } from "@entity-access/entity-access/dist/di/di.js";

@RegisterSingleton
export default class ServerLogger {

    static error = (error) => ServerLogger.reportError({ error });

    static reportError({ url = void 0, serverID = void 0, error = void 0, info = void 0}) {
        const { instance } = ServerLogger;
        if (instance) {
            return instance.reportError({ url, serverID, error, info });
        }
        const cause = error.cause?.stack ?? error.cause?.toString();
        console.error(JSON.stringify({ url, serverID, error, cause, info }));
    }

    private static instance: ServerLogger;

    constructor() {
        ServerLogger.instance = this;
    }

    reportError({ url, serverID = void 0, error = void 0, info = void 0, userAgent = void 0, ip = void 0}) {
        const cause = error.cause?.stack ?? error.cause?.toString();
        const at = (function getStack() {
            const obj = { stack : void 0};
            if ("captureStackTrace" in Error) {
                Error.captureStackTrace(obj, getStack); // Exclude getStack from the trace
            }
            return obj.stack;
        })();
        console.error(JSON.stringify({
            url,
            serverID,
            error: error.stack ?? error.toString(),
            cause,
            info,
            at,
            userAgent,
            ip
        }));
    }

}