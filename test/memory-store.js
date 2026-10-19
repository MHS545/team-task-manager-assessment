// Test double only. Application startup always uses the real Firestore adapter.
export function memoryStore() {
  let collections = new Map(),
    queue = Promise.resolve();
  const collection = (state, name) => {
    if (!state.has(name)) state.set(name, new Map());
    return state.get(name);
  };
  const reader = (state) => ({
    async get(name, id) {
      return structuredClone(collection(state, name).get(id) || null);
    },
    async query(name, field, operator, value) {
      return [...collection(state, name).values()]
        .filter((doc) =>
          operator === 'array-contains' ? doc[field]?.includes(value) : doc[field] === value,
        )
        .map((doc) => structuredClone(doc));
    },
  });
  return {
    async get(...args) {
      return reader(collections).get(...args);
    },
    async query(...args) {
      return reader(collections).query(...args);
    },
    async transaction(callback) {
      const operation = queue.then(async () => {
        const working = structuredClone(collections);
        const tx = {
          ...reader(working),
          set(name, id, value) {
            collection(working, name).set(id, structuredClone({ ...value, id }));
          },
          delete(name, id) {
            collection(working, name).delete(id);
          },
        };
        const result = await callback(tx);
        collections = working;
        return result;
      });
      queue = operation.catch(() => {});
      return operation;
    },
  };
}
