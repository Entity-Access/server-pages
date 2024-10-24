import { prepareSymbol } from "../decorators/Prepare.js";
import Page from "../Page.js";

export const Route = (name: string) => (page: Page) => {
    (page[prepareSymbol] ??= []).push((p: Page) => {
        p[name] = p.route[name];
    })
};
