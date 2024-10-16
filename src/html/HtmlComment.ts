import XNode from "./XNode.js";

class Comment extends XNode {

    constructor(private nodes: string[]) {
        super(null, {}, []);
    }

    public render(nest?: string): string {
        nest ??= "";
        let comments = "";
        for (const element of this.nodes) {
            comments += nest + element + "\n";
        }
        return `<!--${comments}-->`
    }

}

export default function HtmlComment({}, ... nodes: string[]) {
    return new Comment(nodes);
}