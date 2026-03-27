/**
 * Auto-categorization rules (mirrors server-side Edge Function logic).
 * Used client-side for display purposes only.
 */
import type { ActivityCategory } from './supabase'

const DEEP_WORK_BUNDLES = new Set([
  'com.microsoft.VSCode', 'com.apple.Xcode', 'com.figma.Desktop',
  'org.vim.MacVim', 'com.sublimetext', 'com.notion.id', 'com.linear.app',
])

const MEETING_BUNDLES = new Set([
  'us.zoom.xos', 'com.microsoft.teams', 'com.google.Meet', 'com.apple.FaceTime',
])

const COMMS_BUNDLES = new Set([
  'com.tinyspeck.slackmacgap', 'com.apple.mail', 'com.microsoft.Outlook', 'com.apple.MobileSMS',
])

const DEEP_WORK_URLS = ['github.com', 'gitlab.com', 'figma.com', 'notion.so', 'linear.app', 'vercel.com', 'docs.google.com']
const MEETING_URLS = ['meet.google.com', 'zoom.us', 'teams.microsoft.com']
const COMMS_URLS = ['mail.google.com', 'slack.com', 'linear.app/inbox']
const OFF_TASK_URLS = ['twitter.com', 'x.com', 'instagram.com', 'facebook.com', 'reddit.com', 'youtube.com', 'netflix.com', 'tiktok.com']

export function categorize(bundleId: string | null, url: string | null): ActivityCategory {
  if (bundleId) {
    if (DEEP_WORK_BUNDLES.has(bundleId) || [...DEEP_WORK_BUNDLES].some(b => bundleId.startsWith(b))) return 'deep_work'
    if (MEETING_BUNDLES.has(bundleId)) return 'meeting'
    if (COMMS_BUNDLES.has(bundleId)) return 'communication'
  }
  if (url) {
    if (OFF_TASK_URLS.some(u => url.includes(u))) return 'off_task'
    if (MEETING_URLS.some(u => url.includes(u))) return 'meeting'
    if (COMMS_URLS.some(u => url.includes(u))) return 'communication'
    if (DEEP_WORK_URLS.some(u => url.includes(u))) return 'deep_work'
  }
  return 'untracked'
}

export const CATEGORY_COLORS: Record<string, string> = {
  deep_work:     'var(--cat-deep)',
  meeting:       'var(--cat-meeting)',
  communication: 'var(--cat-comms)',
  off_task:      'var(--cat-offtask)',
  idle:          'var(--cat-idle)',
  untracked:     'var(--cat-idle)',
}

export const CATEGORY_LABELS: Record<string, string> = {
  deep_work:     'Deep Work',
  meeting:       'Meetings',
  communication: 'Communication',
  off_task:      'Off-task',
  idle:          'Idle',
  untracked:     'Untracked',
}
