import { ReactNode } from 'react'

type PageShellProps = {
  eyebrow?: string
  title: string
  subtitle?: string
  actions?: ReactNode
  children: ReactNode
}

export default function PageShell({
  eyebrow,
  title,
  subtitle,
  actions,
  children,
}: PageShellProps) {
  return (
    <div className="space-y-6">
      <section className="tf-card">
        <div className="tf-card-content flex flex-col gap-4 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            {eyebrow && (
              <p className="mb-2 text-xs font-black uppercase tracking-[0.22em] text-cyan-400">
                {eyebrow}
              </p>
            )}

            <h2 className="text-2xl font-black tracking-tight text-[var(--tf-text)] sm:text-3xl">
              {title}
            </h2>

            {subtitle && (
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--tf-muted)]">
                {subtitle}
              </p>
            )}
          </div>

          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      </section>

      {children}
    </div>
  )
}