const externalInvokeSymbol = Symbol("externalInvokeFunction");

export default function ExternalInvoke(target, key) {
    (target[externalInvokeSymbol] ??= {})[key] = true;
}

ExternalInvoke.isExternal = (t, name) => t[externalInvokeSymbol]?.[name];