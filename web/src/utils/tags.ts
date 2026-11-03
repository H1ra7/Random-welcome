/**
 * 把「一行一个 / 逗号分隔」的输入拆成标签数组，去空、去重、保留顺序。
 */
export const parseTags = (raw: string): string[] => {
  const seen = new Set<string>()
  const tags: string[] = []
  for (const piece of raw.split(/[\n,，、]/)) {
    const tag = piece.trim()
    if (!tag || seen.has(tag)) continue
    seen.add(tag)
    tags.push(tag)
  }
  return tags
}

/** 去掉数组里的空串与重复项。 */
export const normalizeTags = (values: string[]): string[] => {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const tag = value.trim()
    if (!tag || seen.has(tag)) continue
    seen.add(tag)
    result.push(tag)
  }
  return result
}

export const deepClone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
