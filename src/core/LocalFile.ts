import { createReadStream, createWriteStream, existsSync, read, statSync, openSync } from "fs";
import * as fs from "fs";
import { basename  } from "path";
import mime from "mime-types";
import internal, { Readable, Stream, Writable } from "stream";
import { appendFile, copyFile, open, readFile, writeFile } from "fs/promises";

export class LocalFile implements AsyncDisposable {

    public readonly contentType: string;

    public readonly fileName: string;

    public get exists() {
        return existsSync(this.path);
    }

    public get isEmpty() {
        if (this.exists) {
            const s = statSync(this.path);
            return s.size <= 0;
        }
        return true;
    }

    public get contentSize() {
        if (!this.exists) {
            return 0;
        }
        const s = statSync(this.path);
        return s.size;
    }

    constructor(public readonly path: string, name?: string, mimeType?: string, private onDispose?: () => void) {
        this.fileName = name ?? basename(path);
        this.contentType = (mimeType || mime.lookup(this.fileName)) || "application/octet-stream";
    }

    async [Symbol.asyncDispose]() {
        return this.onDispose?.();
    }

    public copyTo(dest: LocalFile) {
        return copyFile(this.path, dest.path);
    }

    public openRead(): Stream {
        return createReadStream(this.path);
    }

    public openReadStream(): internal.Readable {
        return createReadStream(this.path);
    }

    public openWrite(): Stream {
        return createWriteStream(this.path);
    }

    public async appendLine(line: string) {
        await appendFile(this.path, line + "\n");
        return this;
    }

    public async readAsText() {
        return await readFile(this.path, "utf-8");
    }

    public async readAsBuffer() {
        return await readFile(this.path, { flag: "r" });
    }

    public async writeTo(writable: Writable, start?: number, end?: number) {
        const readable = createReadStream(this.path, { start, end });
        return new Promise((resolve, reject) => {
            readable.pipe(writable, { end: true })
                .on("finish", resolve)
                .on("error", reject);
        });
    }

    public async delete() {
        return this.onDispose?.();
    }

    public writeAllText(text: string) {
        return writeFile(this.path, text);
    }

    public writeAll(buffer: string | Buffer | internal.Readable | Stream) {
        return writeFile(this.path, buffer);
    }

    public async *lines() {
        let line = "";
        const trimEndR = (t: string) => {
            if (t.endsWith("\r")) {
                return t.substring(0, t.length - 1);
            }
            return t;
        };
        for await(const buffer of this.readBuffers(4 * 1024 * 1024)) {
            let start = 0;
            do {

                const index = buffer.indexOf("\n", start);
                if (index === -1) {
                    line += buffer.toString("utf-8", start);
                    break;
                }

                yield trimEndR(line + buffer.toString("utf-8", start, index));
                start = index + 1;
                line = "";
            } while (true);
        }
        line = trimEndR(line);
        if (line) {
            yield line;
        }
    }

    public async *readBuffers(bufferSize = 16 * 1024 * 1024, signal?: AbortSignal) {
        const size = this.contentSize;
        let buffer = Buffer.alloc(bufferSize);
        for (let offset = 0; offset < size; offset += bufferSize) {
            const length = ((offset + bufferSize) > size )
                ? (size - offset)
                : bufferSize;
            let fd = await open(this.path);
            try {
                if (signal?.aborted) {
                    throw new Error("aborted");
                }
                if (buffer.length !== length) {
                    buffer = Buffer.alloc(length);
                }
                await fd.read({ position: offset, length, buffer });
                await fd.close();
                fd = null;
                yield buffer;
            } finally {
                if (fd) {
                    await fd.close();
                }
            }
        }
    }
}
