import ServerLogger from "./ServerLogger.js";

export default class TimeoutTracker implements Disposable {

    static create(fx: () => any) {
        return new TimeoutTracker(fx);
    }

    timer: NodeJS.Timeout;

    constructor(tracker: () => any, time = 30000) {
        this.timer = setTimeout(() => {
            this.timer = void 0;
            const p = tracker();
            if (p?.catch) {
                p.catch(ServerLogger.error);
            }
        }, time);
    }


    [Symbol.dispose](): void {
        const { timer } = this;
        if (timer) {
            clearTimeout(timer);
        }
    }



}