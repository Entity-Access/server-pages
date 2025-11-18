// import Inject, { RegisterScoped, RegisterSingleton, ServiceProvider } from "@entity-access/entity-access/dist/di/di.js";
// import TokenService, { IAuthCookie } from "./TokenService.js";
// import TimedCache from "@entity-access/entity-access/dist/common/cache/TimedCache.js";
// import { BaseDriver } from "@entity-access/entity-access/dist/drivers/base/BaseDriver.js";
// import cluster from "cluster";
// import { SessionUser } from "../core/SessionUser.js";
// import UserSessionProvider from "./UserSessionProvider.js";
// import { WrappedResponse } from "../core/Wrapped.js";

// let cookieName = null;

// @RegisterScoped
// export default class CookieService {

//     @Inject
//     private tokenService: TokenService;

//     async createSessionUserFromCookie(cookie: string, ip: string) {
//         const user = ServiceProvider.resolve(this, SessionUser);
//         const ua = user as any;
//         ua.isAuthorized = true;
//         const value = null;
//         const userID = { value, enumerable: true, writable: true};
//         const sessionID = userID;
//         const userName = userID;
//         const expiry = userID;
//         Object.defineProperties(ua, {
//             authorize: {
//                 value: () => null
//             },
//             sessionID,
//             userID,
//             userName,
//             expiry,
//             roles: {
//                 value: [],
//                 enumerable: true,
//                 writable: true
//             }
//         });
//         try {
//             user.ipAddress = ip;
//             if (cookie) {
//                 const userInfo = await this.getVerifiedUser(cookie);
//                 if (userInfo?.sessionID) {
//                     (user as any).sessionID = userInfo.sessionID;
//                 }
//                 if (userInfo?.userID) {
//                     for (const key in userInfo) {
//                         if (Object.prototype.hasOwnProperty.call(userInfo, key)) {
//                             const element = userInfo[key];
//                             user[key] = element;
//                         }
//                     }
//                 }
//             }
//             return user;
//         } catch (error) {
//             console.error(error);
//             return user;
//         }
//     }

//     private getVerifiedUser(cookie: string): Promise<Partial<SessionUser>> {

//         return sessionCache.getOrCreateAsync(cookie, async (k) => {
//             const parsedCookie = await this.tokenService.decryptContent(cookie);
//             const r = await this.createUserInfo(cookie, parsedCookie);
//             return r;
//         });
//     }

//     private async createUserInfo(cookie: string, parsedCookie: IAuthCookie) {
//         const usp = ServiceProvider.resolve(this, UserSessionProvider, true) ?? new UserSessionProvider();
//         const r = await usp.getUserSession(parsedCookie);
//         if (r === null) {
//             console.warn(`Failed to get userSession for ${parsedCookie.id}: ${parsedCookie.userID}`);
//             return {};
//         }
//         if (r.expiry.getTime() < Date.now() || r.invalid) {
//             console.warn(`Session expired for ${parsedCookie.id}: ${parsedCookie.userID}`);
//             return {};
//         }
//         cacheFR.register(r, r.userID);
//         userCookies.set(r.userID, cookie);
//         return r;
//     }

// }