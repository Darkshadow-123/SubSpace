'use client'
import {useEffect,useState} from 'react'; import {createClient} from 'graphql-ws'; import {nhost} from '@/lib/nhost'
type Item={position:number,status:string,error?:string|null,output?:unknown}
export function RunLive({runId,canApprove,onApprove}: {runId:string; canApprove:boolean; onApprove:(position:number)=>Promise<void>; role:'owner'|'editor'|'viewer'}) {
  const [items,setItems]=useState<Item[]>([]);
  useEffect(()=>{
    let dispose=()=>{};
    (async()=>{
      const token=(await nhost.auth.getSession())?.accessToken;
      const client=createClient({
        url:nhost.graphql.getUrl().replace(/^http/,'ws'),
        connectionParams:{headers:{authorization:`Bearer ${token}`}}
      });
      dispose=client.subscribe(
        {query:'subscription($id:uuid!){step_runs(where:{workflow_run_id:{_eq:$id}},order_by:{position:asc}){position status error output}}',variables:{id:runId}},
        {next:(v)=>setItems((v.data as {step_runs:Item[]}).step_runs),error:console.error,complete:()=>{}}
      )
    })();
    return()=>dispose()
  },[runId]);
  return <ol className="run">{items.map(s=><li key={s.position}><b>Step {s.position+1}</b><span className={`status ${s.status}`}>{s.status}</span>{s.error&&<small>{s.error}</small>}{s.status==='paused'&&canApprove&&<button onClick={()=>onApprove(s.position)}>Approve & continue</button>}</li>)}</ol>
}

