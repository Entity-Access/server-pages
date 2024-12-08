import { Readable, Writable } from "stream";
import { createGzip, createDeflate } from "zlib";

export default class Compression {

    public static gzip(writable: Writable) {
        const stream = createGzip();
        return stream.pipe(writable);
    }

    public static deflate(writable: Writable) {
        const stream = createDeflate();
        return stream.pipe(writable);
    }

}