import XNode from "./XNode.js";

export default function HtmlDocument({ lang = "en"}, ... nodes: (XNode | string)[]): XNode {
    return XNode.create("", { },
        "<!DOCTYPE html>",
        <html lang={lang}>
            { ... nodes}
        </html>
    );
}