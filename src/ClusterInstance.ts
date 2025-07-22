/* eslint-disable no-console */
import cluster, { Worker } from "cluster";
import { Invokable } from "./Invokable.js";
import { availableParallelism } from "os";
import sleep from "./sleep.js";

export class RecycledWorker<T = any> {

    public get worker() {
        return this.currentWorker;
    }

    private currentWorker: Worker;
    private destroyed: boolean;

    private eventMap: Map<string,any> = new Map();

    constructor(env?) {
        this.currentWorker = cluster.fork(env);
        this.currentWorker.on("exit" , () => {
            if (this.destroyed) {
                return;
            }
            this.currentWorker = cluster.fork(env);
            for (const [msg, handler] of this.eventMap) {
                this.currentWorker.on(msg, handler);
            }
        });
    }

    public on(msg: string, handler) {
        this.eventMap.set(msg, handler);
        if (this.destroyed) {
            return;
        }
        this.currentWorker.on(msg, handler);
    }

    public send(a) {
        if (this.destroyed) {
            return;
        }
        this.currentWorker.send(a);
    }

    public destroy() {
        this.destroyed = true;
        const { currentWorker } = this;
        this.currentWorker = null;
        currentWorker?.destroy();
    }

}

const numCPUs = availableParallelism();


export default abstract class ClusterInstance<T> extends Invokable {

    public get maxWorkerCount() {
        return numCPUs;
    }

    protected isPrimary: boolean;

    protected readonly workers: RecycledWorker[] = [];

    public run(arg: T) {
        this.isPrimary = cluster.isPrimary;
        if (cluster.isPrimary) {
            console.log(`Initializing Primary Cluster`);
            this.setupPrimary(arg).catch(console.error);
        } else {
            this.setupWorker(arg).catch(console.error);
            console.log(`Initializing Cluster Worker`);
        }
    }

    protected abstract runPrimary(arg: T): Promise<void>;
    protected abstract runWorker(arg: T): Promise<void>;

    protected fork(env?) {
        const worker = new RecycledWorker(env);
        this.install(worker);
        this.workers.push(worker);
        return worker;
    }

    protected async setupPrimary(arg: T) {
        try {

            await this.runPrimary(arg);

            console.log(`Starting Clusters`);

            while (true) {

                const workers = this.workers;
                workers.length = 0;

                // Start workers and listen for messages containing notifyRequest
                const n = this.maxWorkerCount;
                for (let i = 0; i < n; i++) {
                    const worker = this.fork();
                    workers.push(worker);
                }

                // sleep for 60 days
                for (let index = 0; index < 60; index++) {
                    await sleep(24*60*60*1000);
                }

                for (const worker of workers) {
                    worker.destroy();
                }

            }

        } catch (error) {
            console.error(error);
        }
    }

    protected async setupWorker(arg: T) {
        try {

            this.install(process);

            await this.runWorker(arg);

            process.send({ cmd: "ready"});
        } catch (error) {
            console.error(error);
        }
    }

    protected invoke(invoke: string, ...args: any[]): Promise<any> {
        if (!this.isPrimary) {
            return Invokable.invoke(this, process, invoke, args);
        }
        return Promise.all(this.workers.map((worker) => Invokable.invoke(this, worker, invoke, args)));
    }
}
