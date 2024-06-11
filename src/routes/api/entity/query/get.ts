import Inject from "@entity-access/entity-access/dist/di/di.js";
import EntityContext from "@entity-access/entity-access/dist/model/EntityContext.js";
import Page from "../../../../Page.js";
import EntityAccessServer from "../../../../services/EntityAccessServer.js";
import { Prepare } from "../../../../decorators/Prepare.js";

@Prepare.authorize
@Prepare.parseJsonBody
export default class extends Page {

    @Inject
    private db: EntityContext;

    async run() {
        const entity = this.childPath[0];

        const cv = this.query.cv;
        const cache = this.query.cache;

        if (cv && cache) {
            this.cacheControl = `public, max-age=${cache}`;
        }

        return this.json(await EntityAccessServer.query(this.db, {
            entity,
            ... this.query,
            ... this.body
        }, this.sessionUser));
    }

}
