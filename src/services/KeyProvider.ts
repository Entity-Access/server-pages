import { RegisterSingleton } from "@entity-access/entity-access/dist/di/di.js";
import DateTime from "@entity-access/entity-access/dist/types/DateTime.js";
import { generateKeyPair } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

export interface IAuthKey {
    id: number,
    key: string,
    iv: string,
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
        const iv = randomBytes(16).toString("hex");
        const key = randomBytes(32).toString("hex");
        return {
            id: 1,
            iv,
            key,
            expires: DateTime.now.addYears(1)
        }
    }
}