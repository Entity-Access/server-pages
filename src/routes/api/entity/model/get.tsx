import Inject from "@entity-access/entity-access/dist/di/di.js";
import EntityContext from "@entity-access/entity-access/dist/model/EntityContext.js";
import Page from "../../../../Page.js";
import ModelService from "../../../../services/ModelService.js";
import { Prepare } from "../../../../decorators/Prepare.js";

export default class extends Page {

    @Inject
    db: EntityContext;

    run() {
        return this.json(ModelService.getModel(this.db), 4);
    }

}
