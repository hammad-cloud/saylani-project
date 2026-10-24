import { AuditLog } from '../models/AuditLog.js';

const plain = (doc) => (doc?.toJSON ? doc.toJSON() : doc ?? undefined);

export function audit(actorId, action, entity, { id, before, after } = {}) {
  return AuditLog.create({
    actor: actorId,
    action,
    entity,
    entityId: id ?? after?._id ?? before?._id,
    before: plain(before),
    after: plain(after),
  });
}
