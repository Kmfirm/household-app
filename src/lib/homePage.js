import { supabase } from './supabase'
import { ALL_NAV_ITEMS } from './navItems'

// The page each user wants the app to open on. Stored on their account (auth user metadata)
// so it follows them across devices and each household member can pick their own.

export function getHomePage(user) {
  const saved = user?.user_metadata?.home_page
  return ALL_NAV_ITEMS.some(i => i.to === saved) ? saved : '/'
}

export function setHomePage(path) {
  return supabase.auth.updateUser({ data: { home_page: path } })
}
