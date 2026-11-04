// Which screen shows while the camera is off (Brief 21: Settings opens from the public welcome screen too).
export type StoppedScreen = 'full' | 'settings' | 'welcome' | 'home'

export function stoppedScreen(o: { refused: boolean; settingsOpen: boolean; publicDemo: boolean }): StoppedScreen {
  if (o.refused) return 'full'
  if (o.settingsOpen) return 'settings' // Done returns to the welcome screen (public) or Home
  return o.publicDemo ? 'welcome' : 'home'
}
