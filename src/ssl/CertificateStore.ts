import { RegisterSingleton } from "@entity-access/entity-access/dist/di/di.js";
import { join } from "node:path";
import ensureDir from "../core/FileApi.js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import * as acme from "acme-client";

export interface ICertificate {
    host?: string;
    key?: Buffer;
    cert?: string;
}

let folder = "./data/certs";

@RegisterSingleton
export default class CertificateStore {

    public get folder() {
        return folder;
    }
    
    public set folder(v: string) {
        folder = v;
    }

    public async getAccountKey() {
        const keyFolder = join(folder, "keys");
        let key: Buffer;
        ensureDir(keyFolder);
        const keyPath = join(keyFolder, "private.key");
        if (!existsSync(keyPath)) {
            key = await acme.crypto.createPrivateRsaKey();
            writeFileSync(keyPath, key);
            console.log(`Creating New Account key: ${keyPath}`);
        } else {
            key = readFileSync(keyPath);
        }
        return key;
    }

    public async get( { host }: ICertificate): Promise<ICertificate> {
        const { certPath, keyPath } = this.getPaths(folder, host);
        const cert = existsSync(certPath) ? readFileSync(certPath, "utf8") : "";
        let key: Buffer;
        if (!existsSync(keyPath)) {
            key = await acme.crypto.createPrivateRsaKey();
            writeFileSync(keyPath, key);
            console.log(`Creating New key: ${keyPath}`);
        } else {
            key = readFileSync(keyPath);
        }
        return { host, cert, key };
    }

    public async save({ host, cert, key }: ICertificate) {
        const { certPath, keyPath } = this.getPaths(folder, host);
        writeFileSync(certPath, cert, "utf8");
        writeFileSync(keyPath, key);
    }

    private getPaths(folder: string, host: string) {
        const hostRoot = join(folder, host);
        ensureDir(hostRoot);
        const certPath = join(hostRoot, "cert.crt");
        const keyPath = join(hostRoot, "key.pem");
        return { certPath, keyPath }
    }

}