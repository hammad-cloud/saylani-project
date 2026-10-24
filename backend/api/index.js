// Vercel serverless entry: the same Express app as src/server.js, connected once per warm instance.
import '../src/models/index.js';
import { connectDB } from '../src/config/db.js';
import { app } from '../src/app.js';
import { bootstrapFromEnv } from '../src/modules/setup/setup.service.js';

let ready;

export default async function handler(req, res) {
  ready ??= connectDB()
    .then(bootstrapFromEnv)
    .catch((err) => {
      ready = null; // retry the connection on the next request
      throw err;
    });
  await ready;
  return app(req, res);
}
