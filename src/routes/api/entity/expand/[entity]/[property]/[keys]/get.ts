import Inject from "@entity-access/entity-access/dist/di/di.js";
import EntityContext from "@entity-access/entity-access/dist/model/EntityContext.js";
import Page from "../../../../../../../Page.js";
import EntityAccessServer from "../../../../../../../services/EntityAccessServer.js";
import { Prepare } from "../../../../../../../decorators/Prepare.js";
import { Route } from "../../../../../../../core/Route.js";
import SessionEncryption from "../../../../../../../services/SessionEncryption.js";
import SessionSecurity from "../../../../../../../services/SessionSecurity.js";

@Prepare.authorize
@Prepare.parseJsonBody
export default class extends Page {

    @Inject
    private db: EntityContext;

    @Route
    entity: string;

    @Route
    property: string;

    @Route
    keys: string;

    @Inject
    sessionSecurity: SessionSecurity;

    async run() {
        const { entity } = this;

        const { keys } = this;

        const expandKeys = this.sessionSecurity.decryptKey(keys);

        const { property: expand } = this;

        const cv = this.query.cv;
        const cache = this.query.cache;

        if (cv && cache) {
            this.cacheControl = `public, max-age=${cache}`;
        }

        return this.json(await EntityAccessServer.query(this.db, {
            entity,
            expand,
            expandKeys,
            ... this.query,
            ... this.body
        }, this.sessionUser));
    }

}
