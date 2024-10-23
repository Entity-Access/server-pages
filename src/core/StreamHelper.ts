import type { Writable } from "stream"

export const StreamHelper = {

    write(stream: Writable, chunk) {
        return new Promise<void>((resolve, reject) => {
            stream.write(chunk, (error) => error ? reject(error) : resolve());
        });
    }
}