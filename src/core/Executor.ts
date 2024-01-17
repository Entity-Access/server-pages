import Page from "../Page.js";
import { prepareSymbol } from "../decorators/Prepare.js";

export default class Executor {

    public static async run(c: Page) {
        let ps = c.constructor[prepareSymbol];
        if (ps) {
            for (const iterator of ps) {
                await iterator();
            }
        }
        return c.run();
    }

}