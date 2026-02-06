import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { PORT } from './config/config';
import { Nusawork } from './service/nusawork.service';

import route from './routes/route';

const app = new Hono()

app.use('*', cors())

app.route('/api', route);

export default {
  port: PORT,
  fetch: app.fetch,
};

console.log(`🚀 Server running on http://localhost:${PORT}`);