// use parse5 to serialize html correctly
import { escapeText, escapeAttribute } from "entities";

type INodeToken = {
    target: XNode;
    token?: never;
} | {
    token: string;
    target?: never;
}

export default class XNode {

    public static create(
        // eslint-disable-next-line @typescript-eslint/ban-types
        name: string | Function,
        attribs: Record<string, any>,
        ... nodes: (XNode | string)[]): XNode {
        if (typeof name === "function") {
            return name(attribs ?? {}, ... nodes);
        }
        return new XNode(name, attribs, nodes);
    }

    protected constructor(
        public readonly name: string,
        public readonly attributes: Record<string, any>,
        public readonly children: (XNode | string)[]
    ) {

    }

    public render(nest = "") {
        const { name, attributes } = this;
        const children = [];
        let a = "";
        if (attributes) {
            for (const key in attributes) {
                if (Object.hasOwn(attributes, key)) {
                    const element = attributes[key];
                    a += ` ${escapeAttribute(key)}="${escapeAttribute(element)}"`;
                }
            }
        }
        if (this.children) {
            for (const child of this.children) {
                if (typeof child === "string") {
                    children.push(escapeText(child));
                    continue;
                }
                if (!child) {
                    continue;
                }
                children.push(child.render(nest + "\t"));
            }
        }
        if (!name) {
            return `\n${nest}\t${children.join("\n\t")}`;
        }
        if (!children.length) {
            return `${nest}<${name}${a}></${name}>`;
        }
        return `${nest}<${name}${a}>\n${nest}\t${children.join("\n\t")}\n${nest}</${name}>`;
    }

    public * readable(nest = "") {
        const iterator = this.recursiveReadable(nest);

        const stack = [];

        let current = iterator;

        for(;;) {
            const { value, done } = current.next();

            if (typeof value === "string") {
                yield value;
                continue;
            }

            if (done) {
                if (stack.length) {
                    current = stack.pop();
                    continue;
                }
                break;
            }

            stack.push(current);
            current = value;
        }

    }

    private *recursiveReadable(nest = ""): Generator<any, any, any> {

        const { name, attributes, children } = this;

        if (nest) {
            yield nest;
        }

        yield `<${name}`;

        if (attributes) {
            for (const key in attributes) {
                if (Object.hasOwn(attributes, key)) {
                    const element = attributes[key];

                    if (nest) {
                        yield nest + "\t";
                    }
                    yield `${escapeAttribute(key)}="${escapeAttribute(element)}"\n`;
                }
            }
        }

        if (nest) {
            yield nest;
        }

        yield ">\n";

        if (children) {
            for (const child of children) {
                if (typeof child === "string") {
                    yield escapeText(child);
                    continue;
                }
                if (!child) {
                    continue;
                }
                yield child.readable(nest + "\t");
            }
        }

        if (nest) {
            yield nest;
        }

        yield `</${name}>`;

    }

}
