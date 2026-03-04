import { createHash } from "node:crypto";
import { utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileInfo } from "./FileApi.js";

export default class RunOnce {

    static async canRun(key: string, maxAge = 60*1000) {

        const sha256 = createHash("sha256");
        const hash = sha256.update(`run-once-file-${key}`).digest("hex");
        const lockFile = join("/tmp", hash + ".last-run");

        const info = await fileInfo(lockFile);
        if (!info) {
            await writeFile(lockFile, "running");
            return true;
        }

        const past = Date.now() - maxAge;
        if (info.mtimeMs > past) {
            return false;
        }
        await writeFile(lockFile, "running");
        const now = new Date();
        await utimes(lockFile, now, now);
        return true;
    }

}