const query = (page, name, routeName = name, vc?: (v) => any): any => {
    Object.defineProperty(page, name, {
        enumerable: true,
        get() {
            let value = this.query[routeName];
            if (value !== void 0 && vc) {
                value = vc(value);
            }
            Object.defineProperty(this, name, { value });
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
