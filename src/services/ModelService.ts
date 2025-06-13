import { IColumn, IEntityRelation } from "@entity-access/entity-access/dist/decorators/IColumn.js";
import EntityType from "@entity-access/entity-access/dist/entity-query/EntityType.js";
import IndentedStringWriter from "./IndentedStringWriter.js";
import DateTime from "@entity-access/entity-access/dist/types/DateTime.js";
import { IClassOf } from "@entity-access/entity-access/dist/decorators/IClassOf.js";
import EntityEvents from "@entity-access/entity-access/dist/model/events/EntityEvents.js";
import ExternalQuery from "../decorators/ExternalQuery.js";
import ExternalInvoke from "../decorators/ExternalInvoke.js";
import AppDbContext from "../core/AppDbContext.js";

const modelProperties = Symbol("modelProperty");

const toJson = (x) => JSON.stringify(x, void 0, 4);

interface IModelProperty {
    type?: string;
    name?: string;
    enum?: readonly string[];
    help?: string;
    ignore?: boolean;
    readonly?: boolean;
}

interface IModelProperties {
    [key: string]: IModelProperty;
}

export function JsonProperty(mp: IModelProperty = {}) {
    return (target, name) => {
        mp.type ??= (Reflect as any).getMetadata("design:type", target, name);
        mp.name ??= name;
        (target[modelProperties] ??= {})[name] = mp;;
    };
}

export const IgnoreJsonProperty=  JsonProperty({ ignore: true });

export const ReadOnlyJsonProperty =  JsonProperty({ readonly: true });

export interface IEntityKey {
    name: string;
    type: string;
    dataType?: string;
    length?: number;
}

export interface IEntityPropertyInfo extends IEntityKey {
    isNullable?: boolean;
}

export interface IEntityNavigationProperty extends IEntityKey {
    isCollection?: boolean;
}

export interface IEntityModel {
    name?: string;
    keys?: IEntityKey[];
    properties?: IEntityPropertyInfo[];
    navigationProperties?: IEntityNavigationProperty[];
}

const columnFrom = (c: IColumn): IEntityPropertyInfo => {
    const type = c.type?.name ?? c.type.toString();
    const length = c.length;
    const dataType = c.dataType;
    return {
        name: c.name,
        type,
        dataType,
        length,
        isNullable: !!c.nullable
    };
};

const relationFrom = (r: IEntityRelation): IEntityNavigationProperty => {
    return {
        name: r.name,
        isCollection: r.isCollection,
        type: r.relatedEntity.entityName
    };
};

const modelFrom = (type: EntityType): IEntityModel => {
    const model: IEntityModel = {
        name: type.entityName,
        keys: type.keys.map(columnFrom),
        properties: type.columns.map(columnFrom),
        navigationProperties: type.relations.map(relationFrom)
    };
    return model;
};

const getJSType = (column: { type?: any, enum?: readonly string[], dataType?: string}) => {
    const { type, enum: enumValues, dataType } = column;
    if (enumValues) {
        return enumValues.map((x) => toJson(x)).join(" | ");
    }
    switch(type) {
        case Number:
            return "number";
        case BigInt:
            return "bigint";
        case String:
            return "string";
        case Boolean:
            return "boolean";
        case Date:
        case DateTime:
            return "DateTime";
    }
    if (dataType === "Geometry") {
        return "IGeometry";
    }
    if (typeof type == "function") {
        const mps = type.prototype[modelProperties];
        if (mps) {
            return `{ ${ Object.entries<IModelProperty>(mps).map(([key, p]) => `${key}?: ${getJSType(p)}`).join(";") } }`;
        }
        return type.name;
    }
    return "any";
};

const getDefaults = (column: IColumn): [string, any] => {
    if (column.generated) {
        return;
    }
    if (column.key) {
        return;
    }
    if (column.fkRelation) {
        return;
    }
    const { type, enum: enumValues } = column;
    if (enumValues) {
        return [ column.name,  toJson(enumValues[0])];
    }
    switch(type) {
        case Number:
            return [column.name, "0"];
        case BigInt:
            return [column.name, "0n"];
        case String:
            return [column.name, `""`];
        case Boolean:
            return [column.name, "false"];
        case Date:
            return [column.name, "new DefaultFactory(() => new Date())"];
        case DateTime:
            return [column.name, "new DefaultFactory(() => new DateTime())"];
    }
    return;
};

const fixRelatedSchemas = (schema) => {
    for (const key in schema) {
        if (Object.prototype.hasOwnProperty.call(schema, key)) {
            const element = schema[key];
            if (!element.name) {
                continue;
            }

            const { relations } = element.schema;
            if (!relations) {
                continue;
            }
            for (const iterator of relations) {
                iterator.relatedModel = schema[iterator.relatedName];
            }
        }
    }
};

function* allKeys(obj) {

    let start = obj;
    while(start) {
        for (const k in Object.getOwnPropertyDescriptors(start)) {
            if (k !== "constructor") {
                yield k;
            }
        }
        start = Object.getPrototypeOf(start);
        if (start === Object.prototype) {
            break;
        }
    }

};

export default class ModelService {

    public static ignore(t: IClassOf<any>, key: string) {
        return (t.prototype?.[modelProperties] as IModelProperties)?.[key]?.ignore;
    }

