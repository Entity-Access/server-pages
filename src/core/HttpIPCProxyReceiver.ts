import http from "http";
import http2 from "http2";
import { createServer, Socket, Server as SocketServer } from "net";
import { remoteAddressSymbol } from "./remoteAddressSymbol.js";
import { Readable, Stream } from "stream";
import EventEmitterPromise from "./EventEmitterPromise.js";

const endSocket = (s: Socket) => {
    try {
        s.end();
    } catch {}
};

const read = (s: Socket, n: number) => {
    const { promise, resolve, reject, target } = EventEmitterPromise.extend(s as Readable)
        .as<Buffer>();
    const reader = () => {
        const data = target.read(3);
        if (!data) {
            target.once("readable", reader);
            return;
        }
        resolve(data);
    };
    target.once("readable", reader);
    target.once("error", reject);
    target.once("end", () => reject(new Error("Socket hung up")));
    return promise;
};

const readLine = (s: Socket) => {
    const { promise, resolve, reject, target } = EventEmitterPromise.extend(s as Readable)
        .as<string>();
    let buffer = Buffer.from("");
    const reader = () => {
        do {
            const n = target.read(1) as Buffer;
            if (n === null || n === void 0) {
                target.once("readable", reader);
                return;
            }
            if (n.at(0) === 10) {
                resolve(buffer.toString("utf-8"));
                return;
            }
            buffer = Buffer.concat([buffer, n]);
        } while(true);
    };
    target.once("readable", reader);
    target.once("error", reject);
    target.once("end", () => reject(new Error("Socket hung up")));
    return promise;
};

/**
 * HttpIPCProxyReceiver class creates a simple socket server, this server
 * can only receive incoming sockets IPC Unix socket only.
 * IPC sockets have no way to distinguish remote clients, so they will first
 * send a remote IP Address terminated by new line character.
 *
 * And then they will start further communication.
 */
export default class HttpIPCProxyReceiver {

    server: SocketServer;

    onConnection = async (socket: Socket) => {
        try {

            socket.on("error", (error) => {
                console.error(error);
                endSocket(socket);
            });

            let address = await readLine(socket);
            if (!address.startsWith("fwd>")) {
                throw new Error(`Invalid HTTP IPC Forward Protocol, received ${address}`);
            }
            
            const tokens = address.split(">");
            address = tokens[2];

            socket[remoteAddressSymbol] = address;

            const alpnProtocol = tokens[1];
            (socket as any).alpnProtocol = alpnProtocol;

            if (alpnProtocol === "h2") {
                this.forward.emit("connection", socket);
            } else {
                this.forward1.emit("connection", socket);
            }

        } catch (error) {
            // console.error(error);
            endSocket(socket);
        }

    };

    constructor(private forward: http.Server | http2.Http2Server | http2.Http2SecureServer,
        private forward1: http.Server
    ) {
        this.server = createServer({ keepAlive: true, keepAliveInitialDelay: 5000, noDelay: true }, this.onConnection);
        this.server.on("error", console.error);
    }

    listen(port, listener?: any) {
        return this.server.listen(port, listener);
    }


}