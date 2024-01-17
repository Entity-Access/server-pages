import busboy from "busboy";
import { Writable } from "node:stream";
import Page from "../Page.js";
import TempFolder from "../core/TempFolder.js";
import { LocalFile } from "../core/LocalFile.js";
import { ServiceProvider } from "@entity-access/entity-access/dist/di/di.js";
import SessionUser from "../core/SessionUser.js";

export const prepareSymbol = Symbol("Parse");

export interface IFormData {
    fields: { [key: string]: string};
    files: LocalFile[];
}

const setValue = (page, name, value) => {
    const v = { value, writable: true, enumerable: true };
    Object.defineProperty(page, name, v);
    Object.defineProperty(page.request, name, v);
};

const parseJsonBody = (page?): any => {

    if (!page) {
        return (target) => parseJsonBody(target);
    }

    if (!(page instanceof Page)) {
        ((page as any)[prepareSymbol] ??= []).push(parseJsonBody);
        return;
    }

    if (Object.hasOwn(page, "body")) {
        return;
    }

    return (async () => {

        try {
            let buffer = null as Buffer;
            let encoding = page.request.headers["content-encoding"] ?? "utf-8";
            const contentType = page.request.headers["content-type"];
            if (!/\/json/i.test(contentType)) {
                setValue(page, "body", {});
                return {};
            }
            await new Promise<void>((resolve, reject) => {
                page.request.pipe(new Writable({
                    write(chunk, enc, callback) {
                        encoding ||= enc;
                        let b = typeof chunk === "string"
                            ? Buffer.from(chunk)
                            : chunk as Buffer;
                        buffer = buffer
                            ? Buffer.concat([buffer, b])
                            : b;
                        callback();
                    },
                    final(callback) {
                        resolve();
                        callback();
                    },
                }), { end: true });
            });
            const text = buffer.toString(encoding as any);
            setValue(page, "body", JSON.parse(text));
        } catch (error) {
            page.reportError(error);
            setValue(page, "body", {});
        }
    })();
};

const authorize = (page?): any => {
    if (!page) {
        return (target) => authorize(target);
    }

    if (!(page instanceof Page)) {
        ((page as any)[prepareSymbol] ??= []).push(authorize);
        return;
    }

    return (async () => {
        const sessionUser = ServiceProvider.resolve(page, SessionUser);
        await sessionUser.authorize();
        setValue(page, "sessionUser", sessionUser);
    })();
};

const parseForm = (page?): any => {
    if (!page) {
        return (target) => parseForm(target);
    }

    if (!(page instanceof Page)) {
        ((page as any)[prepareSymbol] ??= []).push(parseForm);
        return;
    }

    if (Object.hasOwn(page, "form")) {
        return;
    }

    return (async () => {
        const req = page.request;

        let tempFolder: TempFolder;
        const result: IFormData = {
            fields: {},
            files: []
        };
        try {
            const bb = busboy({ headers: req.headers, defParamCharset: "utf8" });
            const tasks = [];
            await new Promise((resolve, reject) => {

                bb.on("field", (name, value) => {
                    result.fields[name] = value;
                });

                bb.on("file", (name, file, info) => {
                    if (!tempFolder) {
                        tempFolder = new TempFolder();
                        req.disposables.push(tempFolder);
                    }
                    const tf = tempFolder.get(info.filename, info.mimeType);
                    tasks.push(tf.writeAll(file).then(() => {
                        result.files.push(tf);
                    }));
                });
                bb.on("error", reject);
                bb.on("close", resolve);
                req.pipe(bb);
            });
            await Promise.all(tasks);
        } catch (error) {
            page.reportError(error);        
        }
        setValue(page, "form", result);
    })();
};

export const Prepare = {
    parseJsonBody,
    authorize,
    parseForm
};