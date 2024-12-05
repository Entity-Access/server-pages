import Inject from "@entity-access/entity-access/dist/di/di.js";
import EntityContext from "@entity-access/entity-access/dist/model/EntityContext.js";
import Page from "../../../../../../Page.js";
import { Route } from "../../../../../../core/Route.js";
import { Prepare } from "../../../../../../decorators/Prepare.js";
import EntityAccessServer from "../../../../../../services/EntityAccessServer.js";
import SessionEncryption from "../../../../../../services/SessionEncryption.js";
import EntityAccessError from "@entity-access/entity-access/dist/common/EntityAccessError.js";
import SchemaRegistry from "@entity-access/entity-access/dist/decorators/SchemaRegistry.js";
import { PageResult } from "../../../../../../Content.js";
import ExternalInvoke from "../../../../../../decorators/ExternalInvoke.js";
import GraphService from "../../../../../../services/GraphService.js";

@Prepare.authorize
@Prepare.parseJsonBody
export default class extends Page {

    @Inject
    private db: EntityContext;

    @Route
    entity: string;

    @Route
    methodName: string;

    async run() {
        const { entity: entityName } = this;

        const { args = "[]" } = this.query;

        let keys = this.query.key;

        const decryptKey = this.sessionUser.sessionID?.toString();

        if (keys.startsWith("e-")) {
            keys = decodeURIComponent(keys);
            keys = SessionEncryption.decrypt(keys, decryptKey);
        } else {
            keys = decodeURIComponent(keys);
            keys = keys.substring(2);
        }

        keys = JSON.parse(keys);

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

        const entity = this.db.model.register(entityClass).statements.select({}, keys);

        // now execute external method
        const result = await events[methodName](entity, ... args);

        if (result instanceof PageResult) {
            return result;
        }

        return this.json(
            result
                ? GraphService.prepareGraph(result, this.sessionUser)
                : {});
    }

}
