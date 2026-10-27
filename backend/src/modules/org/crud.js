import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { ApiError } from '../../utils/ApiError.js';
import { audit } from '../../utils/audit.js';

// Admin manages, HR views: the shape shared by every org-setup list (M2).
// inUse(id) returns a reason when the record is still referenced, which blocks the delete (409).
export function crudRouter(Model, schema, { sort = { name: 1 }, inUse } = {}) {
  const router = Router();
  router.use(authenticate);

  router.get('/', authorize('admin', 'hr'), async (_req, res) => {
    res.json(await Model.find().sort(sort));
  });

  router.post('/', authorize('admin'), validate(schema), async (req, res) => {
    const doc = await Model.create(req.body);
    await audit(req.user._id, 'create', Model.modelName, { after: doc });
    res.status(201).json(doc);
  });

  router.put('/:id', authorize('admin'), validate(schema.partial()), async (req, res) => {
    const before = await Model.findById(req.params.id);
    if (!before) throw new ApiError(404, `${Model.modelName} not found`);
    const after = await Model.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after', runValidators: true });
    await audit(req.user._id, 'update', Model.modelName, { before, after });
    res.json(after);
  });

  router.delete('/:id', authorize('admin'), async (req, res) => {
    const reason = inUse && (await inUse(req.params.id));
    if (reason) throw new ApiError(409, `Cannot delete: ${reason}`);
    const before = await Model.findByIdAndDelete(req.params.id);
    if (!before) throw new ApiError(404, `${Model.modelName} not found`);
    await audit(req.user._id, 'delete', Model.modelName, { before });
    res.status(204).end();
  });

  return router;
}
