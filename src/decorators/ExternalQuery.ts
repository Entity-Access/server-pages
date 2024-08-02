const externalSymbol = Symbol("externalFunction");

export default function ExternalQuery(target, key) {
    (target[externalSymbol] ??= {})[key] = true;
}

ExternalQuery.isExternal = (t, name) => t[externalSymbol]?.[name];