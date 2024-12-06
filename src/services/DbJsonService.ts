import JsonReadable from "@entity-access/entity-access/dist/common/JsonReadable.js";
import { JsonReaderResult } from "../Content.js";
import EntityContext from "@entity-access/entity-access/dist/model/EntityContext.js";

export default class DbJsonReadable extends JsonReadable {

    static toJson(db: EntityContext, item: any) {
        const js = new DbJsonReadable(db, item);
        return  new JsonReaderResult(js);
    }

    constructor(
        private readonly db: EntityContext,
        model: any) {
        super(model, db)
    }

    preJSON(item: any) {
        item = item.toJSON?.() ?? item;
        const eventClass = Object.getPrototypeOf(item)?.constructor;
        if (eventClass) {
            const events = this.db.eventsFor(eventClass, false);
            if (events) {
                item = events.preJson(item) ?? item;
            }
        }
        return item;
    }

}