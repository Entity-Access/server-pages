import * as http from "node:http";
import Inject, { RegisterSingleton } from "@entity-access/entity-access/dist/di/di.js";
import AcmeChallengeStore from "./AcmeChallengeStore.js";
import ServerLogger from "../core/ServerLogger.js";

@RegisterSingleton
export default class ChallengeServer {

    @Inject
    private challengeStore: AcmeChallengeStore;

    start() {
        const server = http.createServer(async (req, res) => {
            try {
                const url = new URL(req.url, `https://${req.headers.host || "localhost"}`);
                const path = url.pathname.split("/").filter((x) => x);
                if(url.pathname.startsWith("/.well-known/acme-challenge/")) {
                    const token = path[2];
                    const value = await this.challengeStore.get(token);
                    res.writeHead(200, { "content-type": "text/plain" });
                    await new Promise<void>((resolve, reject) => res.write(Buffer.from(value), (error) => error ? reject(error) : resolve()));
                } else {
                    res.writeHead(301, { location: url.toString() });
                }
                await new Promise<void>((resolve) => res.end(resolve));
                
            } catch (error) {
                ServerLogger.error(error);
            }
        });

        server.listen(80);
    }

}