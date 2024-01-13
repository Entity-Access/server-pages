export default class XNode {

    public static create(
        // eslint-disable-next-line @typescript-eslint/ban-types
        name: string | Function,
        attribs: Record<string, any>,
        ... nodes: (XNode | string)[]) {
        if (typeof name === "function") {
            return name(attribs ?? {}, ... nodes);
        }
        return new XNode(name, attribs, nodes);
    }

    private constructor(
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
                if (Object.prototype.hasOwnProperty.call(attributes, key)) {
                    const element = attributes[key];
                    a += ` ${key}=${JSON.stringify(element)}`;
                }
            }
        }
        if (this.children) {
            for (const child of this.children) {
                if (typeof child === "string") {
                    children.push(child);
                    continue;
                }
                children.push(child.render(nest + "\t"));
            }
        }
        if (!name) {
            return `\n${nest}\t${children.join("\n\t")}`;
        }
        return `${nest}<${name}${a}>\n${nest}\t${children.join("\n\t")}\n${nest}</${name}>`;
    }

}
