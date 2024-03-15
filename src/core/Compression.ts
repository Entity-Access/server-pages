import { deflateSync, gzipSync } from "zlib";

export default class Compression {

    public static gzip(data: Buffer | string) {
        if (typeof data === "string") {
            data = Buffer.from(data, "utf-8");
        }
        return gzipSync(data);
    }

    public static deflate(data: Buffer | string) {
        if (typeof data === "string") {
            data = Buffer.from(data, "utf-8");
        }
        return deflateSync(data);
    }

}