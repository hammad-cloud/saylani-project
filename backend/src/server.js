import { env } from './config/env.js';
import './models/index.js';
import { connectDB } from './config/db.js';
import { app } from './app.js';
import { bootstrapFromEnv } from './modules/setup/setup.service.js';

await connectDB();
await bootstrapFromEnv();
app.listen(env.port, () => console.log(`API running on http://localhost:${env.port}`));
