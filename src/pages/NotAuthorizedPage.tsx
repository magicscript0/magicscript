import { LockKeyhole } from 'lucide-react'

export function NotAuthorizedPage() {
  return <div className="panel mx-auto max-w-xl py-12 text-center"><LockKeyhole className="mx-auto h-8 w-8 text-amber-300" /><h1 className="mt-4 text-lg font-semibold text-slate-100">Access restricted</h1><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">You do not have permission to view this workspace area. Ask a workspace administrator to update your role.</p></div>
}
