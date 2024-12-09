import XNode from "./XNode.js";

class Comment extends XNode {

    constructor(private nodes: string[]) {
        super(null, {}, []);
    }

    public *recursiveReadable(nest?: string) {
        nest ??= "";
        yield "<!--";
        for (const element of this.nodes) {
            yield nest;
            yield element;
            yield "\n";
        }
        yield "!-->";
    }

}

export default function HtmlComment({}, ... nodes: string[]) {
    return new Comment(nodes);
}