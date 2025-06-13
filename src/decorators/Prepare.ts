import busboy from "busboy";
import { Writable } from "node:stream";
import Page from "../Page.js";
import TempFolder from "../core/TempFolder.js";
import { LocalFile } from "../core/LocalFile.js";
import { ServiceProvider } from "@entity-access/entity-access/dist/di/di.js";
import { SessionUser } from "../core/SessionUser.js";
import Content, { StatusResult } from "../Content.js";
import EntityAccessError from "@entity-access/entity-access/dist/common/EntityAccessError.js";

export const prepareSymbol = Symbol("Parse");

const fileSize = 16*1024*1024;

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

const authorizeRedirect = (
    fx: (user: SessionUser) => boolean = (u) => u.userID as any as boolean,
    redirectUrl: string = "/user/login",
    queryParameterName: string = "returnUrl"
): any => {
    
    return (target) => {
        (target[prepareSymbol] ??= []).push(async (page: Page) => {
            const sessionUser = ServiceProvider.resolve(page, SessionUser);
            await sessionUser.authorize();
            if (!fx(sessionUser)) {
                let location = redirectUrl;
                if (location.includes("?")) {
                    location += `&${queryParameterName}=${encodeURIComponent(page.request.url)}`;
                } else {
                    location += `?${queryParameterName}=${encodeURIComponent(page.request.url)}`;
                }
                return new StatusResult(301, { location });
            }
            setValue(page, "sessionUser", sessionUser);
        });
    }
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
        let lastError = null;
        try {
            const bb = busboy({
                headers: req.headers,
                defParamCharset: "utf-8",
                limits: {
                    fileSize
                }
            });
            const tasks = [];
            bb.on("error", console.error);
            await new Promise((resolve, reject) => {

                bb.on("field", (name, value) => {
                    result.fields[name] = value;
                });

                bb.on("file", (name, file, info) => {
                    if (!tempFolder) {
                        tempFolder = new TempFolder();
                        req.disposables.push(tempFolder);
                    }
                    const tf = tempFolder.get(info.filename, info.mimeType, false, true);
                    file.on("limit", () => lastError = new EntityAccessError(`File size exceeded`));
                    tasks.push(tf.writeAll(file).then(() => {
                        result.files.push(tf);
                    }, console.error));
                });
                bb.on("filesLimit", () => lastError = new EntityAccessError(`File size exceeded`) );
                bb.on("error", reject);
                bb.on("close", resolve);
                req.pipe(bb);
            });
            await Promise.all(tasks);
        } catch (error) {
            page.reportError(error);
        }
        setValue(page, "form", result);

        if (lastError) {

            // delete all
            try {
                tempFolder[Symbol.dispose]();
            } catch (error) {
                // delete folder
                console.error(error);
            }

            return Content.text(lastError.stack ?? lastError, { status: 500, contentType: "text/plain"})
        }
    })();
};

export const Prepare = {
    parseJsonBody,
    authorize,
    parseForm,
    authorizeRedirect
};