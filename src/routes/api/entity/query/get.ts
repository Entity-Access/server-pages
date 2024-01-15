import Inject from "@entity-access/entity-access/dist/di/di.js";
import EntityContext from "@entity-access/entity-access/dist/model/EntityContext.js";
import Page from "../../../../Page.js";
import EntityAccessServer from "../../../../services/EntityAccessServer.js";

export default class extends Page {

    @Inject
    private db: EntityContext;

    async all(params: any) {
        const entity = this.childPath[0];
        return this.json(await EntityAccessServer.query(this.db, {
            entity,
            ... params
        }));
    }

}
