import { identitySymbol } from "@entity-access/entity-access/dist/common/symbols/symbols.js";
import crypto from "node:crypto";
import { SessionUser } from "../core/SessionUser.js";

const cache = new Map<string, { key, encryptionIV }>();

export default class SessionEncryption {

    static host = "entity-access";

    static encrypt(text: string, secretKey = "anonymous-public") {
        const { key, encryptionIV}  = this.createKey(secretKey);
        const cipher = crypto.createCipheriv("aes-256-cbc", key, encryptionIV);
        return cipher.update(text, "utf8", "hex")
                + cipher.final("hex");
    }

    static decrypt(text: string, secretKey = "anonymous-public") {
        const { key, encryptionIV}  = this.createKey(secretKey);
        const decipher = crypto.createDecipheriv("aes-256-cbc", key, encryptionIV);
        return (decipher.update(text, "hex", "utf8") + decipher.final("utf8"));
    }

    static createKey(secretKey: string) {

        let result = cache.get(secretKey);
        if(!result) {
            const key = crypto.createHash("sha512")
                .update(secretKey)
                .digest("hex")
                .substring(0, 32);

            const encryptionIV = crypto.createHash("sha512")
                .update(SessionEncryption.host)
                .digest("hex")
                .substring(0, 16);
            result = { key, encryptionIV };
            cache.set(secretKey, result);
            setTimeout(() => cache.delete(secretKey), 60000);
        }
        return result;
    }
}