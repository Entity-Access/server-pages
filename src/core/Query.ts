import { prepareSymbol } from "../decorators/Prepare.js";
import Page from "../Page.js";

export const Query = (page, name) => {
    // (page[prepareSymbol] ??= []).push((p: Page) => {
    //     p[name] = p.query[name];
    // })

    Object.defineProperty(page, name, {
        enumerable: true,
        get() {
            const value = this.query[name];
            Object.defineProperty(this, name, { value });
            return value;
        }
    })

};