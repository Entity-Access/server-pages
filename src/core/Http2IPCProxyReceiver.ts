import http2 from "http2";
import { createServer, Socket, Server as SocketServer } from "net";
import { remoteAddressSymbol } from "./remoteAddressSymbol.js";
import { Readable } from "stream";
import EventEmitterPromise from "./EventEmitterPromise.js";

const endSocket = (s: Socket) => {
    try {
        s.end();
    } catch {}
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
 * Http2IPCProxyReceiver class creates a simple socket server, this server
 * can only receive incoming sockets IPC Unix socket only.
 * IPC sockets have no way to distinguish remote clients, so they will first
 * send a remote IP Address terminated by new line character.
 *
 * And then they will start further communication.
 */
export default class Http2IPCProxyReceiver {

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

            (socket as any).alpnProtocol = tokens[1];
            this.forward.emit("connection", socket);
        } catch (error) {
            // console.error(error);
            endSocket(socket);
        }

    };

    constructor(private forward: http2.Http2SecureServer
    ) {
        this.server = createServer(this.onConnection);
        this.server.on("error", console.error);
    }

    listen(port, listener?: any) {
        return this.server.listen(port, listener);
    }


}