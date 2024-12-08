import Inject from "@entity-access/entity-access/dist/di/di.js";
import EntityContext from "@entity-access/entity-access/dist/model/EntityContext.js";
import Page from "../../../../../../Page.js";
import { Route } from "../../../../../../core/Route.js";
import { Prepare } from "../../../../../../decorators/Prepare.js";
import EntityAccessError from "@entity-access/entity-access/dist/common/EntityAccessError.js";
import SchemaRegistry from "@entity-access/entity-access/dist/decorators/SchemaRegistry.js";
import ExternalInvoke from "../../../../../../decorators/ExternalInvoke.js";
import JsonService from "../../../../../../services/DbJsonService.js";
import SessionSecurity from "../../../../../../services/SessionSecurity.js";
import Content from "../../../../../../Content.js";

@Prepare.authorize
@Prepare.parseJsonBody
export default class extends Page {

    @Inject
    private db: EntityContext;

    @Route
    entity: string;

    @Route
    methodName: string;

    @Inject
    sessionSecurity: SessionSecurity;

    async run() {
        const { entity: entityName } = this;

        const { args = "[]" } = this.query;

        const keys = this.sessionSecurity.decryptKey(this.query.key);

        const cv = this.query.cv;
        const cache = this.query.cache;

        if (cv && cache) {
            this.cacheControl = `public, max-age=${cache}`;
        }

        const { methodName} = this;

        const entityClass = SchemaRegistry.classForName(entityName);

        if (!entityClass) {
            return;
        }

        await Prepare.authorize(this);

        const events = this.db.eventsFor<object>(entityClass, true);

        if(!ExternalInvoke.isExternal(events, methodName)) {
            throw new EntityAccessError(`${methodName} is not marked as an externally invokable method`);
        }

        const entity = await this.db.model.register(entityClass).statements.select({}, keys);

        // now execute external method
        const result = await events[methodName](entity, ... args);

        if (result instanceof Content) {
            return result;
        }

        if (!result) {
            return Content.text("{}", {
                headers: {
                    "content-type": "application/json; charset=utf8"
                }
            });
        }

        return JsonService.toJson(this.db, result);
    }

}
