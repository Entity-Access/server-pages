import Inject from "@entity-access/entity-access/dist/di/di.js";
import { IPageResult } from "../../../../Content.js";
import Page from "../../../../Page.js";
import { Prepare } from "../../../../decorators/Prepare.js";
import EntityContext from "@entity-access/entity-access/dist/model/EntityContext.js";
import SchemaRegistry from "@entity-access/entity-access/dist/decorators/SchemaRegistry.js";
import External from "../../../../decorators/External.js";
import EntityAccessError from "@entity-access/entity-access/dist/common/EntityAccessError.js";

export default class extends Page {

    @Inject
    private db: EntityContext;
   
    async run() {

        const [entityName, methodName] = this.childPath as any[];

        const entityClass = SchemaRegistry.classForName(entityName);

        if (!entityClass) {
            return;
        }

        await Prepare.parseJsonBody(this);
        await Prepare.authorize(this);


        const events = this.db.eventsFor(entityClass, true);

        if(!External.isExternal(events, methodName)) {
            throw new EntityAccessError(`${methodName} is not marked as an external function`);
        }

        // body should contain entity and args
        const { entity, args = [] } = this.body;

        let where = "";
        for (const key of this.db.model.getEntityType(entityClass).keys) {
            where = where
                ? `${where} && x.${key.name} === p.${key.name}`
                : `x.${key.name} === p.${key.name}`
            const v = entity[key.name];
            if (v === void 0 || v === null) {
                throw new EntityAccessError(`Key ${key.name} is empty`);
            }
        }

        // use must have read priviledge atleast
        const e = await events.filter(this.db.model.register(entityClass).where(entity, where as any))
            .firstOrFail();

        // now execute external method
        const result = await events[methodName](e, ... args);

        return this.json(result ?? {});
    }
}