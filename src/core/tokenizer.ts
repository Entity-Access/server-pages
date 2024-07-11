export function *tokenize (text: string, sep: string) {
    let start = 0;
    for(;;) {
        const index = text.indexOf(sep, start);
        if (index === -1) {
            break;
        }
        yield text.substring(start, index);
        start = index + sep.length;
    }
    yield text.substring(start);
};


export function tokenizeMax(text: string, sep: string, max = Number.MAX_SAFE_INTEGER) {
    let start = 0;
    const items = [];
    max--;
    for(;;) {
        const index = text.indexOf(sep, start);
        if (index === -1) {
            break;
        }
        items.push(text.substring(start, index));
        start = index + 1;
        if (--max === 0) {
            break;
        }
    }
    items.push(text.substring(start));
    return items;
};

export function *tokenizeRegex(text: string, regex: RegExp) {
    regex.lastIndex = 0;
    let m;
    while((m = regex.exec(text)) !== null) {
        if (m.index === regex.lastIndex) {
            regex.lastIndex++;
        }
        for (const match of m) {
            yield match;
        }
    }
}