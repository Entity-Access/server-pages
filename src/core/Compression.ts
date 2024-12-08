import { Readable } from "stream";
import { createGzip, deflateSync, gzipSync, createDeflate } from "zlib";

export default class Compression {

    public static gzip(readable: Readable) {
        const stream = createGzip();
        return readable.pipe(stream);
    }

    public static deflate(readable: Readable) {
        const stream = createDeflate();
        return readable.pipe(stream);
    }

    public static gzipSync(data: Buffer | string) {
        if (typeof data === "string") {
            data = Buffer.from(data, "utf-8");
        }
        return gzipSync(data);
    }

    public static deflateSync(data: Buffer | string) {
        if (typeof data === "string") {
            data = Buffer.from(data, "utf-8");
        }
        return deflateSync(data);
    }

}