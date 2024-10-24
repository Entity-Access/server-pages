import { prepareSymbol } from "../decorators/Prepare.js";
import Page from "../Page.js";

export const Route = (page, name) => {
    Object.defineProperty(page, name, {
        enumerable: true,
        get() {
            const value = this.route[name];
            Object.defineProperty(this, name, { value });
            return value;
        }
    })
};
