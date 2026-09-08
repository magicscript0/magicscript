import { ArrowUpRight, Send, Youtube } from 'lucide-react'

const TELEGRAM_URL = 'https://t.me/fox_script_vip'
const YOUTUBE_URL = 'https://youtube.com/@nano_scriptt?si=b-81mV0awzjsRmbv'

interface SocialChannel {
  label: string
  handle: string
  url: string
  icon: typeof Send
  /** Public-only accent classes (see the premium layer in index.css). */
  accent: string
}

const CHANNELS: readonly SocialChannel[] = [
  {
    label: 'Telegram',
    handle: '@fox_script_vip',
    url: TELEGRAM_URL,
    icon: Send,
    accent: 'pg-social--ice',
  },
  {
    label: 'YouTube',
    handle: '@nano_scriptt',
    url: YOUTUBE_URL,
    icon: Youtube,
    accent: 'pg-social--rose',
  },
]

/**
 * Community channels on the public Game Login screen.
 *
 * Fixed public links (not admin-managed): they open safely in a new tab.
 * Side-by-side on desktop, stacked on narrow mobile screens.
 */
export function GameSocialLinks() {
  return (
    <div className="pg-social">
      <div className="pg-social__head" aria-hidden="true">
        <span className="pg-social__rule" />
        <span className="pg-eyebrow">Community</span>
        <span className="pg-social__rule" />
      </div>
      <div className="pg-social__grid">
        {CHANNELS.map(({ label, handle, url, icon: Icon, accent }) => (
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
