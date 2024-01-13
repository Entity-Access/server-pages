import Page from "../../../../Page.js";

export default function(this: Page) {
    console.log(this.childPath);
    return this.json({ childPath: this.childPath });
}