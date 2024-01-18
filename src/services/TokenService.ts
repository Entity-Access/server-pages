import Inject, { RegisterSingleton, ServiceProvider } from "@entity-access/entity-access/dist/di/di.js";
import DateTime from "@entity-access/entity-access/dist/types/DateTime.js";
import { createSign, createVerify, generateKeyPair } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import KeyProvider from "./KeyProvider.js";

export interface IAuthCookie {
    id: number;
    userID: number;
    expiry: Date;
    sign: string;
    version: string;
    active?: boolean;
}

export interface IAuthKey {
    publicKey: string,
    privateKey: string,
    expires: DateTime
}

export type ISignedContent<T> = T & {
    sign: string;
};

@RegisterSingleton
export default class TokenService {

    public authCookieName = "ea-c1";

    public shareCookieName = "ea-ca1";

    private keyProvider: KeyProvider;

    public async getAuthToken(authCookie: Omit<IAuthCookie, "sign">): Promise<{ cookieName: string, cookie: string}> {
        const cookie = await this.signContent(authCookie);
        return { cookieName: this.authCookieName, cookie: JSON.stringify(cookie) };
    }

    public async signContent<T>(content: T): Promise<ISignedContent<T>> {
        this.keyProvider ??= ServiceProvider.resolve(this, KeyProvider, true) ?? new KeyProvider();
        const [key] = await this.keyProvider.getKeys();
        const sign = this.sign(JSON.stringify(content), key);
        return { ... content, sign};
    }

    public async verifyContent<T>(content: ISignedContent<T>, fail = true) {
        this.keyProvider ??= ServiceProvider.resolve(this, KeyProvider, true) ?? new KeyProvider();
        const { sign , ... c } = content;
        const keys = await this.keyProvider.getKeys();
        for (const iterator of keys) {            
            if(this.verify(JSON.stringify(c), sign, iterator, false)) {
                return true;
            }
        }
        if (fail) {
            throw new Error("Signature verification failed");
        }
    }

    private sign(content: string, key: IAuthKey) {
        const sign = createSign("SHA256");
        sign.write(content);
        sign.end();
        return sign.sign(key.privateKey, "hex");
    }

    private verify(content: string | Buffer, signature: string, key: IAuthKey, fail = true) {
        const verify = createVerify("SHA256");
        verify.write(content);
        verify.end();
        if(verify.verify(key.publicKey, signature, "hex")) {
            return true;
        }
        if (fail) {
            throw new Error("Invalid signature");
        }
    }


}
