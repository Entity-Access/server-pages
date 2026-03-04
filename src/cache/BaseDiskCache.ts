/* eslint-disable no-console */
import fsp, { opendir, rm, rmdir, stat, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, parse } from "node:path";
import { randomUUID } from "node:crypto";
import EntityAccessError from "@entity-access/entity-access/dist/common/EntityAccessError.js";
import ensureDir from "../core/FileApi.js";
import TempFolder from "../core/TempFolder.js";
import { LocalFile } from "../core/LocalFile.js";
import { spawnPromise } from "./spawnPromise.js";
import LockFile from "./LockFile.js";
import sleep from "../sleep.js";
import RunOnce from "../core/RunOnce.js";
import { toKMBString } from "../core/NumberFormats.js";

const doNothing = () => void 0;

export interface IDiskCacheContainer {
    cache: BaseDiskCache;
}

export default class BaseDiskCache {

    protected readonly root: string;
    protected readonly keepTTLSeconds: number;
    protected readonly minSize: number;
    protected readonly updateAccessTime: boolean;
    protected readonly maxAge: number;
    protected readonly minAge: number;
    constructor(
        {
            root,
            keepTTLSeconds = 3600,
            minSize = Number.MAX_SAFE_INTEGER,
            updateAccessTime = true,
            maxAge = 1,
            minAge = 1
        }: {
            root: string;
            keepTTLSeconds?: number;
            minSize?: number;
            updateAccessTime?: boolean;
            maxAge?: number;
            minAge?: number;
        }
    ) {
        this.root = root;
        this.keepTTLSeconds = keepTTLSeconds;
        this.minSize = minSize;
        this.updateAccessTime = updateAccessTime;
        this.maxAge = maxAge;
        this.minAge = minAge;
        ensureDir(root);
        // eslint-disable-next-line no-console
        setTimeout(() => this.clean().catch(console.error), 1000);
    }

    newFolder(suffix = "") {
        return new TempFolder(suffix, this.root);
    }

    async get(path: string) {
        path = join(this.root, path);
        if (existsSync(path)) {
            if(this.updateAccessTime) {
                const now = new Date();
                await fsp.utimes(path, now, now);
            }
            return new LocalFile(path, void 0, void 0, doNothing);
        }
    }

    async clear() {
        try {
            const path = this.root;
            using _lock = await LockFile.lock(`df-clear:${path}`);
            if (!existsSync(path)) {
                return;
            }
            const stalePath = `${path}.old.${Date.now()}`;
            await spawnPromise("mv",[path, stalePath]);
            ensureDir(this.root);
            rm(stalePath, { recursive: true, force: true}).catch(console.error);
        } catch (error) {
            console.error(error);
        }
    }

    async clearFolder(path: string) {
        try {
            using _lock = await LockFile.lock(`df-clear:${path}`);
            path = join(this.root, path);
            if (!existsSync(path)) {
                return;
            }
            const stalePath = `${path}.old.${Date.now()}`;
            await spawnPromise("mv",[path, stalePath]);
            rm(stalePath, { recursive: true, force: true}).catch(console.error);
        } catch (error) {
            console.error(error);
        }
    }

    async getOrCreateJsonAsync<T>(path: string, factory: () => Promise<T>) {
        const localFile = await this.getOrCreateAsync(path, async (lf) => {
            const data = (await factory()) ?? null;
            await lf.writeAllText(JSON.stringify(data));
        });
        const text = await localFile.readAsText();
        return JSON.parse(text) as T;
    }

    deleteAt(path: string) {
        path = join(this.root, path);
        return unlink(path);
    }

    async getOrCreateAsync(path: string, factory: (fx: LocalFile) => Promise<void>, ext = ".dat") {
        path = join(this.root, path);

        const parsedPath = parse(path);
        ensureDir(parsedPath.dir);

        let error: Error;

        for (let index = 0; index < 5; index++) {
            if (existsSync(path)) {
                if(this.updateAccessTime) {
                    const now = new Date();
                    await fsp.utimes(path, now, now);
                }
                return new LocalFile(path, void 0, void 0, doNothing);
            }

            using _lock = await LockFile.lock(`df:${path}`);

            if (existsSync(path)) {
                return new LocalFile(path, void 0, void 0, doNothing);
            }

            const tmpPath = join(this.root, randomUUID() + (parsedPath.ext || ext));

            await factory(new LocalFile(tmpPath, void 0, void 0, doNothing));

            try {
                ensureDir(parsedPath.dir);
                await fsp.rename(tmpPath, path);
            } catch (e) {

                if (existsSync(tmpPath)) {
                    unlink(tmpPath).catch(doNothing);
                }

                error = e;
                await sleep(1000);
                continue;
            }
            return new LocalFile(path, void 0, void 0, doNothing);
        }

        throw new EntityAccessError(`Failed to write file due to error ${error.stack ?? error}`);
    }

