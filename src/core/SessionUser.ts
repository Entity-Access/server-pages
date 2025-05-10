import EntityAccessError from "@entity-access/entity-access/dist/common/EntityAccessError.js";
import Inject, { RegisterScoped, ServiceProvider } from "@entity-access/entity-access/dist/di/di.js";
import DateTime from "@entity-access/entity-access/dist/types/DateTime.js";
import TokenService, { IAuthCookie } from "../services/TokenService.js";
import { WrappedResponse } from "./Wrapped.js";
import { CacheProperty } from "./CacheProperty.js";
import AuthenticationService from "../services/AuthenticationService.js";

const secure = (process.env["SOCIAL_MAIL_AUTH_COOKIE_SECURE"] ?? "true") === "true";

export type roles = "Administrator" | "Contributor" | "Reader" | "Guest";

/**
 * Remember to call `await sessionUser.authorize()` or 
 * decorate the page with `@Prepare.authorize`.
 */
@RegisterScoped
export class SessionUser {

    /**
     * SessionID saved in database for current session.
     */
    get sessionID(): number | null {
        return null;
    }

    set sessionID(value: any) {
        CacheProperty.value(this, "sessionID", value);
    }

    /**
     * UserID
     */
    get userID(): number | null {
        return null;
    }

    set userID(value: any) {
        CacheProperty.value(this, "userID", value);
    }

    /**
     * Logged in user name
     */
    get userName(): string {
        return null;
    }

    set userName(value: string) {
        CacheProperty.value(this, "userName", value);
    }

    /**
     * Application Roles, user is associated with.
     */
    get roles(): string[] {
        return null;
    }

    set roles(value: string[]) {
        CacheProperty.value(this, "roles", value);
    }

    /**
     * Expiry date, after which this session is invalid
     */
    get expiry(): Date {
        return null;
    }

    set expiry(value: string | Date) {
        CacheProperty.value(this, "sessionID", DateTime.from(value));
    }

    /**
     * If set to true, session is no longer valid.
     */
    invalid?: boolean;

    ipAddress: string;

    get isAdmin() {
        return this.roles?.includes("Administrator") ?? false;
    }

    public resp: WrappedResponse;

    private isAuthorized = false;

    @Inject
    protected tokenService: TokenService;

    public async authorize() {
        this.isAuthorized = true;
    }

    isInRole(role: roles) {
        return this.roles?.includes(role) ?? false;
    }

    ensureLoggedIn(error: () => EntityAccessError = () => new EntityAccessError(`Login Required`)) {
        if (!this.userID) {
            throw error();
        }
    }

    ensureRole(role: roles, error: () => EntityAccessError = () => new EntityAccessError(`Not in Role`)) {
        if (this.isInRole(role)) {
            return;
        }
        throw error();
    }

    ensureIsAdmin(error: () => EntityAccessError = () => new EntityAccessError(`Not an Admin.`)) {
        return this.ensureRole("Administrator", error);
    }

    async setAuthCookie(authCookie: Omit<IAuthCookie, "sign">) {
        const authService = ServiceProvider.resolve(this, AuthenticationService);
        const cookie = await authService.setAuthCookie(this, authCookie);
        (cookie.options ??= {} as any).httpOnly = true;
        this.resp?.cookie(cookie.name, cookie.value, cookie.options);
    }

    async clearAuthCookie() {
        const authService = ServiceProvider.resolve(this, AuthenticationService);
        const cookie = await authService.setAuthCookie(this, null);
        (cookie.options ??= {} as any).httpOnly = true;
        this.resp?.cookie(cookie.name, cookie.value, cookie.options);
    }
}