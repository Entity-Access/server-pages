import { RegisterSingleton, ServiceProvider } from "@entity-access/entity-access/dist/di/di.js";
import { SessionUser } from "../core/SessionUser.js";
import DateTime from "@entity-access/entity-access/dist/types/DateTime.js";
import type { IAuthorizationCookie } from "./IAuthorizationCookie.js";
import type { SerializeOptions } from "cookie";
import KeyProvider from "./KeyProvider.js";
import { privateDecrypt, publicEncrypt } from "node:crypto";

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
        await this.loadUserSessionFromCookie(cookie, user);
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
        const[pk, value] = cookie.split(":")
        for (const key of keys) {
            if(key.publicKey == pk) {
                return privateDecrypt(key.privateKey, value) as any as number;
            }
        }
        throw new Error("no suitable key found");
    }

    async encode(sessionID) {
        this.keyProvider ??= ServiceProvider.resolve(this, KeyProvider, true) ?? new KeyProvider();
        const [key] = await this.keyProvider.getKeys();
        return key.publicKey + ":" + publicEncrypt(key.publicKey, sessionID.toString()).toString("base64url");
    }

}