import Content from "./Content.js";
import Page from "./Page.js";

export default class NotFoundPage extends Page {

    all(params: any): Content | Promise<Content> {
        return this.notFound();
    }

}
