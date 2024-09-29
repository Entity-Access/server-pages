import http from "http";
import http2 from "http2";
import { createServer, Socket, Server as SocketServer } from "net";
import { remoteAddressSymbol } from "./remoteAddressSymbol.js";

const endSocket = (s: Socket) => {
    try {
        s.end();
    } catch {}
};

const bound = Symbol("bound");

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

    onConnection = (socket: Socket) => {
        const getAddress = (buffer: Buffer) => {

            try {

                socket.off("data", getAddress);

                if(socket[bound]) {
                    return;
                }

                socket[bound] = true;


                const n = buffer.indexOf("\n");
            
                const address = buffer.subarray(1, n).toString("utf8");

                if (!address.startsWith("fwd:")) {
                    throw new Error(`Invalid HTTP IPC Fowrd Protocol, received ${address}`);
                }
            
                const head = buffer.subarray(n + 1);
            
                if (head.length) {
                    socket.unshift(head);
                }
            
                socket[remoteAddressSymbol] = address;
            
            
                this.forward.emit("connection", socket);
            } catch (error) {
                console.error(error);
                endSocket(socket);
            }
        
        };

        socket.on("data", getAddress);
        socket.on("error", (error) => {
            console.error(error);
            endSocket(socket);
        });

    };

    constructor(private forward: http.Server | http2.Http2Server | http2.Http2SecureServer) {
        this.server = createServer(this.onConnection);
        this.server.on("error", console.error);
    }

    listen(port, listener?: any) {
        return this.server.listen(port, listener);
    }


}