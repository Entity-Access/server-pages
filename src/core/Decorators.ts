export const Decorators = {

    property({ target, name, get = void 0 as Function, cache = true}) {

        const propertyHolder = Symbol.for(name);

        Object.defineProperty(target, name , {
            get () {
                let value = get.call(this);
                if (value === void 0) {
                    value = this[propertyHolder];
                }
                Object.defineProperty(this, name, {
                    value, configurable: true, enumerable: true
                });
                delete this[propertyHolder];
                return value;
            },
            set (v) {
                this[propertyHolder] = v;
            },
            enumerable: true,
            configurable: true
        });

    }

};