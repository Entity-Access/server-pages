import Inject from "@entity-access/entity-access/dist/di/di.js";
import Page from "../../../../../Page.js";
import EntityAccessServer from "../../../../../services/EntityAccessServer.js";
import { Prepare } from "../../../../../decorators/Prepare.js";
import { Route } from "../../../../../core/Route.js";
import SessionSecurity from "../../../../../services/SessionSecurity.js";
import EntityAccessError from "@entity-access/entity-access/dist/common/EntityAccessError.js";
import AppDbContext from "../../../../../core/AppDbContext.js";

@Prepare.authorize
@Prepare.parseJsonBody
export default class extends Page {

    @Inject
    db: AppDbContext;

    @Route
    entity: string;

    @Inject
    sessionSecurity: SessionSecurity;

    async run() {
        const { entity } = this;

        const { method } = this.request;

        if (!/^(get|post)$/i.test(method)) {
            throw new EntityAccessError(`Invalid method ${method}`);
        }

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
