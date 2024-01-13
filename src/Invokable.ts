
export interface IProcessLike {
    on(key: "message", fx: (data: any) => any);
    send?(data);
    postMessage?(data);
}

const defaultResult = null;

let newId = 1;

export class Invokable {

    protected static invoke<T = any>(caller: Invokable, process: IProcessLike, invoke: string, ... args: any[]): Promise<T> {
        const id = newId++;
        return new Promise<T>((resolve, reject) => {
            caller.promiseMap.set(id, { resolve, reject});
            const send = process.send ?? process.postMessage;
            send.call(process, { id, invoke, args });
        });
    }

    private promiseMap: Map<number, { resolve, reject}> = new Map();

    protected install(process: IProcessLike) {
        process.on("message", ({
            id,
            invoke,
            args = [],
            result: resultReceived,
            error: errorReceived
        }) => {

            const send = process.send ?? process.postMessage;

            if (!invoke) {
                if (typeof resultReceived !== "undefined") {
                    const p = this.promiseMap.get(id);
                    if (p) {
                        this.promiseMap.delete(id);
                        p.resolve(resultReceived);
                    }
                    return;
                }
                if (errorReceived) {
                    const p = this.promiseMap.get(id);
                    if (p) {
                        this.promiseMap.delete(id);
                        p.reject(errorReceived);
                    }
                }
                return;
            }
            try {
                const r = this[invoke](... args) ?? defaultResult;
                if (r.then) {
                    r.then((result = defaultResult) =>
                        send.call(process, { id, result })
                    , (error) =>
                        send.call(process, { id, error })
                    );
                } else {
                    send.call(process, { id, result: r });
                }
            } catch (error) {
                send.call(process, { id, error });
            }
        });
    }

}
