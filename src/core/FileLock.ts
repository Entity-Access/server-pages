import { Stream } from "node:stream";
import { dirname, join } from "node:path";
import { existsSync, mkdirSync, openSync, constants, writeSync, closeSync, unlinkSync, statSync, futimesSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import * as os from "node:os";
import sleep from "../sleep.js";
import ServerLogger from "./ServerLogger.js";

const tmpdir = process.env.SOCIAL_MAIL_TMP_PATH || os.tmpdir();

const lockFolder = join(tmpdir, "locks");

if (!existsSync(lockFolder)) {
    mkdirSync(lockFolder, { recursive: true });
}

const seconds = 1000;
const minutes = 60*seconds;
const hours = 60*minutes;

const { O_EXCL, O_DIRECT, O_SYNC } = constants;

// eslint-disable-next-line no-bitwise
const openMode = O_EXCL | O_DIRECT | O_SYNC;

export const FileLock = {
    lock(someKey: string, timeout = 2*hours): Promise<Disposable> {
        return LockFile.lock(someKey, timeout);
    }
};

class LockFile implements Disposable {

    static async lock(someKey: string, timeout = 2 * hours) {
        const sha256 = createHash("sha256");
        const hash = sha256.update(someKey).digest("hex");

        const lockFile = join(lockFolder, hash + ".lock");

        const till = Date.now() + timeout;
        let attempt = 0;

        while(Date.now() < till) {

            try {
                // check if it exists..
                if (!existsSync(lockFile)) {
                    // create and return..
                    const fd = openSync(lockFile, "wx", openMode);
                    writeSync(fd, process.pid.toString());
                    closeSync(fd);
                    return new LockFile(lockFile);
                }

                const stat = statSync(lockFile);
                const diff = Date.now() - stat.mtimeMs;
                if (diff > 30000) {
                    // most likely this is dead...
                    unlinkSync(lockFile);
                    continue;
                }

            } catch (error){
                // do nothing
                // console.error(error);
            }

            const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
            await sleep(delay);
            attempt++;
        }

        throw new Error("Could not acquire lock");
    }

    timer: any;

    private constructor(private readonly lockFile) {
        this.timer = setInterval(() => {
            const now = new Date();
            try {
                futimesSync(this.lockFile, now, now);
            } catch {
                // do nothing
            }
        }, 5000);
    }

    [Symbol.dispose]() {
        clearInterval(this.timer);
        try {
            if (existsSync(this.lockFile)) {
                unlinkSync(this.lockFile);
            }
        } catch (error) {
            // ignore error...
            ServerLogger.reportError({ error });
        }
    }

}