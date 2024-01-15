import Inject from "@entity-access/entity-access/dist/di/di.js";
import SchemaRegistry from "@entity-access/entity-access/dist/decorators/SchemaRegistry.js";
import EntityContext from "@entity-access/entity-access/dist/model/EntityContext.js";
import Page from "../../Page.js";

export default class extends Page {

    @Inject
    context: EntityContext;

    async all(params: any) {

        const name = this.childPath[0];

        const entityClass = SchemaRegistry.classForName(name);

        if (!entityClass) {
            return this.notFound();
        }

        const events = this.context.eventsFor(entityClass, true);

        const q = events.filter(this.context.query(entityClass));

        // apply further methods...

        return this.json({
            entity: this.childPath[0]
        });
    }

}
