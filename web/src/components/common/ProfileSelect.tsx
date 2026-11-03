import { Description, Label, ListBox, Select } from '@heroui/react'

import type { ProfileSummary } from '../../types/api'

interface ProfileSelectProps {
  value: string
  onChange: (value: string) => void
  profiles: ProfileSummary[]
  label?: string
  className?: string
}

/**
 * 风格选择器：选项里带上内置 / 条目数量提示。
 */
const ProfileSelect = ({ value, onChange, profiles, label = '风格', className }: ProfileSelectProps) => (
  <Select
    aria-label={label}
    className={className}
    fullWidth
    placeholder={label}
    value={value}
    variant="secondary"
    onChange={(nextValue) => {
      if (nextValue === null || Array.isArray(nextValue)) return
      onChange(String(nextValue))
    }}
  >
    <Label className="font-semibold">{label}</Label>
    <Select.Trigger>
      <Select.Value />
      <Select.Indicator />
    </Select.Trigger>
    <Select.Popover>
      <ListBox>
        {profiles.map((profile) => (
          <ListBox.Item key={profile.name} id={profile.name} textValue={profile.name}>
            <div className="flex min-w-0 flex-col gap-1">
              <Label>{profile.name}</Label>
              <Description>
                {profile.builtin ? '插件内置' : '自定义'} · 词条 {profile.lexiconCount} · 模板 {profile.templateCount}
              </Description>
            </div>
            <ListBox.ItemIndicator />
          </ListBox.Item>
        ))}
      </ListBox>
    </Select.Popover>
  </Select>
)

export default ProfileSelect
