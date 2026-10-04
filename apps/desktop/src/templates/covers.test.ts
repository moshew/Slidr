// @vitest-environment happy-dom
import { builtInSamples, builtInTemplates } from '@slidr/templates/builtin';
import { describe, expect, it } from 'vitest';
import { coverPicture, coverUrl } from './covers';

describe('the covers of the built-in templates', () => {
  it.each(builtInTemplates().map((template) => [template.theme.id, template] as const))(
    '%s shows the photograph its sample opens with, when its opening seats one',
    (id, template) => {
      const seats = template.layouts[0]!.placeholders.some((p) => p.role === 'image');
      const opening = builtInSamples[id]!.he[0]!.content.image;
      const picture = coverPicture(id);
      if (!seats) {
        expect(picture).toBeUndefined();
        return;
      }
      // The file is part of the app: a cover that names a picture the bundle lacks is blank.
      expect(picture && coverUrl(picture)).toBeTruthy();
      expect(opening).toEqual({ assetId: picture!.id });
    },
  );
});
