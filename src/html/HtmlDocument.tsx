import XNode from "./XNode.js";

export default function HtmlDocument({ lang = "en"}, ... nodes: (XNode | string)[]): XNode {

    class DocumentNode extends XNode {

        constructor(a, children) {
            super("html", a, children);
        }

        public render(nest?: string): string {
            return `<!DOCTYPE html>\n${super.render(nest)}`;
        }
    }

    return new DocumentNode({ lang }, nodes);
}