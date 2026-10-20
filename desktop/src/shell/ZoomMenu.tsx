import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from '@slidr/ui/icons';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@slidr/ui';
import { setZoom, useShell } from './store';
import { watchToolFocus } from './toolFocus';

const zoomSteps = [0.5, 1, 2];

export function ZoomMenu() {
  const { t } = useTranslation();
  const tools = useRef<HTMLDivElement>(null);
  useEffect(() => (tools.current ? watchToolFocus(tools.current) : undefined), []);
  const zoom = useShell((s) => s.zoom);
  const viewScale = useShell((s) => s.viewScale);
  return (
    <div ref={tools} className="flex shrink-0 items-center">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            iconEnd={ChevronDown}
            aria-label={t('tools.zoom')}
            className="tabular-nums"
          >
            <span data-testid="status-zoom">{Math.round(viewScale * 100)}%</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuRadioGroup
            value={String(zoom)}
            onValueChange={(value) => setZoom(value === 'fit' ? 'fit' : Number(value))}
          >
            <DropdownMenuRadioItem value="fit" shortcut="Ctrl+0">
              {t('tools.zoomFit')}
            </DropdownMenuRadioItem>
            {zoomSteps.map((step) => (
              <DropdownMenuRadioItem key={step} value={String(step)}>
                {step * 100}%
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
