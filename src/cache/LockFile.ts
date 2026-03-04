/* eslint-disable no-console */
import { join } from "node:path";
import { existsSync, mkdirSync, unlinkSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import sleep from "../sleep.js";
import TimeoutError from "../core/TimeoutError.js";

const lockFolder = join("/tmp", "locks");

if (!existsSync(lockFolder)) {
    mkdirSync(lockFolder, { recursive: true });
}

const seconds = 1000;
const minutes = 60*seconds;
const hours = 60*minutes;

export default class LockFile implements Disposable {


    static async lock(someKey: string, timeout = 2 * hours, interval = 3000, throwOnFail = true) {
        const sha256 = createHash("sha256");
        const hash = sha256.update(someKey).digest("hex");

        const lockFile = join(lockFolder, hash + ".lock");

        let now = Date.now();
        const till = now + timeout;

        let lastError = null as Error;

        do {

            try {
                // check if it exists..
                if (!existsSync(lockFile)) {
                    // create and return..
                    return new LockFile(lockFile);
                }

                const stat = statSync(lockFile);
                const past = now - 15000;
                if(stat.mtimeMs < past) {
                    // it is dead...
                    unlinkSync(lockFile);
                }
            } catch (error){
                // do nothing
                lastError = error;
                // console.error(error);
            }
            await sleep(interval);
            now = Date.now();
        }while(now < till);

        if (throwOnFail) {
            lastError ??= new TimeoutError("lock timed out");
            throw new Error(`Could not acquire lock ${lockFile}, Reason: ${lastError?.stack ?? lastError?.toString()}`);
        }

        return {

            locked: false,
            timer: void 0,

            [Symbol.dispose]() {
                // do nothing..
            }
        };
    }

    timer: any;
    public locked: any;

    constructor(private readonly lockFile) {

        this.locked = true;

        writeFileSync(lockFile, "locked", {  flag :"wx", flush: true });

        this.timer = setInterval(() => {
            try {
                const now = new Date();
                utimesSync(lockFile, now, now);
            } catch {
                // do nothing
            }
        }, 1000);
    }

    [Symbol.dispose]() {
        try {
            clearInterval(this.timer);
            unlinkSync(this.lockFile);
        } catch (error) {
            // ignore error...
            console.error(error);
        }
    }

}