import DateTime from "@entity-access/entity-access/dist/types/DateTime.js";

export interface IAuthKey {
    publicKey: string,
    privateKey: string,
    expires: DateTime
}
