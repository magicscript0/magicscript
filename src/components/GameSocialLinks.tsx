import { ArrowUpRight, Send, Youtube } from 'lucide-react'
import type { SocialLinks as SocialLinksValue } from '../types/supabase'

/**
 * Fallback channels used ONLY when the caller does not provide admin-managed
 * links (e.g. standalone usage and the existing login tests). The public flow
 * always passes the Supabase-controlled links instead.
 */
const DEFAULT_TELEGRAM_URL = 'https://t.me/fox_script_vip'
const DEFAULT_YOUTUBE_URL = 'https://youtube.com/@nano_scriptt'

interface SocialChannel {
  label: string
  handle: string
  url: string
  icon: typeof Send
  /** Public-only accent classes (see the premium layer in index.css). */
  accent: string
}

function handleFromUrl(url: string, label: string): string {
  try {
    const path = new URL(url).pathname.split('/').filter(Boolean).pop() ?? ''
    return path.startsWith('@') ? path : `@${label.toLowerCase()}`
  } catch {
    return `@${label.toLowerCase()}`
  }
}

const DEFAULT_CHANNELS: readonly SocialChannel[] = [
  { label: 'Telegram', handle: '@fox_script_vip', url: DEFAULT_TELEGRAM_URL, icon: Send, accent: 'pg-social--ice' },
  { label: 'YouTube', handle: '@nano_scriptt', url: DEFAULT_YOUTUBE_URL, icon: Youtube, accent: 'pg-social--rose' },
]

/**
 * Community channels on the public Game Login screen.
 *
 * Consumes the admin-managed `social_links` when provided (a cleared link is
 * hidden, matching the admin dashboard's preview); falls back to the fixed
 * public defaults otherwise. Links always open safely in a new tab.
 */
export function GameSocialLinks({ links }: { links?: SocialLinksValue }) {
  const channels: readonly SocialChannel[] = links
    ? ([
        links.telegramUrl ? { label: 'Telegram', handle: handleFromUrl(links.telegramUrl, 'Telegram'), url: links.telegramUrl, icon: Send, accent: 'pg-social--ice' } : null,
        links.youtubeUrl ? { label: 'YouTube', handle: handleFromUrl(links.youtubeUrl, 'YouTube'), url: links.youtubeUrl, icon: Youtube, accent: 'pg-social--rose' } : null,
      ].filter((channel): channel is SocialChannel => channel !== null))
    : DEFAULT_CHANNELS

  if (channels.length === 0) return null

  return (
    <div className="pg-social">
      <div className="pg-social__head" aria-hidden="true">
        <span className="pg-social__rule" />
        <span className="pg-eyebrow">Community</span>
        <span className="pg-social__rule" />
      </div>
      <div className="pg-social__grid">
        {channels.map(({ label, handle, url, icon: Icon, accent }) => (
          <a
            key={label}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${label} channel in a new tab`}
            className={`pg-social__link group ${accent}`}
          >
            <span className="pg-social__tile">
              <Icon className="h-[18px] w-[18px]" strokeWidth={2.2} aria-hidden="true" />
            </span>
            <span className="pg-social__text">
              <span className="pg-social__label">{label}</span>
              <span className="pg-social__handle mono">{handle}</span>
            </span>
            <ArrowUpRight className="pg-social__out" aria-hidden="true" />
          </a>
        ))}
      </div>
    </div>
  )
}
