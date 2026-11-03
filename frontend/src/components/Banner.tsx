export function Banner({ title, body }: { title: string; body: string }) {
  return (
    <div className="banner" role="alert">
      <span className="banner__title">{title}</span>
      <span className="banner__body">{body}</span>
    </div>
  )
}
