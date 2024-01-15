export const chainToCamel = (str: string) =>
  str.toLowerCase().replace(/([-_][a-z])/g, (group) =>
    group
      .toUpperCase()
      .replace('-', '')
      .replace('_', '')
  );

export const camelToChain = (str: string) => (str[0].toLowerCase() + str.substring(1)).replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());