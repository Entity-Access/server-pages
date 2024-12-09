import XNode from "./XNode.js";

class DocumentNode extends XNode {

    constructor(a, children) {
        super("html", a, children);
    }

    public * recursiveReadable(nest?: string) {
        yield `<!DOCTYPE html>\n`;
        yield super.recursiveReadable(nest);
    }
}

export default function HtmlDocument({ lang = "en"}, ... nodes: (XNode | string)[]): XNode {
    return new DocumentNode({ lang }, nodes);
}