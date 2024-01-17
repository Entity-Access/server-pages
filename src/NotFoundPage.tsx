import Content from "./Content.js";
import Page from "./Page.js";

export default class NotFoundPage extends Page {

    run(): Content | Promise<Content> {
        return this.notFound();
    }

}
