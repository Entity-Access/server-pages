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

    injectPublicKey(entity) {
        let key = entity[identitySymbol];
        if (!key) {
            return entity;
        }
        const encryptionKey = this.getKey(false);
        key = SessionEncryption.encrypt(key, encryptionKey)
        entity.$key = `es-${key}`;
        return entity;
    }

    injectKey(entity, isPrivate = true) {
        let key = entity[identitySymbol];
        if (!key) {
            return entity;
        }
        const encryptionKey = this.getKey(isPrivate);
        key = SessionEncryption.encrypt(key, encryptionKey)
        entity.$key = `es-${key}`;
        return entity;
    }

    private getKey(isPrivate: boolean) {
        const { userID } = this.sessionUser;
        if (isPrivate && userID) {
            return userID.toString();
        }
        const { publicKey } = this;
        if (!publicKey) {
            throw new EntityAccessError(`Public Key not set for session security`);
        }
        return publicKey;
    }

    decryptKey(key: string) {
        let encryptionKey;
        if(key.startsWith("es-")) {
            encryptionKey = this.getKey(true);
        } else if (key.startsWith("ep-")) {
            encryptionKey = this.getKey(false);
        } else {
            return JSON.parse(key.substring(3));
        }

        key = key.substring(3);
        return JSON.parse(SessionEncryption.decrypt(key, encryptionKey));
    }
}