"use client"

import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useState } from "react"
import { useTranslation } from "react-i18next"

export function PreferencesSettings() {
  const { t, i18n } = useTranslation('modals');

  const [preferences, setPreferences] = useState({
    theme: "dark",
    timezone: "UTC-3",
    compactMode: false,
    animations: true,
  })

  // Get current language from i18n (not local state)
  const currentLanguage = i18n.language.startsWith('zh') ? 'zh-CN' : 'en';

  const handleLanguageChange = (value: string) => {
    i18n.changeLanguage(value);
    // LanguageDetector will auto-persist to localStorage under key 'lina-language'
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-display mb-2">{t('preferences.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('preferences.subtitle')}</p>
      </div>

      <div className="bg-card ring-2 ring-border rounded-lg p-6 space-y-6">
        {/* Theme */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label className="text-sm uppercase text-muted-foreground">{t('preferences.theme.label')}</Label>
            <p className="text-xs text-muted-foreground">{t('preferences.theme.description')}</p>
          </div>
          <Select value={preferences.theme} onValueChange={(value) => setPreferences({ ...preferences, theme: value })}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="dark">{t('preferences.theme.dark')}</SelectItem>
              <SelectItem value="light">{t('preferences.theme.light')}</SelectItem>
              <SelectItem value="system">{t('preferences.theme.system')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Language - NOW FUNCTIONAL */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label className="text-sm uppercase text-muted-foreground">{t('preferences.language.label')}</Label>
            <p className="text-xs text-muted-foreground">{t('preferences.language.description')}</p>
          </div>
          <Select
            value={currentLanguage}
            onValueChange={handleLanguageChange}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="zh-CN">简体中文</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Timezone */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label className="text-sm uppercase text-muted-foreground">{t('preferences.timezone.label')}</Label>
            <p className="text-xs text-muted-foreground">{t('preferences.timezone.description')}</p>
          </div>
          <Select
            value={preferences.timezone}
            onValueChange={(value) => setPreferences({ ...preferences, timezone: value })}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="UTC-3">UTC-3 (Buenos Aires)</SelectItem>
              <SelectItem value="UTC-5">UTC-5 (New York)</SelectItem>
              <SelectItem value="UTC+0">UTC+0 (London)</SelectItem>
              <SelectItem value="UTC+1">UTC+1 (Paris)</SelectItem>
              <SelectItem value="UTC+8">UTC+8 (Beijing)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="border-t border-border pt-6 space-y-4">
          {/* Compact Mode */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-sm uppercase text-muted-foreground">{t('preferences.compactMode.label')}</Label>
              <p className="text-xs text-muted-foreground">{t('preferences.compactMode.description')}</p>
            </div>
            <Switch
              checked={preferences.compactMode}
              onCheckedChange={(checked) => setPreferences({ ...preferences, compactMode: checked })}
            />
          </div>

          {/* Animations */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-sm uppercase text-muted-foreground">{t('preferences.animations.label')}</Label>
              <p className="text-xs text-muted-foreground">{t('preferences.animations.description')}</p>
            </div>
            <Switch
              checked={preferences.animations}
              onCheckedChange={(checked) => setPreferences({ ...preferences, animations: checked })}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
