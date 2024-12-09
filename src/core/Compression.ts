import { Readable, Writable } from "stream";
import { createGzip, createDeflate } from "zlib";

export default class Compression {

    public static gzip(readable: Readable) {
        const stream = createGzip();
        return readable.pipe(stream);
    }

    public static deflate(readable: Readable) {
        const stream = createDeflate();
        return readable.pipe(stream);
    }

}