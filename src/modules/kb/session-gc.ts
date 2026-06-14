import { KbRepository } from './kb.repository';
import { createVectorStoreFromEnv } from '../vector/registry';

export async function purgeSessionKb(ownerUserId: string, sessionId: string): Promise<number> {
  if (!ownerUserId || !sessionId) return 0;
  const kbRepository = new KbRepository();
  const store = createVectorStoreFromEnv();

  const docs = await kbRepository.listBySession(ownerUserId, sessionId);
  for (const doc of docs) {
    await store.delete({
      docId: doc.id,
      ownerUserId,
      sessionId,
      scope: 'session',
    });
    await kbRepository.deleteDocument(doc.id);
  }

  await store.delete({
    ownerUserId,
    sessionId,
    scope: 'session',
  });

  return docs.length;
}

