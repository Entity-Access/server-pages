import Inject from "@entity-access/entity-access/dist/di/di.js";
import EntityContext from "@entity-access/entity-access/dist/model/EntityContext.js";
import Page from "../../../../Page.js";
import ModelService from "../../../../services/ModelService.js";

export default class extends Page {

    @Inject
    db: EntityContext;

    run() {

        return this.content(ModelService.getModelDeclaration(this.db), 200, "text/typescript");
    }

}
