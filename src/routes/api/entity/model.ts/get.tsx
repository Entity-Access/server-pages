import Inject from "@entity-access/entity-access/dist/di/di.js";
import Page from "../../../../../page/Page.js";
import SocialMailContext from "../../../../../server/model/SocialMailContext.js";
import ModelService from "../../../../../ea-server/ModelService.js";

export default class extends Page {

    @Inject
    db: SocialMailContext;

    all(params: any) {

        return this.content(ModelService.getModelDeclaration(this.db), 200, "text/typescript");
    }

}
