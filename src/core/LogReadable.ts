import { Readable } from "stream";

export default class LogReadable {

    static from(reader: Readable, log: (text) => void) {
        return Readable.from(this.iterate(reader, log));
    }

    static async *iterate(readable: Readable, log: (text) => void) {
        let buffer = "";
        for await (const item of readable) {
            if (buffer.length < 4096) {
                if (item instanceof Buffer) {
                    buffer += item.toString("utf-8");
                } else {
                    buffer += item.toString();
                }
            }
            yield item;
        }
        log(buffer);
    }
}