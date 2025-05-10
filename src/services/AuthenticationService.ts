import { RegisterSingleton, ServiceProvider } from "@entity-access/entity-access/dist/di/di.js";
import { SessionUser } from "../core/SessionUser.js";
import CookieService from "./CookieService.js";
import TokenService from "./TokenService.js";

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

}