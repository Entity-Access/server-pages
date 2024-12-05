import Inject from "@entity-access/entity-access/dist/di/di.js";
import EntityContext from "@entity-access/entity-access/dist/model/EntityContext.js";
import Page from "../../../../../../../Page.js";
import EntityAccessServer from "../../../../../../../services/EntityAccessServer.js";
import { Prepare } from "../../../../../../../decorators/Prepare.js";
import { Route } from "../../../../../../../core/Route.js";
import GraphService from "../../../../../../../services/GraphService.js";
import SessionEncryption from "../../../../../../../services/SessionEncryption.js";

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

    async run() {
        const { entity } = this;

        let { keys } = this;

        const decryptKey = this.sessionUser.sessionID?.toString();

        if (keys.startsWith("e-")) {
            keys = decodeURIComponent(keys);
            keys = SessionEncryption.decrypt(keys, decryptKey);
        } else {
            keys = decodeURIComponent(keys);
            keys = keys.substring(2);
        }

        const expandKeys = JSON.parse(keys);

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
