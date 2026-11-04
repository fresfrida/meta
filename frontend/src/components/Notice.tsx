import { AlertIcon } from './Icons'

/** Errors and warnings: white text with an icon (no red; colour is only for the traffic light). */
export function Notice({ title, body, role = 'alert' }: { title: string; body?: string; role?: 'alert' | 'status' }) {
  return (
    <div className="notice" role={role}>
      <AlertIcon />
      <div className="notice__text">
        <span className="notice__title">{title}</span>
        {body && <span className="notice__body">{body}</span>}
      </div>
    </div>
  )
}
