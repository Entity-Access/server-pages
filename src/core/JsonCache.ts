

/**
 * This cache uses disk based caching to serialize content to disk
 * and utilize disk as cache instead of firing database calls.
 *
 * Json can be circular, however the max depth is set to 10 and 64 objects
 * in a single json.
 *
 * Benefit is, the cache remains active across multiple processes in a single
 * container.
 */
export default class JsonCache {

    defaultPath = "/tmp/" + process.pid;

    constructor(private readonly name) {

    }

    async getOrCreate(key: string) {
        //  pending
    }

}