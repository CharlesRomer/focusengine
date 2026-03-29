import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  try {
    const { taskId, action } = await req.json() as { taskId: string; action: 'upsert' | 'delete' }

    if (!taskId || !action) {
      return new Response(JSON.stringify({ error: 'taskId and action are required' }), {
        status: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const notionToken = Deno.env.get('NOTION_TOKEN')
    const notionDbId = Deno.env.get('NOTION_DATABASE_ID')

    if (!notionToken || !notionDbId) {
      return new Response(JSON.stringify({ error: 'Notion not configured' }), {
        status: 503,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // Use service role key — required to read sub_project_tasks, sub_projects, users
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // Fetch task with joined sub_project (for due_date) and owner user (for display_name)
    const { data: task, error: taskErr } = await supabase
      .from('sub_project_tasks')
      .select('*, sub_projects(name, due_date), users!sub_project_tasks_owner_id_fkey(display_name)')
      .eq('id', taskId)
      .single()

    if (taskErr || !task) {
      console.error('[notion-sync] task fetch error:', taskErr)
      return new Response(JSON.stringify({ error: 'Task not found', detail: taskErr?.message }), {
        status: 404,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // ── Delete action ─────────────────────────────────────────────────────────

    if (action === 'delete' && task.notion_page_id) {
      try {
        const archiveRes = await fetch(`https://api.notion.com/v1/pages/${task.notion_page_id}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${notionToken}`,
            'Notion-Version': '2022-06-28',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ archived: true }),
        })
        if (!archiveRes.ok) {
          const body = await archiveRes.text()
          console.error(`[notion-sync] archive failed ${archiveRes.status}:`, body)
        }
      } catch (err) {
        console.error('[notion-sync] archive request error:', err)
      }

      await supabase
        .from('sub_project_tasks')
        .update({ notion_page_id: null, notion_synced_at: null })
        .eq('id', taskId)

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // ── Upsert action ─────────────────────────────────────────────────────────

    const ownerName: string | null = task.users?.display_name ?? null
    const dueDate: string | null = task.sub_projects?.due_date ?? null

    const notionPayload = {
      parent: { database_id: notionDbId },
      properties: {
        Title: {
          title: [{ text: { content: task.title } }],
        },
        Owner: {
          rich_text: [{ text: { content: ownerName ?? '' } }],
        },
        'Due Date': dueDate ? {
          date: { start: dueDate }, // format: 'YYYY-MM-DD'
        } : undefined,
        Status: {
          select: { name: task.is_complete ? 'Done' : 'Not started' },
        },
      },
    }

    // Remove undefined properties before sending
    Object.keys(notionPayload.properties).forEach(key => {
      if ((notionPayload.properties as Record<string, unknown>)[key] === undefined) {
        delete (notionPayload.properties as Record<string, unknown>)[key]
      }
    })

    let notionPageId: string | null = task.notion_page_id ?? null

    try {
      if (notionPageId) {
        // Update existing page
        const updateRes = await fetch(`https://api.notion.com/v1/pages/${notionPageId}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${notionToken}`,
            'Notion-Version': '2022-06-28',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ properties: notionPayload.properties }),
        })
        if (!updateRes.ok) {
          const body = await updateRes.text()
          console.error(`[notion-sync] page update failed ${updateRes.status}:`, body)
          return new Response(JSON.stringify({ error: 'Notion update failed', detail: body }), {
            status: 502,
            headers: { ...CORS, 'Content-Type': 'application/json' },
          })
        }
        console.log(`[notion-sync] updated page ${notionPageId} for task ${taskId}`)
      } else {
        // Create new page
        const createRes = await fetch('https://api.notion.com/v1/pages', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${notionToken}`,
            'Notion-Version': '2022-06-28',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(notionPayload),
        })
        if (!createRes.ok) {
          const body = await createRes.text()
          console.error(`[notion-sync] page create failed ${createRes.status}:`, body)
          return new Response(JSON.stringify({ error: 'Notion create failed', detail: body }), {
            status: 502,
            headers: { ...CORS, 'Content-Type': 'application/json' },
          })
        }
        const page = await createRes.json() as { id?: string }
        notionPageId = page.id ?? null
        console.log(`[notion-sync] created page ${notionPageId} for task ${taskId}`)
      }
    } catch (err) {
      console.error('[notion-sync] notion API request error:', err)
      return new Response(JSON.stringify({ error: 'Notion request failed' }), {
        status: 502,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // Write notion_page_id back to the task row
    if (notionPageId) {
      const { error: updateErr } = await supabase
        .from('sub_project_tasks')
        .update({ notion_page_id: notionPageId, notion_synced_at: new Date().toISOString() })
        .eq('id', taskId)
      if (updateErr) {
        console.error('[notion-sync] failed to write notion_page_id back:', updateErr)
      }
    }

    return new Response(JSON.stringify({ ok: true, notion_page_id: notionPageId }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[notion-sync] unexpected error:', err)
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
