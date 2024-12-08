import { Readable } from "stream";

export default class Utf8Readable {

    static from(text: Iterable<string>) {
        return Readable.from( this.toUtf8Iterable(text));
    }

    private static *toUtf8Iterable(text: Iterable<string>) {
        for (const element of text) {
            yield Buffer.from(element, "utf8");
        }
    }

}