import Inject from "@entity-access/entity-access/dist/di/di.js";
import EntityContext from "@entity-access/entity-access/dist/model/EntityContext.js";
import { Route } from "../../../../../../../core/Route.js";
import { Prepare } from "../../../../../../../decorators/Prepare.js";
import Page from "../../../../../../../Page.js";
import EntityAccessServer from "../../../../../../../services/EntityAccessServer.js";
import SessionSecurity from "../../../../../../../services/SessionSecurity.js";
import SchemaRegistry from "@entity-access/entity-access/dist/decorators/SchemaRegistry.js";
import ExternalInvoke from "../../../../../../../decorators/ExternalInvoke.js";
import EntityAccessError from "@entity-access/entity-access/dist/common/EntityAccessError.js";

@Prepare.authorize
@Prepare.parseJsonBody
export default class extends Page {

    @Inject
    private db: EntityContext;

    @Route
    entity: string;

    @Route
    methodName: string;

    @Route
    keys: string;

    @Inject
    sessionSecurity: SessionSecurity;


    async run() {

        const {
            entity: entityName,
            methodName
        } = this;

        const entityClass = SchemaRegistry.classForName(entityName);

        if (!entityClass) {
            return;
        }

        let args;
        let key;

        const p = this.childPath;
        if (p.length > 0) {
            const [ k, ... a] = this.childPath;
            key = k;
            args = a;
        }  else {
            key = this.query.key;
            args = JSON.parse(this.query.args || "[]");
        }

        const keys = this.sessionSecurity.decryptKey(key);

        const events = this.db.eventsFor<object>(entityClass, true);

        if(!ExternalInvoke.isExternal(events, methodName)) {
            throw new EntityAccessError(`${methodName} is not marked as an externally invokable method`);
        }

        const entity = await this.db.model.register(entityClass).statements.select({}, keys);


        const cv = this.query.cv;
        const cache = this.query.cache;

        if (cv && cache) {
            this.cacheControl = `public, max-age=${cache}`;
        }

        return await EntityAccessServer.query(this.db, {
            entity,
            ... this.query,
            ... this.body,
            function: methodName,
            args: [ entity, ... args]
        });
    }

}
