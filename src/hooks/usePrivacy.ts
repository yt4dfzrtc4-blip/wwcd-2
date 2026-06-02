'use client'

import { useState, useEffect } from 'react'

const KEY = 'wwcd-privacy'

export function usePrivacy() {
  const [privacy, setPrivacyState] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(KEY)
    if (stored === 'true') setPrivacyState(true)
  }, [])

  function setPrivacy(value: boolean) {
    setPrivacyState(value)
    localStorage.setItem(KEY, String(value))
  }

  function togglePrivacy() {
    setPrivacy(!privacy)
  }

  return { privacy, togglePrivacy }
}
