export interface IAuthorizationCookie {
    id: number;
    userID: number;
    expiry: Date;
    version: string;
    active?: boolean;
}