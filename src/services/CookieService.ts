import Inject, { RegisterSingleton, ServiceProvider } from "@entity-access/entity-access/dist/di/di.js";
import TokenService, { IAuthCookie } from "./TokenService.js";
import TimedCache from "@entity-access/entity-access/dist/common/cache/TimedCache.js";
import { BaseDriver } from "@entity-access/entity-access/dist/drivers/base/BaseDriver.js";
import { Request, Response } from "express";
import cluster from "cluster";
import SessionUser from "../core/SessionUser.js";
import UserSessionProvider from "./UserSessionProvider.js";

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

@RegisterSingleton
export default class CookieService {

    @Inject
    private tokenService: TokenService;

    @Inject
    private userSessionProvider: UserSessionProvider;

    constructor() {
        process.on("message", (msg: any) => {
            if (msg.type === "cookie-service-clear-cache") {
                this.clearCache(msg.userID, false);
            }
        });
    }

    public clearCache(userID: number, broadcast = true) {
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
}

    async createSessionUser(req: Request, resp: Response) {
        cookieName ??= this.tokenService.authCookieName;
        const sessionCookie = req.cookies[cookieName];
        req.user = await this.createSessionUserFromCookie(sessionCookie, req.ip, resp);
    }

    async createSessionUserFromCookie(cookie: string, ip: string, resp?: Response) {
        const user = new SessionUser(resp, cookieName, this.tokenService);
        try {
            user.ipAddress = ip;
            if (cookie) {
                const userInfo = await this.getVerifiedUser(cookie);
                if (userInfo?.sessionID) {
                    user.sessionID = userInfo.sessionID;
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

            if(!await this.tokenService.verifyContent(parsedCookie, false)) {
                return {};
            }

            if (!parsedCookie.active) {
                return {
                    sessionID: parsedCookie.id
                };
            }

            const r = await this.createUserInfo(parsedCookie.id, cookie);
            return r;
        });
    }

    private async createUserInfo(id: number, cookie: string) {
        const r = await this.userSessionProvider.getUserSession(id);
        if (r === null) {
            return {};
        }
        if (r.expiry.getTime() < Date.now() || r.invalid) {
            return {};
        }
        cacheFR.register(r, r.userID);
        userCookies.set(r.userID, cookie);
        return r;
    }

}