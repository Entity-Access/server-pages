import Inject from "@entity-access/entity-access/dist/di/di.js";
import EntityAccessServer from "../../../../../ea-server/EntityAccessServer.js";
import Content from "../../../../../page/Content.js";
import Page from "../../../../../page/Page.js";
import SocialMailContext from "../../../../../server/model/SocialMailContext.js";

export default class extends Page {

    @Inject
    private db: SocialMailContext;

    async all(params: any) {
        const entity = this.childPath[0];
        return this.json(await EntityAccessServer.query(this.db, {
            entity,
            ... params
        }));
    }

}
