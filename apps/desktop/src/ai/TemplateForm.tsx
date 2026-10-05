import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Icon, IconButton, Input, Textarea, Toggle } from '@slidr/ui';
import {
  FileText,
  Globe,
  Image as ImageIcon,
  ImageUp,
  Paperclip,
  Presentation,
  Sparkles,
  X,
} from '@slidr/ui/icons';
import type { Attachment } from '../agent/agentService';
import { IMAGE_FILES, pickFiles } from '../objects/insert';
import type { Runner } from './Actions';
import { accepted, readAttachment } from './attachments';

/*
 * "Make a template with AI" (THM-06, AID-05): the form that gathers what a template is made
 * from and sends it to the deck chat as one action. The sources are the six of THM-06: a
 * description, a logo, a picture, a web address, the open deck, an HTML file. The form does not
 * read any of them: it hands them over, and the agent reads each with the tools it has.
 */

/** What the examples of a look may be: pictures, and decks or pages written as HTML. */
const EXAMPLES = `${IMAGE_FILES},.html,.htm,text/html`;

/** A logo in the list of files is marked, so the agent knows which picture it is. */
const LOGO = 'logo';

function FileRow({ file, onRemove }: { file: Attachment; onRemove: () => void }) {
  const { t } = useTranslation('ai');
  const picture = file.mime.startsWith('image/');
  return (
    <li
      data-testid="template-file"
      data-use={file.use}
      className="flex h-control-sm items-center gap-1.5 rounded-control border border-ui-line ps-2 pe-1 text-xs text-ui-fg"
    >
      <Icon icon={picture ? ImageIcon : FileText} className="text-ui-fg-muted" />
      <span dir="auto" className="min-w-0 flex-1 truncate text-start">
        {file.name}
      </span>
      {file.use === LOGO && <span className="text-ui-fg-muted">{t('actions.template.logo')}</span>}
      <IconButton
        icon={X}
        size="sm"
        label={t('composer.remove', { name: file.name })}
        noTooltip
        className="size-5"
        onClick={onRemove}
      />
    </li>
  );
}

export function TemplateForm({ runner }: { runner: Runner }) {
  const { t } = useTranslation('ai');
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [url, setUrl] = useState('');
  const [fromDeck, setFromDeck] = useState(false);
  const [files, setFiles] = useState<Attachment[]>([]);
  const off = runner.off('template.create');
  const wanted = description.trim();
  const address = url.trim();
  const ready = Boolean(wanted || address || fromDeck || files.length > 0);

  const add = async (offered: readonly File[], use?: string) => {
    const read = await Promise.all(
      accepted(offered, files.length).map((file) => readAttachment(file, use)),
    );
    // A template has one logo: a new one takes the place of the old.
    setFiles((before) => [...before.filter((file) => !use || file.use !== use), ...read]);
  };
  const create = () => {
    if (!ready || off) return;
    runner.run(
      'template.create',
      {
        ...(wanted ? { description: wanted } : {}),
        ...(address ? { url: address } : {}),
        ...(fromDeck ? { fromDeck: true } : {}),
      },
      files,
    );
    setDescription('');
    setUrl('');
    setFromDeck(false);
    setFiles([]);
    setOpen(false);
  };

  return (
    <section
      aria-label={t('actions.template.title')}
      data-testid="template-form"
      className="flex flex-col gap-0.5"
    >
      <h4 className="px-2 pb-1 text-xs font-medium text-ui-fg-muted">
        {t('actions.template.title')}
      </h4>
      {!open ? (
        <Button
          variant="ghost"
          icon={Sparkles}
          disabled={off}
          aria-expanded={false}
          data-action="template.create"
          className="justify-start"
          onClick={() => setOpen(true)}
        >
          <span className="truncate">{t('actions.template.open')}</span>
        </Button>
      ) : (
        <div className="flex flex-col gap-2 px-2">
          <Textarea
            dir={description ? 'auto' : undefined}
            value={description}
            aria-label={t('actions.template.description')}
            placeholder={t('actions.template.description')}
            data-testid="template-description"
            onChange={(event) => setDescription(event.target.value)}
          />
          <Input
            icon={Globe}
            dir="ltr"
            inputMode="url"
            value={url}
            aria-label={t('actions.template.url')}
            placeholder={t('actions.template.url')}
            data-testid="template-url"
            onChange={(event) => setUrl(event.target.value)}
          />
          <div className="flex flex-wrap items-center gap-1">
            <Button
              size="sm"
              icon={ImageUp}
              data-testid="template-logo"
              onClick={() => void pickFiles(IMAGE_FILES).then((picked) => add(picked, LOGO))}
            >
              {t('actions.template.chooseLogo')}
            </Button>
            <Button
              size="sm"
              icon={Paperclip}
              data-testid="template-files"
              onClick={() => void pickFiles(EXAMPLES, true).then((picked) => add(picked))}
            >
              {t('actions.template.addFile')}
            </Button>
            <Toggle
              icon={Presentation}
              size="sm"
              label={t('actions.template.fromDeck')}
              pressed={fromDeck}
              data-testid="template-from-deck"
              onPressedChange={setFromDeck}
            />
          </div>
          {files.length > 0 && (
            <ul aria-label={t('actions.template.files')} className="flex flex-col gap-1">
              {files.map((file, i) => (
                <FileRow
                  key={i}
                  file={file}
                  onRemove={() => setFiles((before) => before.filter((_, at) => at !== i))}
                />
              ))}
            </ul>
          )}
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              disabled={!ready || off}
              data-testid="template-create"
              onClick={create}
            >
              {t('actions.template.create')}
            </Button>
          </div>
          <p className="text-xs text-ui-fg-muted">
            {ready ? t('actions.template.hint') : t('actions.template.needSource')}
          </p>
        </div>
      )}
    </section>
  );
}
