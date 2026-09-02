import { Send, Youtube } from 'lucide-react'
import type { SocialLinks as SocialLinksValue } from '../types/supabase'

export function SocialLinks({ links, compact = false }: { links: SocialLinksValue; compact?: boolean }) {
  const items = [
    links.telegramUrl ? { label: 'Telegram', url: links.telegramUrl, icon: Send } : null,
    links.youtubeUrl ? { label: 'YouTube', url: links.youtubeUrl, icon: Youtube } : null,
  ].filter((item): item is { label: string; url: string; icon: typeof Send } => item !== null)

  if (items.length === 0) return null
  return (
    <div className={`flex ${compact ? 'items-center gap-1.5' : 'flex-wrap gap-2'}`}>
      {items.map(({ label, url, icon: Icon }) => (
        <a
          key={label}
          href={url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-700/80 bg-slate-900/50 px-3 text-xs font-semibold text-slate-300 transition hover:border-emerald-300/40 hover:bg-emerald-300/10 hover:text-emerald-200"
        >
          <Icon className="h-3.5 w-3.5" />
          <span className={compact ? 'hidden sm:inline' : ''}>{label}</span>
        </a>
      ))}
    </div>
  )
}