    public static getSchema(type: EntityType, events: EntityEvents<any>) {
        let queries = void 0;
        let actions = void 0;

        if (events) {
            for (const key of allKeys(events)) {
                if(ExternalQuery.isExternal(events, key)) {
                    (queries ??= {})[key] = "external";
                }
                if(ExternalInvoke.isExternal(events, key)) {
                    (actions ??= {})[key] = "external";
                }
            }
        }

        return {
            name: type.name,
            keys: type.keys.map((k) => ({
                name: k.name,
                type: getJSType({ type: k.type, dataType: k.dataType }),
                generated: k.generated,
                dataType: k.dataType,
                length: k.length,
                default: getDefaults(k)
            })),
            properties: type.nonKeys.map((k) => ({
                name: k.name,
                type: getJSType({ type: k.type, dataType: k.dataType }),
                generated: k.generated,
                dataType: k.dataType,
                length: k.length,
                default: getDefaults(k)
            })),
            relations: type.relations.map((r) => ({
                name: r.name,
                fkMap: r.fkMap?.map((f) => ({
                    fk: f.fkColumn.name,
                    relatedKey: f.relatedKeyColumn.name
                })),
                isCollection: r.isCollection,
                isInverse: r.isInverseRelation,
                relatedName: r.relatedEntity.entityName
            })),
            queries,
            actions
        };
    }

    public static getModel(context: AppDbContext) {
        const model = [] as IEntityModel[];

        for (const [type] of context.model.sources) {
            const entityType = context.model.getEntityType(type);
            model.push(modelFrom(entityType));
        }
        return model;
    }

    public static getModelDeclaration(context: AppDbContext) {
        const writer = new IndentedStringWriter("\t");
        writer.writeLine(`import DateTime from "@web-atoms/date-time/dist/DateTime";
            import type IClrEntity from "@web-atoms/entity/dist/models/IClrEntity";
            import { ICollection, IGeometry, IModel, Model, DefaultFactory } from "@web-atoms/entity/dist/services/BaseEntityService";
            export type IGeometryType = IGeometry;
        `);

        writer.writeLine(`
        export const modelEntitySchemas = {};
        `);

        for (const [type] of context.model.sources) {
            const entityType = context.model.getEntityType(type);

            const entityName = entityType.entityName;
            const name = entityType.typeClass.name;

            const defaults = [] as string[];

            writer.writeLine(`export interface I${name} extends IClrEntity {`);
            writer.indent++;

            const enums = [] as string[];

            const set = new Set<string>();

            const keys = [] as string[];

            const mps = type.prototype[modelProperties] as IModelProperties;
            for (const column of entityType.columns) {

                if (column.key) {
                    keys.push(column.name);
                }

                set.add(column.name);

                const jsonProperties = mps?.[column.name];

                if (jsonProperties?.ignore) {
                    continue;
                }

                const isReadonly = column.generated || jsonProperties?.readonly ? " readonly " : "";

                if (jsonProperties?.help) {
                    writer.writeLine(`/** ${jsonProperties.help} */`);
                }

                if (column.enum) {
                    enums.push(`export const ${name}${column.name[0].toUpperCase()}${column.name.substring(1)}Array = ${toJson(column.enum.map((x) => ({label: x, value: x})))};`);
                }
                const jsType = getJSType(column);
                if (column.nullable) {
                    writer.writeLine(`${isReadonly}${column.name}?: ${jsType} | null;`);
                } else {
                    writer.writeLine(`${isReadonly}${column.name}?: ${jsType};`);
                    const defs = getDefaults(column);
                    if (defs) {
                        const [k, v] = defs;
                        defaults.push(`${k}: ${v}`);
                    }
                }
            }

            // additional model properties...
            if (mps) {
                for (const [key, property] of Object.entries(mps)) {
                    if (set.has(key)) {
                        continue;
                    }
                    const jsType = getJSType(property);
                    if (property.help) {
                        writer.writeLine(`/** ${property.help} */`);
                    }
                    writer.writeLine(`${key}?: ${jsType};`);
                }
            }

            for (const relation of entityType.relations) {
                if (relation.isCollection) {
                    writer.writeLine(`${relation.name}?: ICollection<I${relation.relatedTypeClass.name}>;`);
                } else {
                    writer.writeLine(`${relation.name}?: I${relation.relatedTypeClass.name};`);
                }
            }
            writer.indent--;
            writer.writeLine(`}`);

            writer.writeLine();
            if (enums.length) {
                for (const iterator of enums) {
                    writer.writeLine(iterator);
                }
                writer.writeLine();
            }

            const events = context.eventsFor(entityType.typeClass, false);

            const schema = this.getSchema(entityType, events);
            let queries = ",any";
            if (schema.queries) {
                queries = "," + toJson(schema.queries);
            }
            let actions = ",any";
            if (schema.actions) {
                actions = "," + toJson(schema.actions);
            }

            writer.writeLine(`export const ${name}: IModel<I${name}${queries}${actions}> = new Model<I${name}>(
                            "${entityName}",
                            ${toJson(keys)},
                            { ${defaults.join(",")} },
                            ${toJson(schema)}
                        );`);

            writer.writeLine(`modelEntitySchemas["${name}"] = ${name};`)
            writer.writeLine();
        }

        writer.writeLine(`const fixRelatedSchemas = ${fixRelatedSchemas};
        fixRelatedSchemas(modelEntitySchemas);
        `)

        return writer.toString();
    }

}
