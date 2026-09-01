type Props = {
  title: string
  unreadCount?: number
  onOpenReference: () => void
  onOpenNotifications: () => void
}

export default function TopBar({ title, unreadCount = 0, onOpenReference, onOpenNotifications }: Props) {
  return (
    <header className="app-topbar">
      <div className="app-topbar__inner">
        <div>
          <div className="app-brand">MEGANOTRPG</div>
          <h1 className="app-title">{title}</h1>
        </div>

        <div className="app-topbar__actions">
          <button className="icon-button topbar-reference-button" aria-label="Справочник" type="button" onClick={onOpenReference}>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H12v18H7.5A2.5 2.5 0 0 0 5 22V4.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/>
              <path d="M19 4.5A2.5 2.5 0 0 0 16.5 2H12v18h4.5A2.5 2.5 0 0 1 19 22V4.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/>
            </svg>
          </button>

          <button className="icon-button topbar-notification-button" aria-label="Уведомления" type="button" onClick={onOpenNotifications}>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M10.3 19a2 2 0 0 0 3.4 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
            {unreadCount > 0 && <span>{unreadCount > 9 ? "9+" : unreadCount}</span>}
          </button>
        </div>
      </div>
    </header>
  )
}
