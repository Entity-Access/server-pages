import Inject from "@entity-access/entity-access/dist/di/di.js";
import { Prepare } from "../../../../../../decorators/Prepare.js";
import Page from "../../../../../../Page.js";
import { Route } from "../../../../../../core/Route.js";
import { ISqlType } from "@entity-access/entity-access/dist/decorators/ISqlType.js";
import IColumnSchema from "@entity-access/entity-access/dist/common/IColumnSchema.js";
import AppDbContext from "../../../../../../core/AppDbContext.js";

const typeFor = (dataType: ISqlType) => {
    switch(dataType) {
        case "Decimal":
        case "Double":
        case "Int":
        case "BigInt":
        case "Float":
            return "number";
        case "Boolean":
            return "boolean";
        case "DateTime":
        case "DateTimeOffset":
            return "DateTime";
        case "Geometry":
            return "string";
        case "ByteArray":
            return "any";
        case "JSON":
            return "any";
        case "JSONB":
            return "any";
        case "UUID":
            return "string";
        case "AsciiChar":
        case "Char":
            return "string";
    }
};

const encode = (x: IColumnSchema) => {
    x = { ... x, name: void 0};
    let t = JSON.stringify(x);
    for (const key in x) {
        if (Object.hasOwn(x, key)) {
            t = t.replace(`"${key}"`, key);
        }
    }
    const g = /(default\:\s*(\"([^\"]+)\"))/gm.exec(t);
    if (g) {
        t = t.replace(g[2], g[3]);
    }
    return t.replace(`"() => 1"`, `() => 1`);
}

@Prepare.authorize
export default class extends Page {

    @Inject
    db: AppDbContext;

    @Route
    schema: string;

    @Route
    table: string;

    async run() {
        this.sessionUser.ensureIsAdmin();

        const schema = await this.db.connection.automaticMigrations(this.db)
            .getSchema({ schema: this.schema, table: this.table} as any);

        const type = Array.from(schema.tables.entries())
            .find(([key, value]) => key.toLowerCase() === this.table.toLowerCase())
            [1];

        const columns = Array.from(type.values());

        for (const column of columns) {
            column.name = column.name.substring(0, 1).toLowerCase() + column.name.substring(1);
            if (!column.nullable) {
                delete column.nullable;
            } else {
                column.nullable = true;
            }
            if (!column.length) {
                delete column.length;
            }
            if (column.length <=0 ) {
                delete column.length;
            }
            if (!column.key) {
                delete column.key;
            } else {
                column.key = true;
            }
            if (!column.default) {
                delete column.default;
            }
            if (!column.computed) {
                delete column.computed;
            } else {
                column.computed = `() => 1`
            }
        }

        return this.content({
            body: columns.map((x)=> `\t@Column(${ encode(x) })\n\t${x.name}:${typeFor(x.dataType as ISqlType)};\n\n`).join("\n\n"),
            contentType: "text/plain"
        });

    }

}