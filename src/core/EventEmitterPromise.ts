import { EventEmitter } from "stream";

interface IResultAs<ET = any> {
    as<T>(): {
        target: ET,
        resolve: (result: T) => any,
        reject: (error: any) => any,
        promise: Promise<T>
    }
}

export default class EventEmitterPromise<T1> {

    public static extend<ET extends EventEmitter>(et: ET) {
        return {
            as: () => EventEmitterPromise.for(et)
        } as IResultAs<ET>
    }

    private static for(et)
    {
        const p = new EventEmitterPromise();
        const promise =  new Promise<any>((s, e) => {
            p.resolve = (v) => {
                p.dispose();
                s(v);
            };
            p.reject = (error) => {
                p.dispose();
                e(error);
            };
        })
        p.promise = promise;
        p.target = et;
        return p as any;
    }

    public target: any;
    public promise: Promise<T1>;
    public resolve: (result: T1) => any;
    public reject: (error: any) => any;
    private items = new Set<(() => any)>();

    public on(src: EventEmitter, eventName: string, fx: (...a: any[]) => any) {
        src.on(eventName, fx);
        this.items.add(() => {
            src.off(eventName, fx);
        });
    }

    public once(src: EventEmitter, eventName: string, fx: (...a: any[]) => any) {
        const disposable = () => {
            src.off(eventName, fx);
        };
        src.once(eventName, (...a) => {
            this.items.delete(disposable);
            fx(...a);
        });
        this.items.add(disposable);
    }

    public off(src: EventEmitter, eventName: string, fx: (...a: any[]) => any) {
        src.off(eventName, fx);
    }


    private dispose() {
        for (const element of this.items) {
            try {
                element();
            } catch {}
        }
        this.items.clear();
    }
}