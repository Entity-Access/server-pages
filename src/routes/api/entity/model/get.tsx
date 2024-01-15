import Inject from "@entity-access/entity-access/dist/di/di.js";
import EntityContext from "@entity-access/entity-access/dist/model/EntityContext.js";
import Page from "../../../../Page.js";
import ModelService from "../../../../services/ModelService.js";

export default class extends Page {

    @Inject
    db: EntityContext;

    all(params: any) {

        return this.json(ModelService.getModel(this.db), 4);
    }

}
