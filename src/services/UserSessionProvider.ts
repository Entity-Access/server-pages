import { RegisterScoped, RegisterSingleton } from "@entity-access/entity-access/dist/di/di.js";
import SessionUser from "../core/SessionUser.js";
import DateTime from "@entity-access/entity-access/dist/types/DateTime.js";

@RegisterScoped
export default class UserSessionProvider {

    async getUserSession(id: number, expiry: Date = DateTime.now.addHours(1).asJSDate): Promise<Partial<SessionUser>> {
        return {
            userID: 1,
            expiry
        }
    }

}
