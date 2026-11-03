interface StateCardProps {
  title: string
  body: string
  tone?: 'neutral' | 'error'
}

export function StateCard({ title, body, tone = 'neutral' }: StateCardProps) {
  return (
    <section className={`state state--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <h1 className="state__title">{title}</h1>
      <p className="state__body">{body}</p>
    </section>
  )
}
