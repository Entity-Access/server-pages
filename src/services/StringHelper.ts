export const StringHelper = {
    replaceAll: (text: string, search: string, replace: string) => {
        if (!text || !search) {
            return text;
        }
        let index = 0;
        do {
            index = text.indexOf(search, index);
            if (index === -1) {
                break;
            }
            text = text.substring(0, index) + replace + text.substring(index + search.length);
        } while(true);
        return text;
    },

    remove00: (text: string) => {
        if (!text) {
            return text;
        }
        return text.replace(/\x00/g, "");
    },

    extractFloat: (text: string, def: number = 0) => {
        const group = /(\d+)/.exec(text);
        if (group?.length) {
            return parseFloat( group[0]);
        }
        return def;
    }
};