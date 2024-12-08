import Inject from "@entity-access/entity-access/dist/di/di.js";
import EntityContext from "@entity-access/entity-access/dist/model/EntityContext.js";
import Page from "../../../../../Page.js";
import EntityAccessServer from "../../../../../services/EntityAccessServer.js";
import { Prepare } from "../../../../../decorators/Prepare.js";
import { Route } from "../../../../../core/Route.js";

@Prepare.authorize
@Prepare.parseJsonBody
export default class extends Page {

    @Inject
    private db: EntityContext;

    @Route
    entity: string;

    async run() {
        const { entity } = this;

        const cv = this.query.cv;
        const cache = this.query.cache;

        if (cv && cache) {
            this.cacheControl = `public, max-age=${cache}`;
        }

        return await EntityAccessServer.query(this.db, {
            entity,
            ... this.query,
            ... this.body
        });
    }

}
