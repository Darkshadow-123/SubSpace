import type { Request, Response } from 'express'; import { gql } from '../_shared/hasura.js'; import { start } from '../_shared/engine.js'
// Hasura Event Trigger handler for database_watch_events
// Users insert into database_watch_events to trigger a workflow based on data changes
export default async (req: Request, res: Response) => {
  try {
    // Validate Hasura webhook secret
    const secret = req.headers['x-webhook-secret'] as string; if (secret !== process.env.NHOST_WEBHOOK_SECRET) throw new Error('Unauthorized');
    const event = req.body.event; if (!event?.data?.new) throw new Error('No event data');
    const watchEvent = event.data.new;
    // watchEvent has: id, workflow_id, org_id, payload, processed
    const wfData = await gql<any>('query($id:uuid!){workflows_by_pk(id:$id){created_by}}', {id: watchEvent.workflow_id});
    if (!wfData.workflows_by_pk?.created_by) throw new Error('Workflow creator not found');
    const run = await start(watchEvent.workflow_id, wfData.workflows_by_pk.created_by, 'database_event', watchEvent.payload || {});
    // Mark event as processed
    await gql('mutation($id:uuid!){update_database_watch_events_by_pk(pk_columns:{id:$id},_set:{processed:true}){id}}', {id: watchEvent.id});
    res.json({run_id: run, status: 'started'});
  } catch (e) {
    res.status(401).json({error: e instanceof Error ? e.message : 'Unknown error'});
  }
}

