import { prepareSymbol } from "../decorators/Prepare.js";
import Page from "../Page.js";

export const Query = (page, name) => {
    (page[prepareSymbol] ??= []).push((p: Page) => {
        p[name] = p.query[name];
    })
};