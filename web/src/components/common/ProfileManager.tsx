import { useState } from 'react'

import {
  Button,
  Card,
  Description,
  Input,
  Label,
  Modal,
  Separator,
  Spinner,
  TextField,
  toast,
  useOverlayState
} from '@heroui/react'
import { Pencil, Plus, Settings2, Trash2 } from 'lucide-react'

import { manageProfile } from '../../api/randomWelcome'
import type { PluginState, ProfileSummary } from '../../types/api'
import ProfileSelect from './ProfileSelect'

type ProfileAction = 'create' | 'rename' | 'delete'

interface ProfileManagerProps {
  profiles: ProfileSummary[]
  defaultProfile: string
  onState: (next: PluginState) => void
}

const actionLabel: Record<ProfileAction, string> = {
  create: '新建',
  rename: '改名',
  delete: '删除'
}

/**
 * 风格管理弹窗：新建 / 改名 / 删除。后端拒绝时把中文 message 原样展示。
 */
const ProfileManager = ({ profiles, defaultProfile, onState }: ProfileManagerProps) => {
  const overlay = useOverlayState()
  const [newName, setNewName] = useState('')
  const [renameFrom, setRenameFrom] = useState(defaultProfile)
  const [renameTo, setRenameTo] = useState('')
  const [deleteName, setDeleteName] = useState('')
  const [pendingDelete, setPendingDelete] = useState('')
  const [busy, setBusy] = useState<ProfileAction | null>(null)
  const [error, setError] = useState('')

  const runAction = async (action: ProfileAction, name: string, nextName?: string) => {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('请先填写风格名')
      return
    }

    setBusy(action)
    setError('')
    try {
      const result = await manageProfile(action, trimmed, nextName)
      onState(result.state)
      if (action === 'create') setNewName('')
      if (action === 'rename') setRenameTo('')
      if (action === 'delete') {
        setPendingDelete('')
        setDeleteName('')
      }
      toast.success(result.message, {
        description: action === 'rename' ? `「${trimmed}」→「${nextName?.trim()}」` : `「${trimmed}」`
      })
    } catch (actionError) {
      const message = actionError instanceof Error ? actionError.message : '操作失败'
      setError(message)
      toast.danger(`风格${actionLabel[action]}失败`, { description: message })
    } finally {
      setBusy(null)
    }
  }

  const handleDelete = () => {
    if (!deleteName) {
      setError('请先选择要删除的风格')
      return
    }
    if (pendingDelete !== deleteName) {
      setPendingDelete(deleteName)
      setError('')
      return
    }
    void runAction('delete', deleteName)
  }

  return (
    <>
      <Button size="sm" variant="secondary" onPress={overlay.open}>
        <Settings2 className="size-4" aria-hidden="true" />
        <span>管理风格</span>
      </Button>

      <Modal.Root state={overlay}>
        <Modal.Backdrop>
          <Modal.Container>
            <Modal.Dialog>
              <Modal.Header>
                <Modal.Heading className="text-lg font-semibold">管理风格</Modal.Heading>
                <Description>内置风格不能改名或删除，可用「新建」复制一份再改内容。</Description>
              </Modal.Header>

              <Modal.Body className="flex flex-col gap-6">
                {error ? (
                  <Card className="border border-danger/40 bg-danger-soft">
                    <Card.Content className="px-4 py-3 text-sm text-danger-soft-foreground">{error}</Card.Content>
                  </Card>
                ) : null}

                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Plus className="size-4 text-accent" aria-hidden="true" />
                    <span>新建风格</span>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                    <TextField className="min-w-0 flex-1" value={newName} onChange={setNewName}>
                      <Label className="text-xs text-muted">风格名（1-24 位中英文、数字、下划线或短横线）</Label>
                      <Input placeholder="例如：赛博朋克" />
                    </TextField>
                    <Button
                      isPending={busy === 'create'}
                      variant="primary"
                      onPress={() => void runAction('create', newName)}
                    >
                      {busy === 'create' ? <Spinner color="current" size="sm" aria-label="新建中" /> : <Plus className="size-4" aria-hidden="true" />}
                      <span>新建</span>
                    </Button>
                  </div>
                </div>

                <Separator />

                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Pencil className="size-4 text-accent" aria-hidden="true" />
                    <span>重命名风格</span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <ProfileSelect
                      label="原风格"
                      profiles={profiles}
                      value={renameFrom}
                      onChange={(value) => {
                        setRenameFrom(value)
                        setError('')
                      }}
                    />
                    <TextField className="min-w-0" value={renameTo} onChange={setRenameTo}>
                      <Label className="text-xs text-muted">新风格名</Label>
                      <Input placeholder="新名字" />
                    </TextField>
                  </div>
                  <Button
                    isDisabled={!renameTo.trim()}
                    isPending={busy === 'rename'}
                    variant="secondary"
                    onPress={() => void runAction('rename', renameFrom, renameTo)}
                  >
                    {busy === 'rename' ? <Spinner color="current" size="sm" aria-label="改名中" /> : <Pencil className="size-4" aria-hidden="true" />}
                    <span>改名</span>
                  </Button>
                </div>

                <Separator />

                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Trash2 className="size-4 text-danger" aria-hidden="true" />
                    <span>删除风格</span>
                  </div>
                  <ProfileSelect
                    label="要删除的风格"
                    profiles={profiles}
                    value={deleteName}
                    onChange={(value) => {
                      setDeleteName(value)
                      setPendingDelete('')
                      setError('')
                    }}
                  />
                  <Button
                    isDisabled={!deleteName}
                    isPending={busy === 'delete'}
                    variant="danger-soft"
                    onPress={handleDelete}
                  >
                    {busy === 'delete'
                      ? <Spinner color="current" size="sm" aria-label="删除中" />
                      : <Trash2 className="size-4" aria-hidden="true" />}
                    <span>{pendingDelete === deleteName && deleteName ? '确认删除' : '删除'}</span>
                  </Button>
                  <Description>删除会被后端拒绝的情况：内置风格、默认风格、仍被群引用的风格。</Description>
                </div>
              </Modal.Body>

              <Modal.Footer>
                <Button variant="tertiary" onPress={overlay.close}>关闭</Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal.Root>
    </>
  )
}

export default ProfileManager
