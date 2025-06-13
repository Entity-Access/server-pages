import Inject from "@entity-access/entity-access/dist/di/di.js";
import Page from "../../../../Page.js";
import ModelService from "../../../../services/ModelService.js";
import Content from "../../../../Content.js";
import AppDbContext from "../../../../core/AppDbContext.js";

export default class extends Page {

    @Inject
    db: AppDbContext;

    run() {

        return Content.text(
            ModelService.getModelDeclaration(this.db), {
                headers: {
                    "content-type": "text/typescript"
                }
            });
    }

}
