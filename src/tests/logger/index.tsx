import Content from "../../Content.js";
import Page from "../../Page.js";
import HtmlDocument from "../../html/HtmlDocument.js";
import XNode from "../../html/XNode.js";

export default function(this: Page) {

    const [child] = this.childPath;
    if (child) {
        if (!/^index\.htm/i.test(child)) {
            return this.notFound();
        }
    }

    return Content.html(<HtmlDocument>
        <body>
            Test 1
        </body>
    </HtmlDocument>);
}