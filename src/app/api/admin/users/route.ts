import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

async function isAdminAuthorized(req: NextRequest): Promise<boolean> {
  const cookieStore = await cookies()
  const session = cookieStore.get('admin_session')?.value
  return session === process.env.ADMIN_PASSWORD
}

// POST /api/admin/users — cria auth user e vincula ao collaborator
export async function POST(req: NextRequest) {
  if (!(await isAdminAuthorized(req))) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { email, password, collaboratorId } = await req.json()

  if (!email || !password || !collaboratorId) {
    return NextResponse.json({ error: 'Dados incompletos' }, { status: 400 })
  }

  // Cria usuário no Supabase Auth
  const { data: { user }, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // confirma o email automaticamente
  })

  if (createError || !user) {
    return NextResponse.json({ error: createError?.message ?? 'Erro ao criar usuário' }, { status: 400 })
  }

  // Vincula o user_id ao collaborator
  const { error: updateError } = await supabaseAdmin
    .from('collaborators')
    .update({ user_id: user.id })
    .eq('id', collaboratorId)

  if (updateError) {
    // Rollback: deleta o user criado
    await supabaseAdmin.auth.admin.deleteUser(user.id)
    return NextResponse.json({ error: 'Erro ao vincular colaborador' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, userId: user.id })
}

// DELETE /api/admin/users — remove acesso de um collaborator
export async function DELETE(req: NextRequest) {
  if (!(await isAdminAuthorized(req))) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { collaboratorId } = await req.json()

  // Busca o user_id atual
  const { data: collab } = await supabaseAdmin
    .from('collaborators')
    .select('user_id')
    .eq('id', collaboratorId)
    .single()

  if (!collab?.user_id) {
    return NextResponse.json({ error: 'Colaborador sem acesso configurado' }, { status: 400 })
  }

  // Remove o user do Auth
  await supabaseAdmin.auth.admin.deleteUser(collab.user_id)

  // Desvincula do collaborator
  await supabaseAdmin.from('collaborators').update({ user_id: null }).eq('id', collaboratorId)

  return NextResponse.json({ ok: true })
}
