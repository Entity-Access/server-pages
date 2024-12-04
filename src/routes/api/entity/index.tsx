/* eslint-disable no-console */
import Inject from "@entity-access/entity-access/dist/di/di.js";
import EntityContext from "@entity-access/entity-access/dist/model/EntityContext.js";
import SchemaRegistry from "@entity-access/entity-access/dist/decorators/SchemaRegistry.js";
import EntityAccessError from "@entity-access/entity-access/dist/common/EntityAccessError.js";
import Page, { IRouteCheck } from "../../../Page.js";
import GraphService from "../../../services/GraphService.js";
import { Prepare } from "../../../decorators/Prepare.js";

const added = Symbol("added");

@Prepare.authorize
@Prepare.parseJsonBody
export default class extends Page {

    static canHandle(pageContext: IRouteCheck): boolean {
        return /post|patch|delete/i.test(pageContext.method);
    }

    @Inject
    private db: EntityContext;

    async run() {

        this.db.verifyFilters = true;
        this.db.raiseEvents = true;

        const body = this.body;

        if (/delete/i.test(this.method)) {
            return this.delete(body);
        }
        return this.save(body);
    }

    private async save(body: any) {
        if (Array.isArray(body)) {
            return this.saveMultiple(body);
        }
        body = await this.loadEntity(body);
        const options = {} as any;
        if (this.query.trace) {
            options.trace = console.log;
        }
        await this.db.saveChanges(options);
        return this.json(GraphService.prepareGraph(body, this.sessionUser));
    }

    private async saveMultiple(body: any[]) {
        // load copy...
        const result = [];
        for (const iterator of body) {
            result.push(await this.loadEntity(iterator));
        }
        const options = {} as any;
        if (this.query.trace) {
            options.trace = console.log;
        }
        await this.db.saveChanges(options);
        return this.json(GraphService.prepareGraph(result, this.sessionUser));
    }

    private async delete(body: any) {
        if (Array.isArray(body)) {
            for (const iterator of body) {
                iterator.$deleted = true;
            }
            return this.saveMultiple(body);
        }
        body.$deleted = true;
        return this.save(body);
    }

    private async loadEntity(body: any, type?: any) {

        if (body[added]) {
            return body;
        }

        if (!type) {
            type = body.$type;
            if (!type) {
                throw new Error(`Unable to load model without the type specified`);
            }
            type = SchemaRegistry.classForName(type);
        }

        // get entityType from type...
        const source = this.db.model.register<object>(type);
        const entityType = this.db.model.getEntityType(type);
        Object.setPrototypeOf(body, entityType.typeClass.prototype);
        body.$type = entityType.entityName;

        let operation = "modify";

        if (body.$deleted) {
            operation = "delete";
        }


        let hasAllKeys = true;

        let hasAutoGenerate = false;

        let where = "";
        const p = {};
        for (const { name , generated } of entityType.keys) {
            const keyValue = body[name];
            hasAutoGenerate ||= generated as any as boolean;
            if (keyValue === void 0 || keyValue === null) {
                hasAllKeys = false;
                continue;
            }
            if (typeof keyValue !== "string") {
                if(!keyValue) {
                    hasAllKeys = false;
                    continue;
                }
            }
            p[name] = body[name];
            const condition = `x.${name} === p.${name}`;
            where = where
                ? `${where} && ${condition}`
                : condition;
        }


        // const changes = { ... body };
        const changes = body;
        if(hasAllKeys) {

            const events = this.db.eventsFor<object>(type, true);
            let q = source.asQuery();
            if (operation === "delete") {
                q = events.delete(q);
            } else {
                q = events.modify(q);
            }

            const original = { ... body };

            // we will attach entity...
            const entry = this.db.changeSet.getEntry(body);

            const existing = await q.where(p, `(p) => (x) => ${where}` as any).first();
            if (!existing) {
                if (hasAutoGenerate) {
                    throw new EntityAccessError(`Unable to ${operation} ${type.name}`);
                }
            }
            if (existing) {
                entry.original = {};
                for(const c of entityType.columns) {
                    entry.original[c.name] = existing[c.name];
                }
                entry.status = "unchanged";
                if (operation === "delete") {
                    source.delete(existing);
                } else {
                    for (const key in original) {
                        if(Object.hasOwn(original, key)) {
                            const element = original[key];
                            body[key] = element;
                        }
                    }
                }
                body[added] = true;
            } else {
                // body = source.add(changes);
                entry.status = "inserted";
                body[added] = true;
            }
        } else {
            if (!body[added]) {
                body = source.add(body);
                body[added] = true;
            }
        }

        // load all relations...
        for (const key in changes) {
            if (Object.hasOwn(changes, key)) {
                const element = changes[key];
                const property = entityType.getProperty(key);
                if(!property.relation) {
                    // set value...
                    body[key] = element;
                    continue;
                }

                if(!element) {
                    continue;
                }

                // see what to with relation...
                if(Array.isArray(element)) {
                    const arrayCopy = [];
                    for (const iterator of element) {
                        arrayCopy.push(await this.loadEntity(iterator, property.relation.relatedTypeClass));
                    }
                    body[key] = arrayCopy;
                    continue;
                }

                // one to one key must be added here

                // if (body[key]) {
                //     continue;
                // }
                const related = await this.loadEntity(element, property.relation.relatedTypeClass);
                body[key] = related;
            }
        }

        if (operation === "delete") {
            source.delete(body);
        }

        return body;
    }
}
