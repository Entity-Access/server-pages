const route = (page, name, routeName = name, vc?: (v) => any): any => {
    Object.defineProperty(page, name, {
        enumerable: true,
        get() {
            let value = this.route[routeName];
            if (value !== void 0 && vc) {
                value = vc(value);
            }
            Object.defineProperty(this, name, { value, configurable: true });
            return value;
        }
    })
}


export const Route = (page, name?) => {

    if (name === void 0) {
        return (p, n) => route(p, n, page);
    }

    return route(page, name, name);
};

Route.asBoolean = (page, name?) => {
    if (name === void 0) {
        return (p, n) => route(p, n, page, (v) => /true|yes/i.test(v));
    }
    return route(page, name, name, (v) => /true|yes/i.test(v));
}

Route.asNumber = (page, name?) => {
    if (name === void 0) {
        return (p, n) => route(p, n, page, (v) => Number(v));
    }
    return route(page, name, name, (v) => Number(v));
}

Route.asBigInt = (page, name?) => {
    if (name === void 0) {
        return (p, n) => route(p, n, page, (v) => BigInt(v));
    }
    return route(page, name, name, (v) => BigInt(v));
}