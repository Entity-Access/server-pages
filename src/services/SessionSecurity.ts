import Inject, { RegisterScoped } from "@entity-access/entity-access/dist/di/di.js";
import { SessionUser } from "../core/SessionUser.js";
import { identitySymbol } from "@entity-access/entity-access/dist/common/symbols/symbols.js";
import SessionEncryption from "./SessionEncryption.js";
import EntityAccessError from "@entity-access/entity-access/dist/common/EntityAccessError.js";

@RegisterScoped
export default class SessionSecurity {

    @Inject
    sessionUser: SessionUser;

    publicKey: string;

    injectKey(entity, secure = true) {
        let key = entity[identitySymbol];
        if (!key) {
            return entity;
        }
        const { sessionID } = this.sessionUser;
        const { publicKey } = this;
        if (!publicKey) {
            throw new EntityAccessError(`Public Key not set for session security`);
        }
        const encryptionKey = secure ? sessionID?.toString() || publicKey : publicKey;
        key = SessionEncryption.encrypt(key, encryptionKey)
        entity.$key = `es-${key}`;
        return entity;
    }

    decryptKey(key: string) {
        let encryptionKey;
        if(key.startsWith("es-")) {
            encryptionKey = this.sessionUser.sessionID?.toString() ?? "unknown";            
        } else if (key.startsWith("ep-")) {
            encryptionKey = this.publicKey;
        } else {
            return JSON.parse(key.substring(3));
        }

        key = key.substring(3);
        return JSON.parse(SessionEncryption.decrypt(key, encryptionKey));
    }
}