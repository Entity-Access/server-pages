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
        const {
            entity: entityName,
            methodName
        } = this;

        const entityClass = SchemaRegistry.classForName(entityName)
            ?? EntityAccessError.throw(`Entity ${entityName} not found`);

        const events = this.db.eventsFor<object>(entityClass, true);

        if(!ExternalInvoke.isExternal(events, methodName)) {
            throw new EntityAccessError(`${methodName} is not marked as an externally invokable method`);
        }

        let args;
        let key;

        const p = this.childPath;
        if (p.length > 0) {
            const [ k, ... a] = this.childPath;
            key = k;
            args = a;
        }  else {
            key = this.body?.key ?? this.query.key;
            args = JSON.parse((this.body?.args ?? this.query.args) || "[]");
        }

        let entity;

        if (key) {
            const keys = this.sessionSecurity.decryptKey(key);
            entity = await this.db.model.register(entityClass).statements.select({}, keys);
        } else {
            const keys = this.body?.keys ?? this.query.keys;
            let where = "";
            const p = {};
            const entityType = this.db.model.getEntityType(entityClass);
            for (const { name } of entityType.keys) {
                const keyValue = keys[name];
                if (keyValue === void 0 || keyValue === null) {
                    throw new EntityAccessError(`All keys must be present`);
                }
                p[name] = keyValue;
                const condition = `x.${name} === p.${name}`;
                where = where
                    ? `${where} && ${condition}`
                    : condition;
            }
            entity = await this.db.filteredQuery(entityClass, "read")
                .where(p, `(p) => (x) => ${where}` as any)
                .first();
        }

        const cv = this.query.cv;
        const cache = this.query.cache;

        if (cv && cache) {
            this.cacheControl = `public, max-age=${cache}`;
        }



        // now execute external method
        const result = await events[methodName](entity, ... args);

        if (result instanceof Content) {
            return result;
        }

        if (!result) {
            return Content.text("{}", {
                contentType: "application/json"
            });
        }

        return JsonService.toJson(this.db, result);
    }

}
