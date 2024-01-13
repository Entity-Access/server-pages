/* eslint-disable no-console */
import { existsSync, mkdirSync, rmSync, rmdirSync } from "node:fs";
import * as os from "node:os";
import { join } from "path";
import { LocalFile } from "./LocalFile.js";

const doNothing = () => void 0;

const tmpdir = os.tmpdir();

const tmpFolder =  join(tmpdir, "tmp-folders");

if (!existsSync(tmpFolder)) {
    try {
        mkdirSync(tmpFolder, { recursive: true });
    } catch {
        // ignore
    }
}

let id = 1;

export default class TempFolder implements Disposable {

    constructor(public readonly folder = join(tmpFolder, `tf-${id++}`)) {
        mkdirSync(folder);
    }

    get(name, mimeType?: string, keep = false) {
        return new LocalFile(join(this.folder, name), name, mimeType, keep ? doNothing : void 0);
    }

    [Symbol.dispose]() {
        try {
            rmSync(this.folder, { recursive: true, force: true, maxRetries: 10, retryDelay: 10000});
        } catch (error) {
            console.warn(error);
        }
    }

}
