import type { Lamp } from '../lib/light'

const LAMPS = ['red', 'amber', 'green'] as const

/** Vertical 3-lamp light: top red, middle amber, bottom green. Decorative: the phrase live region says the same. */
export function TrafficLight({ lamp, speaking }: { lamp: Lamp; speaking: boolean }) {
  return (
    <div className={speaking ? 'light light--speaking' : 'light'} aria-hidden="true" data-lamp={lamp}>
      {LAMPS.map((l) => (
        <i key={l} className={l === lamp ? `lamp lamp--${l} lamp--on` : `lamp lamp--${l}`} />
      ))}
    </div>
  )
}