    createTempFileDeleteOnExit(pathFragments: string[], name: string, contentType: string) {
        const fileName = pathFragments.pop();
        let folder = void 0;
        if (pathFragments.length) {
            folder = join(this.root, ... pathFragments);
            ensureDir(folder);
        }
        const path = join(this.root, ... pathFragments, fileName);
        return new LocalFile(path, name, contentType, () => unlink(path).then(() => folder ? rmdir(folder).catch(console.error) : void 0 , console.error));
    }

    protected async deleteFile(path: string) {
        if (!path.startsWith(this.root)) {
            return;
        }
        if (existsSync(path)) {
            await unlink(path);
        }
        for(;;) {
            const parsed = parse(path);
            if (parsed.dir === this.root) {
                break;
            }
            path = parsed.dir;
            try {
                if (existsSync(path)) {
                    // check if folder is empty...
                    if(await this.isEmptyDir(path)) {
                        await rmdir(path);
                    }
                }
            } catch (error) {
                console.error(error);
                return;
            }
        }
    }

    protected async isEmptyDir(path) {
        try {
            const directory = await opendir(path);
            const entry = await directory.read();
            await directory.close();
            return entry === null; // It's empty if the first entry read is null
        } catch (error) {
            // Catches errors like 'ENOENT' (directory doesn't exist)
            // and treats the path as effectively "empty" for the purpose of the check.
            // Adjust error handling as needed for your specific use case.
            return true;
        }
    }

    protected async clean() {

        if (!await RunOnce.canRun(this.root)) {
            setTimeout(() => this.clean().catch(console.error), 60000);
            return;
        }

        const start = Date.now();
        let total = 0;

        const min = this.minAge;

        let all = null as { time, path, size  }[];
        let freeSize = 0;
        let deleted = 0;

        for(let i=this.maxAge;i>= min;i--) {
            const s = await fsp.statfs(this.root);
            freeSize = s.bavail * s.bsize;

            if (freeSize >= this.minSize) {
                break;
            }
            all ??= await this.getFileStats();
            try {
                const keep = Date.now() - this.keepTTLSeconds * 1000 * i;
                const pending = [];
                for (const file of all) {
                    if (file.time < keep) {
                        await this.deleteFile(file.path);
                        deleted++;
                        total += file.size;
                        continue;
                    }
                    pending.push(file);
                }
                all = pending;
                if(!all.length) {
                    break;
                }
            } catch (error) {
                console.error(error);
            }
        }

        if (total) {
            console.log(`${this.root} (${deleted}/${all.length + deleted}) cleaned, ${toKMBString(total)} freed in ${Date.now()-start}ms.`);
        } else {
            if (all?.length) {
                if (this.minSize === Number.MAX_SAFE_INTEGER) {
                    console.log(`Cleaning ${this.root} with entries (${all.length}) for ${Date.now()-start}ms.`);
                } else {
                    console.log(`Cleaning ${this.root} with entries (${all.length}) for ${Date.now()-start}ms as ${toKMBString(freeSize)} < ${toKMBString(this.minSize)}.`);
                }
            }
        }

        setTimeout(() => this.clean().catch(console.error), 60000);

    }

    private async getFileStats() {
        const min = Date.now() - this.minAge * this.keepTTLSeconds * 1000;
        const files = [] as { path: string, size: number, time: number }[];
        const dir = await fsp.opendir(this.root, { recursive: true });
        for await (const entry of dir) {
            if (!entry.isFile()) {
                continue;
            }
            const f = join(entry.parentPath, entry.name);
            const s = await stat(f);
            const time = s.ctimeMs;
            if (time > min) {
                continue;
            }
            files.push({ path: f, size: s.size, time });
        }
        return files;
    }

    // private async getFilesToDelete(oldest: number) {
    //     const dir = await fsp.opendir(this.root, { recursive: true });
    //     const filesToDelete = [] as { path: string, statInfo: Stats }[];
    //     try {
    //         for await (const entry of dir) {
    //             if (!entry.isFile()) {
    //                 continue;
    //             }
    //             const path = join(entry.parentPath, entry.name);
    //             try {
    //                 const statInfo = await stat(path);
    //                 if (statInfo.ctimeMs < oldest) {
    //                     filesToDelete.push({ path, statInfo });
    //                     if (filesToDelete.length === 1000) {
    //                         break;
    //                     }
    //                 }
    //             } catch (error) {
    //                 // file may not exist anymore...
    //             }
    //         }
    //     } catch (error) {
    //         console.error(error);
    //     } finally {
    //         try {
    //             await dir.close();
    //         } catch {
    //             // do nothing
    //         }
    //     }
    //     return filesToDelete;
    // }


}