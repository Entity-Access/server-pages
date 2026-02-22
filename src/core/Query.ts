import type Page from "../Page.js";

const query = (page, name, routeName = name, vc?: (v) => any): any => {
    Object.defineProperty(page, name, {
        enumerable: true,
        get() {
            let value = this.query[routeName];
            if (value !== void 0 && vc) {
                value = vc(value);
            }
            Object.defineProperty(this, name, { value, configurable: true });
            return value;
        }
    })
}

const queryCI = (page, name, routeName = name, vc?: (v) => any): any => {
    Object.defineProperty(page, name, {
        enumerable: true,
        get(this: Page) {
            let value = this.request.queryCaseInsensitive[routeName];
            if (value !== void 0 && vc) {
                value = vc(value);
            }
            Object.defineProperty(this, name, { value , configurable: true });
            return value;
        }
    })
}


export const Query = (page, name?) => {

    if (name === void 0) {
        return (p, n) => query(p, n, page);
    }

    return query(page, name, name);
};

Query.asBoolean = (page, name?) => {
    if (name === void 0) {
        return (p, n) => query(p, n, page, (v) => /true|yes/i.test(v));
    }
    return query(page, name, name, (v) => /true|yes/i.test(v));
}

Query.asNumber = (page, name?) => {
    if (name === void 0) {
        return (p, n) => query(p, n, page, (v) => Number(v));
    }
    return query(page, name, name, (v) => Number(v));
}

Query.asBigInt = (page, name?) => {
    if (name === void 0) {
        return (p, n) => query(p, n, page, (v) => BigInt(v));
    }
    return query(page, name, name, (v) => BigInt(v));
}

Query.caseInsensitive = (page, name?) => {

    if (name === void 0) {
        return (p, n) => queryCI(p, n, page);
    }

    return queryCI(page, name, name);
};

Query.caseInsensitiveAsBoolean = (page, name?) => {
    if (name === void 0) {
        return (p, n) => queryCI(p, n, page, (v) => /true|yes/i.test(v));
    }
    return queryCI(page, name, name, (v) => /true|yes/i.test(v));
}

Query.caseInsensitiveAsNumber = (page, name?) => {
    if (name === void 0) {
        return (p, n) => queryCI(p, n, page, (v) => Number(v));
    }
    return queryCI(page, name, name, (v) => Number(v));
}
