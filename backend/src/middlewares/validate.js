// Parses req.body with a zod schema and replaces it with the clean result.
export const validate = (schema) => (req, _res, next) => {
  req.body = schema.parse(req.body ?? {});
  next();
};
