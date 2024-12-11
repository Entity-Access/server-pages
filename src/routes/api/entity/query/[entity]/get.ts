import Inject from "@entity-access/entity-access/dist/di/di.js";
import EntityContext from "@entity-access/entity-access/dist/model/EntityContext.js";
import Page from "../../../../../Page.js";
import EntityAccessServer from "../../../../../services/EntityAccessServer.js";
import { Prepare } from "../../../../../decorators/Prepare.js";
import { Route } from "../../../../../core/Route.js";
import SessionSecurity from "../../../../../services/SessionSecurity.js";
import SchemaRegistry from "@entity-access/entity-access/dist/decorators/SchemaRegistry.js";
import EntityAccessError from "@entity-access/entity-access/dist/common/EntityAccessError.js";

@Prepare.authorize
@Prepare.parseJsonBody
export default class extends Page {

    @Inject
    private db: EntityContext;

    @Route
    entity: string;

    @Inject
    sessionSecurity: SessionSecurity;

    async run() {
        const { entity } = this;

        const cv = this.query.cv;
        const cache = this.query.cache;

        if (cv && cache) {
            this.cacheControl = `public, max-age=${cache}`;
        }

        const p = {
            entity,
            ... this.query,
            ... this.body
        };

        return await EntityAccessServer.query(this.db, p);
    }

}
