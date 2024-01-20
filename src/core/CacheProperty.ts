export const CacheProperty = {
    value: (target: any, name: string, value: any) => {
        Object.defineProperty(target, name, { 
            value,
            enumerable: true,
            writable: true,
            configurable: true
        });
        return value;
    },
    get: (target: any, name: string, get: Function) => {
        Object.defineProperty(target, name, { 
            get: get as any,
            enumerable: true,
            configurable: true
        });
        return get.call(target);
    }
};