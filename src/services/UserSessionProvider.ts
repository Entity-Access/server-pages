import { RegisterScoped, RegisterSingleton } from "@entity-access/entity-access/dist/di/di.js";
import SessionUser from "../core/SessionUser.js";
import DateTime from "@entity-access/entity-access/dist/types/DateTime.js";
import { IAuthCookie } from "./TokenService.js";

@RegisterScoped
export default class UserSessionProvider {

    async getUserSession({ userID, id: sessionID, expiry}: IAuthCookie): Promise<Partial<SessionUser>> {
        return {
            sessionID,
            userID,
            expiry
        }
    }

}
