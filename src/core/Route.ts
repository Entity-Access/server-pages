import { prepareSymbol } from "../decorators/Prepare.js";
import Page from "../Page.js";

export const Route = (page, name) => {
    (page[prepareSymbol] ??= []).push((p: Page) => {
        p[name] = p.route[name];
    })
};
