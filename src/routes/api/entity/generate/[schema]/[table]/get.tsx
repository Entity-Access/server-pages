import Inject, { ServiceProvider } from "@entity-access/entity-access/dist/di/di.js";
import { Prepare } from "../../../../../../decorators/Prepare.js";
import Page from "../../../../../../Page.js";
import EntityContext from "@entity-access/entity-access/dist/model/EntityContext.js";
import { Route } from "../../../../../../core/Route.js";
import { ISqlType } from "@entity-access/entity-access/dist/decorators/ISqlType.js";

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

@Prepare.authorize
export default class extends Page {

    @Inject
    db: EntityContext;

    @Route
    schema: string;

    @Route
    table: string;

    async run() {
        this.sessionUser.ensureIsAdmin();

        const columns = await this.db.connection.getSchema(this.schema, this.table);

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
            if (!column.key) {
                delete column.key;
            } else {
                column.key = true;
            }
            if (!column.default) {
                delete column.default;
            }
        }

        return this.content({
            body: columns.map((x)=> `\t@Column(${ JSON.stringify(x) })\n\t${x.name}:${typeFor(x.dataType as ISqlType)};\n\n`).join("\n\n"),
            contentType: "text/plain"
        });
    }

}