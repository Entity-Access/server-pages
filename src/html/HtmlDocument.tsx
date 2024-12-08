import XNode from "./XNode.js";

class DocumentNode extends XNode {

    constructor(a, children) {
        super("html", a, children);
    }

    public render(nest?: string): string {
        return `<!DOCTYPE html>\n${super.render(nest)}`;
    }

    public * readable(nest?: string) {
        yield `<!DOCTYPE html>\n`;
        yield * super.readable(nest);
    }
}

export default function HtmlDocument({ lang = "en"}, ... nodes: (XNode | string)[]): XNode {
    return new DocumentNode({ lang }, nodes);
}