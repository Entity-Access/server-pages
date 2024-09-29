import http from "http";
import http2 from "http2";
import { createServer, Socket, Server as SocketServer } from "net";
import { remoteAddressSymbol } from "./remoteAddressSymbol.js";

export default class TLSProxy {

    server: SocketServer;

    constructor(private forward: http.Server | http2.Http2Server | http2.Http2SecureServer) {
        this.server = createServer(this.onConnection);
    }

    listen(port) {
        return this.server.listen(port);
    }

    onConnection(socket: Socket) {
        const getAddress = (buffer: Buffer) => {

            const n = buffer.indexOf("\n");
        
            const address = buffer.subarray(1, n).toString("utf8");
        
            const head = buffer.subarray(n + 1);
        
            if (head.length) {
                socket.unshift(head);
            }
        
            socket[remoteAddressSymbol] = address;
        
            socket.off("data", getAddress);
        
            this.forward.emit("connection", socket);
        
        };

        socket.on("data", getAddress);                

    }


}