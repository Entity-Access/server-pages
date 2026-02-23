import type Page from "../Page.js";
import { Decorators } from "./Decorators.js";

const query = (target, name, routeName = name, vc?: (v) => any): any => {
    Decorators.property({
        target,
        name,
        get() {
            let value = this.query[routeName];
            if (value !== void 0 && vc) {
                value = vc(value);
            }
            return value;
        }
    })
}

const queryCI = (target, name, routeName = name, vc?: (v) => any): any => {
    Decorators.property({
        target,
        name,
        get(this: Page) {
            let value = this.request.queryCaseInsensitive[routeName];
            if (value !== void 0 && vc) {
                value = vc(value);
            }
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
