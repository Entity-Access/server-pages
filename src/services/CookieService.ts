import Inject, { RegisterScoped, RegisterSingleton, ServiceProvider } from "@entity-access/entity-access/dist/di/di.js";
import TokenService, { IAuthCookie } from "./TokenService.js";
import TimedCache from "@entity-access/entity-access/dist/common/cache/TimedCache.js";
import { BaseDriver } from "@entity-access/entity-access/dist/drivers/base/BaseDriver.js";
import cluster from "cluster";
import { SessionUser } from "../core/SessionUser.js";
import UserSessionProvider from "./UserSessionProvider.js";
import { WrappedResponse } from "../core/Wrapped.js";

/**
 * This will track userID,cookie pair so we can
 * clear the logged in user's file permissions
 */
const userCookies = new Map<number,string>();
const sessionCache = new TimedCache<string, Partial<SessionUser>>();

let cookieName = null;

const tagForCache = Symbol("tagForCache");

const cacheFR = new FinalizationRegistry<number>((heldValue) => {
    userCookies.delete(heldValue);
});

const clearCache = (userID, broadcast = true) => {
    const cookie = userCookies.get(userID);
    if (cookie) {
        sessionCache.delete(cookie);
    }
    if (!broadcast) {
        return;
    }
    const clearMessage = {
        type: "cookie-service-clear-cache",
        userID
    };
    if (cluster.isWorker) {
        process.send(clearMessage);
    } else {
        if(cluster.workers) {
            for (const key in cluster.workers) {
                if (Object.prototype.hasOwnProperty.call(cluster.workers, key)) {
                    const element = cluster.workers[key];
                    element.send(clearMessage);
                }
            }
        }
    }
};

process.on("message", (msg: any) => {
    if (msg.type === "cookie-service-clear-cache") {
        clearCache(msg.userID, false);
    }
});

@RegisterScoped
export default class CookieService {

    @Inject
    private tokenService: TokenService;

    public clearCache = clearCache;

    async createSessionUserFromCookie(cookie: string, ip: string) {
        const user = ServiceProvider.resolve(this, SessionUser);
        const ua = user as any;
        ua.isAuthorized = true;
        const value = null;
        const userID = { value, enumerable: true, writable: true};
        const sessionID = userID;
        const userName = userID;
        const expiry = userID;
        Object.defineProperties(ua, {
            authorize: {
                value: () => null
            },
            sessionID,
            userID,
            userName,
            expiry,
            roles: {
                value: [],
                enumerable: true,
                writable: true
            }
        });
        try {
            user.ipAddress = ip;
            if (cookie) {
                const userInfo = await this.getVerifiedUser(cookie);
                if (userInfo?.sessionID) {
                    (user as any).sessionID = userInfo.sessionID;
                }
                if (userInfo?.userID) {
                    user[tagForCache] = userInfo;
                    for (const key in userInfo) {
                        if (Object.prototype.hasOwnProperty.call(userInfo, key)) {
                            const element = userInfo[key];
                            user[key] = element;
                        }
                    }
                }
            }
            return user;
        } catch (error) {
            console.error(error);
            return user;
        }
    }

    private getVerifiedUser(cookie: string): Promise<Partial<SessionUser>> {

        return sessionCache.getOrCreateAsync(cookie, async (k) => {

            const parsedCookie = JSON.parse(cookie) as IAuthCookie;
            if (!parsedCookie.id) {
                return {};
            }

            if (typeof parsedCookie.expiry === "string") {
                parsedCookie.expiry = new Date(parsedCookie.expiry);
            }

            if(!await this.tokenService.verifyContent(parsedCookie, false)) {
                console.warn(`Cookie Verification failed for ${parsedCookie.id}: ${parsedCookie.userID}`);
                return {};
            }

            if (!parsedCookie.active) {
                return {
                    sessionID: parsedCookie.id
                };
            }

            const r = await this.createUserInfo(cookie, parsedCookie);
            return r;
        });
    }

    private async createUserInfo(cookie: string, parsedCookie: IAuthCookie) {
        const usp = ServiceProvider.resolve(this, UserSessionProvider, true) ?? new UserSessionProvider();
        const r = await usp.getUserSession(parsedCookie);
        if (r === null) {
            console.warn(`Failed to get userSession for ${parsedCookie.id}: ${parsedCookie.userID}`);
            return {};
        }
        if (r.expiry.getTime() < Date.now() || r.invalid) {
            console.warn(`Session expired for ${parsedCookie.id}: ${parsedCookie.userID}`);
            return {};
        }
        cacheFR.register(r, r.userID);
        userCookies.set(r.userID, cookie);
        return r;
    }

}