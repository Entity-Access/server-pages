import SchemaRegistry from "@entity-access/entity-access/dist/decorators/SchemaRegistry.js";
import ModelService from "./ModelService.js";
import { ServiceProvider } from "@entity-access/entity-access/dist/di/di.js";
import { SessionUser } from "../core/SessionUser.js";

export default class GraphService {

    static init = Symbol("init");

    static toGraph = Symbol("toGraph");

    static appendToGraph = Symbol("toGraph");

    static prepareGraph(body, sp: SessionUser) {
        const r = this.prepare(body, new Map(), sp);
        return r;
    }

    private static prepare(body: any, visited: Map<any, any>, sp: SessionUser) {

        if (Array.isArray(body)) {
            const r = [];
            for (const iterator of body) {
                r.push(this.prepare(iterator, visited, sp));
            }
            return r;
        }

        if(!body) {
            return body;
        }

        if (typeof body !== "object") {
            return body;
        }

        if (body instanceof Date) {
            return body;
        }

        let $id = visited.get(body);
        if ($id) {
            return { $ref: $id };
        }
        $id = visited.size + 1;
        visited.set(body, $id);

        body[this.init]?.(sp);

        const appendToGraph = body[this.appendToGraph]?.() ?? {};

        const copy = {
            $id,
            ... appendToGraph
        };

        // check constructor
        const { constructor } = Object.getPrototypeOf(body);
        if(constructor !== Object) {
            copy["$type"] = SchemaRegistry.entityNameForClass(constructor);
        }

        body = body[this.toGraph]?.() ?? body;
        for (const key in body) {

            if (ModelService.ignore(constructor, key)) {
                continue;
            }

            if (Object.prototype.hasOwnProperty.call(body, key)) {
                const element = body[key];
                copy[key] = this.prepare(element, visited, sp);
                continue;
            }
            const e = body[key];
            switch(typeof e) {
                case "number":
                case "boolean":
                case "bigint":
                case "string":
                    copy[key] = e;
                    continue;
                case "object":
                    if (e instanceof Date) {
                        copy[key] = e;
                    }
                    continue;
            }
        }
        return copy;
    }
}