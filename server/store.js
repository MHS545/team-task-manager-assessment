import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const unpack = (snapshot) => (snapshot.exists ? { ...snapshot.data(), id: snapshot.id } : null);
function adapter(db, transaction) {
  return {
    async get(collection, id) {
      const reference = db.collection(collection).doc(id);
      return unpack(transaction ? await transaction.get(reference) : await reference.get());
    },
    async query(collection, field, operator, value) {
      const query = db.collection(collection).where(field, operator, value);
      const snapshot = transaction ? await transaction.get(query) : await query.get();
      return snapshot.docs.map(unpack);
    },
    set(collection, id, value) {
      transaction.set(db.collection(collection).doc(id), value);
    },
    delete(collection, id) {
      transaction.delete(db.collection(collection).doc(id));
    },
  };
}
export function createFirestoreStore(projectId) {
  if (!projectId)
    throw new Error('Set GOOGLE_CLOUD_PROJECT to your Firebase project ID. See docs/FIREBASE.md.');
  const options = { projectId };
  if (!process.env.FIRESTORE_EMULATOR_HOST) options.credential = applicationDefault();
  const app = initializeApp(options);
  const db = getFirestore(app);
  const reads = adapter(db);
  return {
    ...reads,
    transaction: (callback) => db.runTransaction((tx) => callback(adapter(db, tx))),
  };
}
