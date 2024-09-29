import http from "http";
import http2 from "http2";
import { createServer, Socket, Server as SocketServer } from "net";
import { remoteAddressSymbol } from "./remoteAddressSymbol.js";
import { Readable, Stream } from "stream";

const endSocket = (s: Socket) => {
    try {
        s.end();
    } catch {}
};

const readLine = (s: Socket) => new Promise<string>((resolve, reject) => {

    const ss = s as Readable;
    let buffer = Buffer.from("");
    const reader = () => {
        const n = ss.read(1);
        if (n === null || n === void 0) {
            return;
        }
        if (n === 10) {
            ss.off("readable", reader);
            resolve(buffer.toString("utf8"));
            return;
        }
        buffer = Buffer.concat([buffer, Buffer.from([n]) ]);
    };
    ss.on("readable", reader);
});

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

            let address = await readLine(socket);
            if (!address.startsWith("fwd>")) {
                throw new Error(`Invalid HTTP IPC Fowrd Protocol, received ${address}`);
            }
            
            address = address.substring(4);

            socket[remoteAddressSymbol] = address;
            this.forward.emit("connection", socket);

            socket.on("error", (error) => {
                console.error(error);
                endSocket(socket);
            });
        } catch (error) {
            
        }

    };

    constructor(private forward: http.Server | http2.Http2Server | http2.Http2SecureServer) {
        this.server = createServer(this.onConnection);
        this.server.on("error", console.error);
    }

    listen(port, listener?: any) {
        return this.server.listen(port, listener);
    }


}