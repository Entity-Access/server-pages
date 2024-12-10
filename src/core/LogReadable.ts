import { Readable } from "stream";

export default class LogReadable {

    static from(reader: Readable, log: (text) => void) {
        return Readable.from(this.iterate(reader, log));
    }

    static async *iterate(readable: Readable, log: (text) => void) {
        for await (const item of readable) {
            if (item instanceof Buffer) {
                log(item.toString("utf8"));
            } else {
                log(item);
            }
            yield item;
        }
    }
}