import type { Request, Response } from 'express'; import { gql } from '../_shared/hasura.js'
// Hasura Event Trigger handler for notification_events
export default async (req: Request, res: Response) => {
  try {
    // Validate Hasura webhook secret
    const secret = req.headers['x-webhook-secret'] as string; if (secret !== process.env.NHOST_WEBHOOK_SECRET) throw new Error('Unauthorized');
    const event = req.body.event; if (!event) throw new Error('No event data');
    const {id, payload} = event.data.new;
    // Mark as processed
    await gql('mutation($id:uuid!){update_notification_events_by_pk(pk_columns:{id:$id},_set:{processed:true}){id}}', {id});
    // Send webhook notification (could extend to other channels)
    const webhookUrl = (payload as Record<string, unknown>).webhook_url;
    if (webhookUrl) {
      try {
        await fetch(String(webhookUrl), {
          method: 'POST', headers: {'content-type': 'application/json'},
          body: JSON.stringify({event_id: id, payload, timestamp: new Date().toISOString()})
        });
      } catch (e) { /* Log but don't fail */ }
    }
    res.json({success: true, event_id: id});
  } catch (e) {
    res.status(401).json({error: e instanceof Error ? e.message : 'Unknown error'});
  }
}
