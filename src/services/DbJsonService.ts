import JsonGenerator from "@entity-access/entity-access/dist/common/JsonGenerator.js";
import EntityContext from "@entity-access/entity-access/dist/model/EntityContext.js";
import Content from "../Content.js";

export default class DbJsonReadable extends JsonGenerator {

    static toJson(db: EntityContext, item: any) {
        const js = new DbJsonReadable(db);
        const reader = js.reader(item);
        return  new Content({
            reader,
            headers: {
                "content-type": "application/json; charset=utf8"
            }
        });
    }

    constructor(
        private readonly db: EntityContext) {
        super(db)
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