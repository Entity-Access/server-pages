import { RegisterSingleton } from "@entity-access/entity-access/dist/di/di.js";
import DateTime from "@entity-access/entity-access/dist/types/DateTime.js";
import { generateKeyPair } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface IAuthKey {
    id: number,
    publicKey: string,
    privateKey: string,
    expires: DateTime
}


export default class KeyProvider {

    public keyPath: string = "/data/keys";

    private key: IAuthKey;

    public async getKeys() {
        if (this.key) {
            return [this.key];
        }
        // check if we have key stored
        const keyPath = this.keyPath;
        if (!existsSync(keyPath)) {
            mkdirSync(keyPath, { recursive: true});
        }
        const file = join(keyPath, "cookie-key.json");
        if (existsSync(file)) {
            this.key = JSON.parse(readFileSync(file, "utf-8"));
            return [this.key];
        }
        this.key = await this.generateKey(null);
        writeFileSync(file, JSON.stringify(this.key, undefined, 2));
        return [this.key];
    }

    protected generateKey(expires: DateTime) {
        return new Promise<IAuthKey>((resolve, reject) => {
            generateKeyPair('rsa', {
                modulusLength: 2048,
                publicKeyEncoding: {
                  type: 'spki',
                  format: 'pem'
                },
                privateKeyEncoding: {
                  type: 'pkcs8',
                  format: 'pem'
                }
            },
               (error, publicKey, privateKey) => {
                resolve({
                    id: 1,
                    publicKey,
                    privateKey,
                    expires
                });
            });
        });
    }
}