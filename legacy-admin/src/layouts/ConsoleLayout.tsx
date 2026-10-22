import type { ReactNode } from 'react'

export interface ConsoleLayoutProps { header: ReactNode; children: ReactNode }
export function ConsoleLayout({ header, children }: ConsoleLayoutProps) { return <div className="flex min-h-full flex-col"><div className="sticky top-0 z-20">{header}</div><main className="mx-auto w-full max-w-5xl flex-1 px-3 pb-8 pt-4 sm:px-5 sm:pt-6">{children}</main><footer className="border-t border-white/[.06] px-4 py-4"><p className="mx-auto max-w-5xl text-center text-[11px] leading-relaxed text-slate-600">MAGIC SCRIPT · game visualization control surface · no real-money functionality</p></footer></div> }
