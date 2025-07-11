import { RegisterSingleton, ServiceProvider } from "@entity-access/entity-access/dist/di/di.js";
import { SessionUser } from "../core/SessionUser.js";
import CookieService from "./CookieService.js";
import TokenService from "./TokenService.js";
import DateTime from "@entity-access/entity-access/dist/types/DateTime.js";
import type { IAuthorizationCookie } from "./IAuthorizationCookie.js";
import type { SerializeOptions } from "cookie";

const secure = (process.env["SOCIAL_MAIL_AUTH_COOKIE_SECURE"] ?? "true") === "true";

export interface ICookie {
    name: string,
    value: string,
    options?: SerializeOptions
}
@RegisterSingleton
export default class AuthenticationService {

    async authorize(user: SessionUser, { ip, cookies }: { ip: string, cookies: Record<string, string>}) {
        const scope = ServiceProvider.from(user);
        const cookieService = scope.resolve(CookieService);
        const tokenService = scope.resolve(TokenService);
        const cookie = cookies[tokenService.authCookieName];
        await cookieService.createSessionUserFromCookie(cookie, ip);
        (user as any).isAuthorized = true;
    }

    async setAuthCookie(user: SessionUser, authCookie: IAuthorizationCookie): Promise<ICookie> {

        const scope = ServiceProvider.from(user);
        const tokenService = scope.resolve(TokenService);
        const cookie = await tokenService.getAuthToken(authCookie);
        const maxAge = ((authCookie?.expiry ?  DateTime.from(authCookie.expiry) : null) ?? DateTime.now.addDays(30)).diff(DateTime.now).totalMilliseconds;
        const name = cookie.cookieName;
        const value = cookie.cookie;
        const options = {
            secure,
            httpOnly: true,
            maxAge
        };
        return { name, value, options };
    }

}