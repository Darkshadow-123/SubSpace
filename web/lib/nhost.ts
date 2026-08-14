import { NhostClient } from '@nhost/nhost-js'
export type UserRole = 'owner' | 'editor' | 'viewer'

export const nhost = new NhostClient({subdomain:process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN||'local',region:process.env.NEXT_PUBLIC_NHOST_REGION||undefined})

export async function graph<T>(query: string, variables: Record<string, unknown> = {}, role?: UserRole): Promise<T> {
  const token = (await nhost.auth.getSession())?.accessToken
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (token) headers['authorization'] = `Bearer ${token}`
  if (role) headers['x-hasura-role'] = role

  const r = await fetch(nhost.graphql.getUrl(), {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables })
  })
  const b = await r.json()
  if (b.errors) {
    const msg = b.errors.map((e: { message: string }) => e.message).join(', ')
    if (role && msg.includes('Your requested role is not in allowed roles')) {
      // Retry without x-hasura-role header so Hasura falls back to the JWT's default role
      return graph<T>(query, variables, undefined)
    }
    throw new Error(msg)
  }
  return b.data
}

export async function getSessionRole(): Promise<UserRole> {
  const user = (await nhost.auth.getSession())?.user
  if (!user) return 'viewer'

  // First try querying without explicitly setting x-hasura-role (uses JWT default role)
  try {
    const data = await graph<{ org_members: { role: string }[] }>(
      'query($user:uuid!){org_members(where:{user_id:{_eq:$user}}){role}}',
      { user: user.id }
    )
    const roles = data.org_members.map((member) => member.role)
    if (roles.includes('owner')) return 'owner'
    if (roles.includes('editor')) return 'editor'
    if (roles.includes('viewer')) return 'viewer'
  } catch {
    // Fallback: Try with explicit roles in priority order
    for (const r of ['owner', 'editor', 'viewer'] as UserRole[]) {
      try {
        const data = await graph<{ org_members: { role: string }[] }>(
          'query($user:uuid!){org_members(where:{user_id:{_eq:$user}}){role}}',
          { user: user.id },
          r
        )
        const roles = data.org_members.map((member) => member.role)
        if (roles.includes('owner')) return 'owner'
        if (roles.includes('editor')) return 'editor'
        if (roles.includes('viewer')) return 'viewer'
      } catch {}
    }
  }
  return 'viewer'
}

