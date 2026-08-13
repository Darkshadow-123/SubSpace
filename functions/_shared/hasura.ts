import type { Request } from 'express'
import { createHmac, timingSafeEqual } from 'crypto'

const url = process.env.NHOST_GRAPHQL_URL!
const admin = process.env.NHOST_ADMIN_SECRET!
const rawJwtSecret = process.env.NHOST_JWT_SECRET || process.env.HASURA_GRAPHQL_JWT_SECRET || ''
const jwtSecret = (() => {
  if (!rawJwtSecret) return ''
  try {
    const parsed = JSON.parse(rawJwtSecret) as { key?: string }
    return parsed.key || rawJwtSecret
  } catch {
    return rawJwtSecret
  }
})()

export async function gql<T>(query: string, variables: Record<string, unknown>, headers: Record<string,string> = {}): Promise<T> {
  const response = await fetch(url, { method: 'POST', headers: { 'content-type':'application/json', 'x-hasura-admin-secret': admin, ...headers }, body: JSON.stringify({ query, variables }) })
  const body = await response.json() as { data?: T, errors?: { message: string }[] }
  if (!response.ok || body.errors?.length) throw new Error(body.errors?.map(e => e.message).join('; ') || 'GraphQL request failed')
  return body.data as T
}
export type ActionRequest = Request & { body: { input: Record<string, unknown>, session_variables?: Record<string,string> } }

function getHeaderValue(req: Request, name: string): string | undefined {
  const raw = req.headers[name]
  if (Array.isArray(raw)) return raw[0]
  return raw ?? undefined
}

function verifyJwt(token: string): { sub?: string, 'x-hasura-user-id'?: string } | null {
  if (!jwtSecret) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null

  const [headerPart, payloadPart, signaturePart] = parts
  const signingInput = `${headerPart}.${payloadPart}`
  const expectedSignature = createHmac('sha256', jwtSecret).update(signingInput).digest('base64url')

  try {
    const sigBuffer = Buffer.from(signaturePart, 'base64url')
    const expectedBuffer = Buffer.from(expectedSignature, 'base64url')
    if (sigBuffer.length !== expectedBuffer.length || !timingSafeEqual(sigBuffer, expectedBuffer)) {
      return null
    }
  } catch {
    return null
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8')) as { sub?: string, 'x-hasura-user-id'?: string, exp?: number }
    if (typeof payload.exp === 'number' && Date.now() >= payload.exp * 1000) return null
    return payload
  } catch {
    return null
  }
}

export function actionUser(req: ActionRequest) {
  const hasAdminSecret = getHeaderValue(req, 'x-hasura-admin-secret') === process.env.NHOST_ADMIN_SECRET
  const authHeader = getHeaderValue(req, 'authorization')
  const userId = req.body?.session_variables?.['x-hasura-user-id']

  if (hasAdminSecret && userId) return String(userId)

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length)
    const verified = verifyJwt(token)
    const id = verified?.['x-hasura-user-id'] || verified?.sub
    if (id) return String(id)
  }

  throw new Error('Unauthorized action request')
}
