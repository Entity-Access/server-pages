import { tokenize } from "./tokenizer.js";

export const UrlParser = {
    parse: (text: string) => {
        const path = [];
        for (const iterator of tokenize(text, "/")) {
            if (iterator) {
                path.push(decodeURIComponent(iterator));
            }    
        }
        return path;
    }
};