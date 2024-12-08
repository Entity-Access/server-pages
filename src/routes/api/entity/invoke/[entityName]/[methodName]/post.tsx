import Inject from "@entity-access/entity-access/dist/di/di.js";
import Page from "../../../../../../Page.js";
import { Prepare } from "../../../../../../decorators/Prepare.js";
import EntityContext from "@entity-access/entity-access/dist/model/EntityContext.js";
import SchemaRegistry from "@entity-access/entity-access/dist/decorators/SchemaRegistry.js";
import EntityAccessError from "@entity-access/entity-access/dist/common/EntityAccessError.js";
import ExternalInvoke from "../../../../../../decorators/ExternalInvoke.js";
import { Route } from "../../../../../../core/Route.js";
import Content from "../../../../../../Content.js";
import DbJsonReadable from "../../../../../../services/DbJsonService.js";

export default class extends Page {

    @Inject
    private db: EntityContext;

    @Route
    entityName: string;

    @Route
    methodName: string;
   
    async run() {

        const {entityName, methodName} = this;

        const entityClass = SchemaRegistry.classForName(entityName);

        if (!entityClass) {
            return;
        }

        await Prepare.parseJsonBody(this);
        await Prepare.authorize(this);


        const events = this.db.eventsFor<object>(entityClass, true);

        if(!ExternalInvoke.isExternal(events, methodName)) {
            throw new EntityAccessError(`${methodName} is not marked as an externally invokable method`);
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

        where = `(p) => (x) => ${where}`;

        // use must have read privilege at least
        const e = await events.filter(this.db.model.register<object>(entityClass).where(entity, where as any))
            .firstOrFail();

        // now execute external method
        const result = await events[methodName](e, ... args);

        if (result instanceof Content) {
            return result;
        }

        // return this.json(
        //     result
        //         ? GraphService.prepareGraph(result, this.sessionUser)
        //         : {});
        if (!result) {
            return Content.text("{}", {
                headers: {
                    "content-type": "application/json"
                }
            });
        }

        return DbJsonReadable.toJson(this.db, result);
        
    }
}