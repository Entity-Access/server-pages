const query = (page, name, routeName = name): any => {
    Object.defineProperty(page, name, {
        enumerable: true,
        get() {
            const value = this.query[routeName];
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
