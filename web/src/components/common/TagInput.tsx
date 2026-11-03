import { useState, type ClipboardEvent, type KeyboardEvent } from 'react'

import { Chip, Input, Label, TextField } from '@heroui/react'
import { X } from 'lucide-react'

import { normalizeTags } from '../../utils/tags'

interface TagInputProps {
  value: string[]
  onChange: (next: string[]) => void
  placeholder?: string
  maxLength?: number
  ariaLabel: string
}

const splitRaw = (raw: string): string[] => raw.split(/[\n,，、]/)

/**
 * 标签式输入：回车 / 逗号提交一个标签，支持一次粘贴多个（逗号或换行分隔）。
 */
const TagInput = ({ value, onChange, placeholder, maxLength, ariaLabel }: TagInputProps) => {
  const [draft, setDraft] = useState('')

  const commit = (raw: string) => {
    const next = normalizeTags([...value, ...splitRaw(raw)])
    setDraft('')
    if (next.length !== value.length) onChange(next)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',' || event.key === '，') {
      event.preventDefault()
      if (draft.trim()) commit(draft)
      return
    }

    if (event.key === 'Backspace' && draft.length === 0 && value.length > 0) {
      onChange(value.slice(0, -1))
    }
  }

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData('text')
    if (!/[\n,，、]/.test(text)) return
    event.preventDefault()
    commit(`${draft}${text}`)
  }

  return (
    <div className="flex min-h-11 w-full flex-wrap items-center gap-2 rounded-xl border border-border bg-field px-2.5 py-2 focus-within:border-accent">
      {value.map((tag) => (
        <Chip key={tag} color="default" size="sm" variant="soft">
          <Chip.Label className="flex items-center gap-1">
            <span className="max-w-52 truncate">{tag}</span>
            <button
              aria-label={`删除标签 ${tag}`}
              className="cursor-pointer rounded-full p-0.5 text-muted transition-colors hover:text-danger"
              type="button"
              onClick={() => onChange(value.filter((item) => item !== tag))}
            >
              <X className="size-3" aria-hidden="true" />
            </button>
          </Chip.Label>
        </Chip>
      ))}
      <TextField
        aria-label={ariaLabel}
        className="min-w-28 flex-1"
        value={draft}
        onChange={setDraft}
      >
        <Label className="sr-only">{ariaLabel}</Label>
        <Input
          maxLength={maxLength}
          placeholder={value.length === 0 ? placeholder : '继续输入，回车添加'}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
        />
      </TextField>
    </div>
  )
}

export default TagInput
