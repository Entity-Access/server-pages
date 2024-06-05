import { IColumn, IEntityRelation } from "@entity-access/entity-access/dist/decorators/IColumn.js";
import SchemaRegistry from "@entity-access/entity-access/dist/decorators/SchemaRegistry.js";
import EntityType, { addColumnSymbol } from "@entity-access/entity-access/dist/entity-query/EntityType.js";
import EntityContext from "@entity-access/entity-access/dist/model/EntityContext.js";
import IndentedStringWriter from "./IndentedStringWriter.js";
import DateTime from "@entity-access/entity-access/dist/types/DateTime.js";
import { IClassOf } from "@entity-access/entity-access/dist/decorators/IClassOf.js";

const modelProperties = Symbol("modelProperty");

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
    return {
        name: c.name,
        type: c.type?.name ?? c.type.toString(),
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

const getJSType = (column: { type?: any, enum?: readonly string[]}) => {
    const { type, enum: enumValues } = column;
    if (enumValues) {
        return enumValues.map((x) => JSON.stringify(x)).join(" | ");
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
        return [ column.name,  JSON.stringify(enumValues[0])];
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

export default class ModelService {

    public static ignore(t: IClassOf<any>, key: string) {
        return (t.prototype?.[modelProperties] as IModelProperties)?.[key]?.ignore;
    }

    public static getSchema(type: EntityType) {
        return JSON.stringify({
            name: type.name,
            keys: type.keys.map((k) => ({
                name: k.name,
                type: getJSType({ type: k.type }),
                generated: k.generated,
                default: getDefaults(k)
            })),
            properties: type.nonKeys.map((k) => ({
                name: k.name,
                type: getJSType({ type: k.type }),
                generated: k.generated,
                default: getDefaults(k)
            })),
            relations: type.relations.map((r) => ({
                name: r.name,
                fkMap: r.fkMap?.map((f) => ({
                    fk: f.fkColumn.name,
                    relatedKey: f.relatedKeyColumn.name
                })),
                isCollection: r.isCollection,
                isInverse: r.isInverseRelation
            }))
        }, undefined, 2);
    }

    public static getModel(context: EntityContext) {
        const model = [] as IEntityModel[];

        for (const [type] of context.model.sources) {
            const entityType = context.model.getEntityType(type);
            model.push(modelFrom(entityType));
        }
        return model;
    }

    public static getModelDeclaration(context: EntityContext) {
        const writer = new IndentedStringWriter("\t");
        writer.writeLine(`import DateTime from "@web-atoms/date-time/dist/DateTime";
            import type IClrEntity from "@web-atoms/entity/dist/models/IClrEntity";
            import { ICollection, IGeometry, IModel, Model, DefaultFactory } from "@web-atoms/entity/dist/services/BaseEntityService";
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
                    enums.push(`export const ${name}${column.name[0].toUpperCase()}${column.name.substring(1)}Array = ${JSON.stringify(column.enum.map((x) => ({label: x, value: x})))};`);
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

            writer.writeLine(`export const ${name}: IModel<I${name}> = new Model<I${name}>(
                            "${entityName}",
                            ${JSON.stringify(keys)},
                            { ${defaults.join(",")} },
                            ${this.getSchema(entityType)}
                        );`);
            writer.writeLine();
        }

        return writer.toString();
    }

}
