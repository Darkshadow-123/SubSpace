import { NhostClient } from '@nhost/nhost-js'
export type UserRole = 'owner' | 'editor' | 'viewer'

export const nhost = new NhostClient({subdomain:process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN||'local',region:process.env.NEXT_PUBLIC_NHOST_REGION||undefined})

export async function graph<T>(query:string,variables:Record<string,unknown>={},role:UserRole='viewer'):Promise<T>{const token=(await nhost.auth.getSession())?.accessToken; const r=await fetch(nhost.graphql.getUrl(),{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{ }),'x-hasura-role':role},body:JSON.stringify({query,variables})});const b=await r.json();if(b.errors)throw new Error(b.errors.map((e:{message:string})=>e.message).join(', '));return b.data}

export async function getSessionRole(): Promise<UserRole> {
  const user = (await nhost.auth.getSession())?.user
  if (!user) return 'viewer'

  try {
    const data = await graph<{org_members: {role: string}[]}>(
      'query($user:uuid!){org_members(where:{user_id:{_eq:$user}}){role}}',
      {user: user.id},
      'viewer'
    )

    const roles = data.org_members.map((member) => member.role)
    if (roles.includes('owner')) return 'owner'
    if (roles.includes('editor')) return 'editor'
    return 'viewer'
  } catch {
    return 'viewer'
  }
}
