import type Page from "../Page.js";
import { Decorators } from "./Decorators.js";

const query = (target, name, vc?: (v) => any): any => {
    const defaultValue = Symbol.for(`query-${name}`);
    Object.defineProperty(target, name, {
        get(this: Page) {
            let value = this.request.query[name];
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

const queryCI = (target, name, vc?: (v) => any): any => {
    const defaultValue = Symbol.for(`query-${name}`);
    Object.defineProperty(target, name, {
        get(this: Page) {
            let value = this.request.queryCaseInsensitive[name];
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
        return (p, n) => query(p, n);
    }

    return query(page, name);
};

Query.asBoolean = (page, name?) => {
    if (name === void 0) {
        return (p, n) => query(p, n, (v) => /true|yes/i.test(v));
    }
    return query(page, name, (v) => /true|yes/i.test(v));
}

Query.asNumber = (page, name?) => {
    if (name === void 0) {
        return (p, n) => query(p, n, (v) => Number(v));
    }
    return query(page, name, (v) => Number(v));
}

Query.asBigInt = (page, name?) => {
    if (name === void 0) {
        return (p, n) => query(p, page, (v) => BigInt(v));
    }
    return query(page, name, (v) => BigInt(v));
}

Query.caseInsensitive = (page, name?) => {

    if (name === void 0) {
        return (p, n) => queryCI(p, n);
    }

    return queryCI(page, name);
};

Query.caseInsensitiveAsBoolean = (page, name?) => {
    if (name === void 0) {
        return (p, n) => queryCI(p, n, (v) => /true|yes/i.test(v));
    }
    return queryCI(page, name, (v) => /true|yes/i.test(v));
}

Query.caseInsensitiveAsNumber = (page, name?) => {
    if (name === void 0) {
        return (p, n) => queryCI(p, n, (v) => Number(v));
    }
    return queryCI(page, name, (v) => Number(v));
}
