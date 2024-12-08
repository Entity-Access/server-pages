import Inject from "@entity-access/entity-access/dist/di/di.js";
import EntityContext from "@entity-access/entity-access/dist/model/EntityContext.js";
import Page from "../../../../Page.js";
import ModelService from "../../../../services/ModelService.js";
import Content from "../../../../Content.js";

export default class extends Page {

    @Inject
    db: EntityContext;

    run() {

        return Content.text(
            ModelService.getModelDeclaration(this.db), {
                headers: {
                    "content-type": "text/typescript; charset=utf8"
                }
            });
    }

}
