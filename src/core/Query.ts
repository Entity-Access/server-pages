import type Page from "../Page.js";

const query = (target, name, queryName = name, vc?: (v) => any): any => {
    const defaultValue = Symbol.for(`query-${name}`);
    Object.defineProperty(target, name, {
        get(this: Page) {
            let value = this.request.query[queryName];
            if (value !== void 0) {
                if (vc) {
                    value = vc(value);
                }
            } else {
                value = this[defaultValue];
            }
            Object.defineProperty(this, name, {
                value, configurable: true, enumerable: true
            });
            return value;
        },
        set(v) {
            this[defaultValue] = v;
        },
    })
}

const queryCI = (target, name, queryName = name, vc?: (v) => any): any => {
    const defaultValue = Symbol.for(`query-${name}`);
    Object.defineProperty(target, name, {
        get(this: Page) {
            let value = this.request.queryCaseInsensitive[queryName];
            if (value !== void 0) {
                if (vc) {
                    value = vc(value);
                }
            } else {
                value = this[defaultValue];
            }
            Object.defineProperty(this, name, {
                value, configurable: true, enumerable: true
            });
            return value;
        },
        set(v) {
            this[defaultValue] = v;
        },
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
