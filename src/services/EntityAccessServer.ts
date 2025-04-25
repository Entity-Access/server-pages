/* eslint-disable no-console */
import SchemaRegistry from "@entity-access/entity-access/dist/decorators/SchemaRegistry.js";
import EntityContext from "@entity-access/entity-access/dist/model/EntityContext.js";
import { StringHelper } from "./StringHelper.js";
import ExternalQuery from "../decorators/ExternalQuery.js";
import EntityAccessError from "@entity-access/entity-access/dist/common/EntityAccessError.js";
import { FilteredExpression } from "@entity-access/entity-access/dist/model/events/FilteredExpression.js";
import type { IEntityQuery, IOrderedEntityQuery } from "@entity-access/entity-access/dist/model/IFilterWithParameter.js";
import { SessionUser } from "../core/SessionUser.js";
import DbJsonService from "./DbJsonService.js";
import { ServiceProvider } from "@entity-access/entity-access/dist/di/di.js";
import SessionSecurity from "./SessionSecurity.js";

export type IQueryMethod = [string, string, ... any[]];

const replaceArgs = (code: string, p: any, args: any[]) => {
    let index = 0;
    for (const iterator of args) {
        const name = "p" + index;
        code = StringHelper.replaceAll(code, "@" + index, "p." + name);
        p[name] = iterator;
        index++;
    }
    return StringHelper.replaceAll(code, "Sql_1.Sql", "Sql");
};

export interface IEntityQueryOptions {
    entity: string;
    methods: string | IQueryMethod[];
    navigation?: string;
    entityKey?: string;
    start: number;
    size: number;
    split: boolean;
    trace: boolean;
    cache: number;
    count: boolean;
    expandable?: boolean;
    function: string;
    args: string | any[];
    traceFunc?(text: string);
};

const allowedMethods = {
    where: 1,
    union: 1,
    exists: 1,
    select: 1,
    selectView: 1,
    include: 1,
    trace: 1,
    orderBy: 1,
    orderByDescending: 1,
    thenBy: 1,
    thenByDescending: 1,
    sum: 1,
    count: 1
};

export default class EntityAccessServer {

    public static async query(
        db: EntityContext,
        options: IEntityQueryOptions) {

        db.verifyFilters = true;
        db.raiseEvents = true;

        const {
            entity: name,
            start = 0,
            size = 100,
            trace,
            function: queryFunction,
            entityKey,
            navigation,
        } = options;
        let {
            count = false,
            methods,
            args = "[]"
        } = options;
        const entityClass = SchemaRegistry.classForName(name);

        if (!entityClass) {
            return;
        }

        if (typeof methods === "string") {
            methods = JSON.parse(methods);
        }

        if (typeof args === "string") {
            args = JSON.parse(args) as any[];
        }

        if (typeof count === "string") {
            count = count === "true";
        }

        const events = db.eventsFor(entityClass, true);

        if (queryFunction) {
            if(!ExternalQuery.isExternal(events, queryFunction)) {
                throw new EntityAccessError(`${queryFunction} is not marked as an external function`);
            }
        }

        if (entityKey && (queryFunction || navigation)) {
            const ss = ServiceProvider.resolve(db, SessionSecurity);
            const keys = ss.decryptKey(entityKey);
            const entity = (await db.model.register(entityClass).statements.select({}, keys))
                ?? EntityAccessError.throw(`Entity not found`);
            args.splice(0, 0, entity);
        }

        let q: IEntityQuery<any>;

        if (queryFunction) {
            q = events[queryFunction](... args);
            if ((q as any).then) {
                q = await q;
            }
            q = FilteredExpression.markAsFiltered(q);
        } else {
            if (navigation) {
                q = events.includeFilter( db.expand(entityClass, args[0], navigation as any), entityClass);
            } else {
                q = events.filter(db.query(entityClass));
                if ((q as any).then) {
                    q = await q;
                }
            }
        }

        const unions = [];
        const orderBy = [];
        const initialQuery = q;

        if (methods) {
            for (const [method, code, ... methodArgs] of methods) {
                if (!allowedMethods[method]) {
                    throw new EntityAccessError(`Invalid method name ${method} allowed methods are ${Object.keys(allowedMethods).join(",")}`)
                }
                const p = {};
                if (method === "include") {
                    q = q[method](code);
                    continue;
                }
                const arrow = replaceArgs(code, p, methodArgs);
                if (method === "union") {
                    unions.push(q);
                    q = initialQuery;
                }
                if (/^(order|then)By(Descending)?$/i.test(method)) {
                    orderBy.push(() => q = q[method](p, `(p) => ${arrow}`));
                    continue;
                }
                q = q[method](p, `(p) => ${arrow}`);
            }
        }

        if (unions.length) {
            q = q.unions(...unions);
        }

        if (orderBy) {
            for (const o of orderBy) {
                o();
            }
        }

        const oq = q;

        if (start > 0) {
            q = q.offset(start);
            count = true;
        }
        if (size > 0) {
            q = q.limit(size);
        }

        let items;


        if (count) {
            const total = await oq.slice().count();
            if (trace) {
                q = q.trace(console.log);
            }
            items = await q.toArray();
            return DbJsonService.toJson(db, {
                total,
                items
            });
        }

        if (trace) {
            q = q.trace(console.log);
        }
        items = await q.toArray();
        return DbJsonService.toJson(db, {
            total: 0,
            items
        });

    }

}
