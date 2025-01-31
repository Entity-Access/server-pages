import { existsSync, writeFileSync } from "fs";
import { LocalFile } from "./dist/core/LocalFile.js";

const path = "./tmp.t";
const path2 = "./t.t";

function run() {
    writeFileSync(path, "a", "utf-8");
    const lf = new LocalFile(path, void 0, void 0, void 0, true);
}

function run2() {
    writeFileSync(path2, "a", "utf-8");
    let lf;
    try {
        lf = new LocalFile(path2, void 0, void 0, void 0, true);
        lf.readAsText();
    } finally {
        lf[Symbol.dispose]();
    }
}

const sleep = (n) => new Promise((resolve) => setTimeout(resolve, n));

run();
run2();
console.assert(!existsSync(path2));


await sleep(100);

gc();

await sleep(100);

gc();

await sleep(100);

console.assert(!existsSync(path));
