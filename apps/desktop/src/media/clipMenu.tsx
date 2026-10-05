import { ContextMenuCheckboxItem } from '@slidr/ui';
import { useTranslation } from 'react-i18next';
import { isTarget, useTarget } from '../objects/target';
import { useSelection, type ContextToolProps } from '../shell';

/**
 * A clip's own items in the Stage's right-click menu (STG-06): loop, and mute for a video. Each
 * writes the field row B's toggle writes, as one undo step under the same name.
 */
export function ClipMenuItems(_: ContextToolProps) {
  const { t } = useTranslation('media');
  const target = useTarget();
  const editingId = useSelection((s) => s.editingElementId);
  const clip = isTarget(target, 'video') || isTarget(target, 'audio') ? target : undefined;
  if (!clip || clip.element.locked || editingId === clip.element.id) return null;
  const { element } = clip;
  return (
    <>
      <ContextMenuCheckboxItem
        checked={element.loop}
        onCheckedChange={(loop) => clip.update({ loop }, { label: t('clip.history.loop') })}
      >
        {t('clip.loop')}
      </ContextMenuCheckboxItem>
      {element.type === 'video' && (
        <ContextMenuCheckboxItem
          checked={element.muted}
          onCheckedChange={(muted) => clip.update({ muted }, { label: t('clip.history.mute') })}
        >
          {t('clip.mute')}
        </ContextMenuCheckboxItem>
      )}
    </>
  );
}
