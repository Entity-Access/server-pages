/* eslint-disable no-console */
import { existsSync, mkdirSync, rmSync, rmdirSync } from "node:fs";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import { join, parse } from "path";
import { LocalFile } from "./LocalFile.js";
import { Stream } from "node:stream";

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

    public readonly folder: string;

    constructor() {
        for(;;) {
            let folder = join(tmpFolder, `tf-${id++}`);
            if (existsSync(folder)) {
                continue;
            }
            mkdirSync(folder);
            this.folder = folder;
            break;
        }
    }

    get(name, mimeType?: string, keep = false) {
        return new LocalFile(join(this.folder, name), name, mimeType, keep ? doNothing : void 0);
    }

    async createFrom(fileName: string, content: Buffer | Stream, contentType: string) {
        fileName ||= "temp.dat";
        const qIndex = fileName.indexOf("?");
        if (qIndex !== -1) {
            fileName = fileName.substring(0, qIndex);
        }
        const tf = await this.get(fileName, contentType);
        await fsp.writeFile(tf.path, content);
        return tf;
    }

    [Symbol.dispose]() {
        try {
            rmSync(this.folder, { recursive: true, force: true, maxRetries: 10, retryDelay: 10000});
        } catch (error) {
            console.warn(error);
        }
    }

}
