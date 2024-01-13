import { RegisterSingleton } from "@entity-access/entity-access/dist/di/di.js";
import SessionUser from "../core/SessionUser.js";

@RegisterSingleton
export default class UserSessionProvider {

    async getUserSession(id: number): Promise<Partial<SessionUser>> {
        return {
            userID: 1,
        }
    }

}
