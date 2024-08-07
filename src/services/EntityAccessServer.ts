/* eslint-disable no-console */
import SchemaRegistry from "@entity-access/entity-access/dist/decorators/SchemaRegistry.js";
import EntityContext from "@entity-access/entity-access/dist/model/EntityContext.js";
import { StringHelper } from "./StringHelper.js";
import EntityQuery from "@entity-access/entity-access/dist/model/EntityQuery.js";
import GraphService from "./GraphService.js";
import ExternalQuery from "../decorators/ExternalQuery.js";
import EntityAccessError from "@entity-access/entity-access/dist/common/EntityAccessError.js";
import { FilteredExpression } from "@entity-access/entity-access/dist/model/events/FilteredExpression.js";
import type { IEntityQuery } from "@entity-access/entity-access/dist/model/IFilterWithParameter.js";
import { SessionUser } from "../core/SessionUser.js";

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
    start: number;
    size: number;
    split: boolean;
    trace: boolean;
    cache: number;
    count: boolean;
    function: string;
    args: string | any[];
    traceFunc?(text: string);
};

export default class EntityAccessServer {

    public static async query(
        db: EntityContext,
        options: IEntityQueryOptions,
        user: SessionUser) {

        db.verifyFilters = true;
        db.raiseEvents = true;

        const {
            entity: name,
            start = 0,
            size = 100,
            trace,
            function: queryFunction
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
            args = JSON.parse(args);
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

        let q: IEntityQuery<any>;

        if (queryFunction) {
            q = events[queryFunction](... args);
            if ((q as any).then) {
                q = await q;
            }
            q = FilteredExpression.markAsFiltered(q);
        } else {
            q = events.filter(db.query(entityClass));
            if ((q as any).then) {
                q = await q;
            }
        }

        if (methods) {
            for (const [method, code, ... methodArgs] of methods) {
                const p = {};
                if (method === "include") {
                    q = q[method](code);
                    continue;
                }
                const arrow = replaceArgs(code, p, methodArgs);
                q = q[method](p, `(p) => ${arrow}`);
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

        if (count) {
            const total = await oq.count();
            if (trace) {
                q = q.trace(console.log);
            }
            return GraphService.prepareGraph({
                total,
                items: await q.toArray()
            }, user);
        }

        if (trace) {
            q = q.trace(console.log);
        }
        return GraphService.prepareGraph({
            total: 0,
            items: await q.toArray()
        }, user);

    }

}
