export default class TimedAbortController implements Disposable {

    private readonly ac: AbortController;

    public readonly signal: AbortSignal;
    private timeout: NodeJS.Timeout;

    constructor(timeout = 5*60*1000) {
        this.ac = new AbortController();
        this.signal = this.ac.signal;

        this.timeout = setTimeout(() => this.ac.abort("timedout"), timeout);
    }

    abort(reason = "aborted") {
        return this.ac.abort(reason);
    }

    [Symbol.dispose]() {
        clearTimeout(this.timeout);
    }

}