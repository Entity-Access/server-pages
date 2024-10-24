import { prepareSymbol } from "../decorators/Prepare.js";
import Page from "../Page.js";

export const Query = (name: string) => (page) => {
    (page[prepareSymbol] ??= []).push((p: Page) => {
        p[name] = p.query[name];
    })
};