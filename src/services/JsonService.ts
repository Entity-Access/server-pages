import JsonReadable from "@entity-access/entity-access/dist/common/JsonReadable.js";
import { JsonReaderResult } from "../Content.js";

export default class JsonService {
    static toJson(obj: any, sp: any) {
        const jsr = new JsonReadable(obj, sp);
        return new JsonReaderResult(jsr, 200);
    }
}