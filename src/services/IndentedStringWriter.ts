export default class IndentedStringWriter {

    public get indent(): number {
        return this.indention;
    }
    public set indent(value: number) {
        this.indention = value;
        let p = "";
        for (let index = 0; index < value; index++) {
            p += this.indentChar;
        }
        this.prefix = p;
    }

    private indention: number = 0;
    private prefix = "";
    private content = "";

    constructor(private indentChar = "    ") {

    }

    public writeLine(text: string = "") {
        for (const iterator of text.split("\n")) {
            this.content = this.content.concat(this.prefix, iterator.trimStart(), "\n");
        }
    }

    public toString() {
        return this.content;
    }

}