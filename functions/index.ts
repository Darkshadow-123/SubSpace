import express from 'express';
import approveStep from './approveStep/index.js';
import triggerWorkflowRun from './triggerWorkflowRun/index.js';
import scheduledPoll from './scheduledPoll/index.js';
import webhookTrigger from './webhookTrigger/index.js';
import notificationHandler from './notificationHandler/index.js';
import databaseEventHandler from './databaseEventHandler/index.js';

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Route handlers
app.post('/api/approveStep', approveStep);
app.post('/api/triggerWorkflowRun', triggerWorkflowRun);
app.post('/api/scheduledPoll', scheduledPoll);
app.post('/api/webhookTrigger/:triggerId?', webhookTrigger);
app.post('/api/notifications', notificationHandler);
app.post('/api/events/database', databaseEventHandler);

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

app.listen(PORT, () => {
  console.log(`✓ AgentFlow Functions Server running on port ${PORT}`);
  console.log(`✓ Health check: GET http://localhost:${PORT}/health`);
  console.log(`✓ GraphQL backend: http://localhost:8080`);
  console.log(`✓ API endpoints:`);
  console.log(`  - POST /api/webhookTrigger   (public ingress)`);
  console.log(`  - POST /api/triggerWorkflowRun`);
  console.log(`  - POST /api/approveStep`);
  console.log(`  - POST /api/scheduledPoll`);
  console.log(`  - POST /api/notifications`);
  console.log(`  - POST /api/events/database`);
});
