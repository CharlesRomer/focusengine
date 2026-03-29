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

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // Fetch task with joined sub_project + owner
    const { data: task, error: taskErr } = await supabase
      .from('sub_project_tasks')
      .select('*, sub_projects(name, due_date), users!sub_project_tasks_owner_id_fkey(display_name)')
      .eq('id', taskId)
      .single()

    if (taskErr || !task) {
      return new Response(JSON.stringify({ error: 'Task not found' }), {
        status: 404,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'delete' && task.notion_page_id) {
      // Archive the Notion page
      await fetch(`https://api.notion.com/v1/pages/${task.notion_page_id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${notionToken}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ archived: true }),
      })

      await supabase
        .from('sub_project_tasks')
        .update({ notion_page_id: null, notion_synced_at: null })
        .eq('id', taskId)

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // Build Notion page properties
    const properties: Record<string, unknown> = {
      'Name': {
        title: [{ text: { content: task.title } }],
      },
    }

    if (task.sub_projects?.name) {
      properties['Sub-project'] = {
        rich_text: [{ text: { content: task.sub_projects.name } }],
      }
    }

    if (task.sub_projects?.due_date) {
      properties['Due date'] = {
        date: { start: task.sub_projects.due_date },
      }
    }

    if (task.users?.display_name) {
      properties['Owner'] = {
        rich_text: [{ text: { content: task.users.display_name } }],
      }
    }

    properties['Complete'] = {
      checkbox: task.is_complete,
    }

    let notionPageId = task.notion_page_id

    if (notionPageId) {
      // Update existing page
      await fetch(`https://api.notion.com/v1/pages/${notionPageId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${notionToken}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ properties }),
      })
    } else {
      // Create new page
      const res = await fetch('https://api.notion.com/v1/pages', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${notionToken}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          parent: { database_id: notionDbId },
          properties,
        }),
      })
      const page = await res.json() as { id?: string }
      notionPageId = page.id ?? null
    }

    // Store notion_page_id back on the task
    if (notionPageId) {
      await supabase
        .from('sub_project_tasks')
        .update({ notion_page_id: notionPageId, notion_synced_at: new Date().toISOString() })
        .eq('id', taskId)
    }

    return new Response(JSON.stringify({ ok: true, notion_page_id: notionPageId }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[notion-sync] error:', err)
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
