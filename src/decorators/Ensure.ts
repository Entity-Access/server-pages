import type Page from "../Page.js";

export const parseSymbol = Symbol("Parse");

const parseBody = async (page: Page) => {
    try {

    } catch (error) {
        page.reportError(error);
    }
};

export const Ensure = {
    parseBody: (target) => (target[parseSymbol] ??= []).push(parseBody),
};