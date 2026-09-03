import { ArrowUpRight, Send, Youtube } from 'lucide-react'

const TELEGRAM_URL = 'https://t.me/fox_script_vip'
const YOUTUBE_URL = 'https://youtube.com/@nano_scriptt?si=b-81mV0awzjsRmbv'

interface SocialChannel {
  label: string
  handle: string
  url: string
  icon: typeof Send
  tile: string
  hover: string
}

const CHANNELS: readonly SocialChannel[] = [
  {
    label: 'Telegram',
    handle: '@fox_script_vip',
    url: TELEGRAM_URL,
    icon: Send,
    tile: 'border-cyan-300/25 bg-cyan-300/[.08] text-cyan-200',
    hover: 'hover:border-cyan-300/60 hover:shadow-[0_0_24px_rgba(99,216,232,.18)]',
  },
  {
    label: 'YouTube',
    handle: '@nano_scriptt',
    url: YOUTUBE_URL,
    icon: Youtube,
    tile: 'border-rose-300/25 bg-rose-300/[.08] text-rose-200',
    hover: 'hover:border-rose-300/60 hover:shadow-[0_0_24px_rgba(251,113,133,.16)]',
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
    <div>
      <div className="mb-2.5 flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        <span className="text-[10px] font-bold uppercase tracking-[.22em] text-slate-600">Community</span>
        <span className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </div>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {CHANNELS.map(({ label, handle, url, icon: Icon, tile, hover }) => (
          <a
            key={label}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${label} channel in a new tab`}
            className={`group flex min-h-[56px] items-center gap-3 rounded-xl border border-white/10 bg-white/[.03] px-3.5 py-2.5 backdrop-blur-sm transition duration-200 hover:-translate-y-0.5 hover:bg-white/[.05] active:translate-y-0 active:scale-[.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 ${hover}`}
          >
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition duration-200 group-hover:scale-105 ${tile}`}
            >
              <Icon className="h-[18px] w-[18px]" strokeWidth={2.2} />
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block text-sm font-bold text-slate-100">{label}</span>
              <span className="mono block truncate text-[11px] text-slate-500">{handle}</span>
            </span>
            <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-600 transition duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-slate-300" />
          </a>
        ))}
      </div>
    </div>
  )
}
