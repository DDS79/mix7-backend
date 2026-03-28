export const db = {
  transaction: async <T>(fn: (tx: any) => Promise<T>) => fn({}),
};
