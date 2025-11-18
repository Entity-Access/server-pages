import { RegisterSingleton, ServiceProvider } from "@entity-access/entity-access/dist/di/di.js";
import { SessionUser } from "../core/SessionUser.js";
import DateTime from "@entity-access/entity-access/dist/types/DateTime.js";
import type { IAuthorizationCookie } from "./IAuthorizationCookie.js";
import type { SerializeOptions } from "cookie";
import KeyProvider, { IAuthKey } from "./KeyProvider.js";
import { createCipheriv, privateDecrypt, publicEncrypt } from "node:crypto";

const secure = (process.env["SOCIAL_MAIL_AUTH_COOKIE_SECURE"] ?? "true") === "true";

export interface ICookie {
    name: string,
    value: string,
    options?: SerializeOptions
}
@RegisterSingleton
export default class AuthorizationService {

    authCookieName = "ec-1";
    keyProvider: any;

    async authorizeRequest(user: SessionUser, { ip, cookies }: { ip: string, cookies: Record<string, string>}) {
        const cookie = cookies[this.authCookieName];
        if (!cookie) {
            return;
        }
        try {
            await this.loadUserSessionFromCookie(cookie, user);
        } catch (error) {
            console.error(error);
            (user as any).isAuthorized = false;
        }
    }

    async loadUserSessionFromCookie(cookie: string, user: SessionUser) {
        const sessionID = await this.decode(cookie);
        user.sessionID = sessionID;
        // load session... 
        await this.loadSession(sessionID, user);
        (user as any).isAuthorized = true;
    }

    async loadSession(sessionID, user: SessionUser): Promise<void> {
        user.userID = sessionID;
    }

    async setAuthCookie(user: SessionUser, authCookie: IAuthorizationCookie): Promise<ICookie> {

        const maxAge = ((authCookie?.expiry ?  DateTime.from(authCookie.expiry) : null) ?? DateTime.now.addDays(30)).diff(DateTime.now).totalMilliseconds;
        const name = this.authCookieName;
        const value = await this.encode(authCookie?.sessionID ?? authCookie?.userID ?? "0");
        const options = {
            secure,
            httpOnly: true,
            maxAge
        };
        return { name, value, options };
    }

    async decode(cookie: string) {
        this.keyProvider ??= ServiceProvider.resolve(this, KeyProvider, true) ?? new KeyProvider();
        const keys = await this.keyProvider.getKeys();
        const[id, value] = cookie.split(":")
        for (const key of keys) {
            if(key.id == id) {
                return this.decrypt(value, key);
            }
        }
        throw new Error("no suitable key found");
    }

    async encode(sessionID) {
        this.keyProvider ??= ServiceProvider.resolve(this, KeyProvider, true) ?? new KeyProvider();
        const [key] = await this.keyProvider.getKeys();
        return key.id + ":" + this.encrypt(sessionID.toString(), key);
    }

    private encrypt(text: string, authKey: IAuthKey) {
        const { key, iv }  = authKey;
        const cipher = createCipheriv("aes-256-cbc",Buffer.from(key, "hex"), Buffer.from(iv, "hex"));
        return (cipher.update(text, "utf-8", "base64url")
                + cipher.final("base64url")).replaceAll("=", "*");
    }

    private decrypt(text: string, authKey: IAuthKey) {
        const { key, iv }  = authKey;
        text = text.replaceAll("*", "=");
        const decipher = createCipheriv("aes-256-cbc", Buffer.from(key, "hex"), Buffer.from(iv, "hex"));
        return (decipher.update( text , "base64url", "utf-8") + decipher.final("utf-8"));
    }
}