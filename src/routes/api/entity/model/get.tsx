import Inject from "@entity-access/entity-access/dist/di/di.js";
import Page from "../../../../Page.js";
import ModelService from "../../../../services/ModelService.js";
import AppDbContext from "../../../../core/AppDbContext.js";

export default class extends Page {

    @Inject
    db: AppDbContext;

    run() {
        return this.json(ModelService.getModel(this.db), 4);
    }

}
