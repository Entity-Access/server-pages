import { RegisterSingleton } from "@entity-access/entity-access/dist/di/di.js";

@RegisterSingleton
export default class ChallengeStore {

    map = new Map<string,string>();

    async get(name: string) {
        return this.map.get(name);
    }

    async save(name: string, value: string) {
        this.map.set(name, value);
    }

    async remove(name: string) {
        this.map.delete(name);
    }
}