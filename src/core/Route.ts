const route = (page, name, routeName = name): any => {
    Object.defineProperty(page, name, {
        enumerable: true,
        get() {
            const value = this.route[routeName];
            Object.defineProperty(this, name, { value });
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
