import type { ReactNode } from 'react'

/* Small JRPG-style UI kit: parchment panels, name plates, stat rows, bars, ornaments and icons.
   Everything is drawn with CSS and inline SVG (no external art), styled with the classes in styles.css. */

export function Panel({ className = '', children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`rpg-panel ${className}`} {...rest}>
      <i className="rpg-corner tl" />
      <i className="rpg-corner tr" />
      <i className="rpg-corner bl" />
      <i className="rpg-corner br" />
      {children}
    </div>
  )
}

export function Plate({ children }: { children: ReactNode }) {
  return <div className="rpg-plate"><span>{children}</span></div>
}

export function Divider() {
  return (
    <svg className="rpg-divider" viewBox="0 0 200 10" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 5h82M118 5h82" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <path d="M100 0l5 5-5 5-5-5z" fill="currentColor" />
      <circle cx="88" cy="5" r="1.6" fill="currentColor" />
      <circle cx="112" cy="5" r="1.6" fill="currentColor" />
    </svg>
  )
}

export function Stat({ label, value, plus }: { label: string; value: ReactNode; plus?: number }) {
  return (
    <div className="rpg-stat">
      <span>{label}</span>
      <i />
      <b>{value}{plus ? <em>+{plus}</em> : null}</b>
    </div>
  )
}

export function Bar({ label, value, max, kind }: { label: string; value: number; max: number; kind: 'hp' | 'mp' | 'xp' }) {
  return (
    <div className={`rpg-bar ${kind}`}>
      <span className="lb">{label}</span>
      <div className="tr"><div className="fl" style={{ width: `${Math.max(0, Math.min(1, value / max)) * 100}%` }} /></div>
      <span className="nm">{value}/{max}</span>
    </div>
  )
}

type IconName = 'sword' | 'shield' | 'bag' | 'scroll' | 'star' | 'heart' | 'gear' | 'shard' | 'lock'
const PATHS: Record<IconName, ReactNode> = {
  sword: <><path d="M6 26 22 10l3-6 2 2-6 3L8 28z" fill="#e8ecf2" stroke="#3a2412" strokeWidth="1.6" strokeLinejoin="round" /><path d="M4 22l6 6M3 29l3-3" stroke="#3a2412" strokeWidth="2.4" strokeLinecap="round" /></>,
  shield: <path d="M16 3 5 7v8c0 7 5 12 11 14 6-2 11-7 11-14V7z" fill="#5b82c4" stroke="#3a2412" strokeWidth="1.8" strokeLinejoin="round" />,
  bag: <><path d="M10 11c0-4 2.500-7 6-7s6 3 6 7" fill="none" stroke="#3a2412" strokeWidth="2" /><path d="M6 12h20l2 16H4z" fill="#c98b3c" stroke="#3a2412" strokeWidth="1.8" strokeLinejoin="round" /></>,
  scroll: <><path d="M8 5h15a3 3 0 0 1 3 3v18a3 3 0 0 0 3 3H11a3 3 0 0 1-3-3z" fill="#f4e6bd" stroke="#3a2412" strokeWidth="1.8" strokeLinejoin="round" /><path d="M12 11h10M12 16h10M12 21h7" stroke="#3a2412" strokeWidth="1.6" strokeLinecap="round" /></>,
  star: <path d="m16 3 3.800 8.200 8.800 1-6.600 6 1.900 8.800L16 22.600 8.100 27l1.900-8.800-6.600-6 8.800-1z" fill="#f2c94c" stroke="#3a2412" strokeWidth="1.6" strokeLinejoin="round" />,
  heart: <path d="M16 28S4 20 4 11a6 6 0 0 1 12-2 6 6 0 0 1 12 2c0 9-12 17-12 17z" fill="#e0453a" stroke="#3a2412" strokeWidth="1.8" strokeLinejoin="round" />,
  gear: <><circle cx="16" cy="16" r="5" fill="#d8c79a" stroke="#3a2412" strokeWidth="1.8" /><path d="M16 3v5M16 24v5M3 16h5M24 16h5M7 7l3.500 3.500M21.500 21.500 25 25M25 7l-3.500 3.500M10.500 21.500 7 25" stroke="#3a2412" strokeWidth="2.600" strokeLinecap="round" /></>,
  shard: <path d="m16 2 8 10-3 17H11L8 12z" fill="#9fe6ff" stroke="#3a2412" strokeWidth="1.800" strokeLinejoin="round" />,
  lock: <><rect x="7" y="14" width="18" height="14" rx="3" fill="#a79a78" stroke="#3a2412" strokeWidth="1.800" /><path d="M11 14v-3a5 5 0 0 1 10 0v3" fill="none" stroke="#3a2412" strokeWidth="2" /></>,
}
export function Icon({ name, size = 24 }: { name: IconName; size?: number }) {
  return <svg className="rpg-icon" viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">{PATHS[name]}</svg>
}
