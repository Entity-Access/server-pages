import Content from "../Content.js";
import Page from "../Page.js";
import { prepareSymbol } from "../decorators/Prepare.js";

export default class Executor {

    public static async run(c: Page) {
        let ps = c.constructor[prepareSymbol];
        if (ps) {
            for (const iterator of ps) {
                const ci = iterator(c);
                if (ci) {
                    const r = await ci;
                    if (r && r instanceof Content) {
                        return r;
                    }
                }
            }
        }
        return c.run();
    }

}