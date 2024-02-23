const externalSymbol = Symbol("externalFunction");

export default function External(target, key) {
    (target[externalSymbol] ??= {})[key] = true;
}

External.isExternal = (t, name) => t[externalSymbol][name];