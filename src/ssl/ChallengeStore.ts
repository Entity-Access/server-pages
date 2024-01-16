import { RegisterSingleton } from "@entity-access/entity-access/dist/di/di.js";
import ensureDir from "../core/FileApi.js";
import { readFileSync, unlinkSync, writeFileSync } from "fs";
import { join } from "node:path";

const path = "./challenges";

@RegisterSingleton
export default class ChallengeStore {

    constructor() {
        ensureDir(path);
    }

    async get(name: string) {
        return readFileSync(join(path, name));
    }

    async save(name: string, value: string) {
        writeFileSync(join(path, name), value, "utf8");
    }

    async remove(name: string) {
        unlinkSync(join(path, name));
    }
}