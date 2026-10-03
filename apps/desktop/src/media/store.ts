import { create } from 'zustand';
import { openPanel } from '../shell';

export const MEDIA_PANEL = 'media';

export const MEDIA_TABS = ['uploads', 'stock', 'icons', 'ai'] as const;

export type MediaTab = (typeof MEDIA_TABS)[number];

/** How the image of one placeholder is coming along. */
export interface PlaceholderJob {
  /** The image job, to cancel it; absent once it is over. */
  jobId?: string;
  state: 'working' | 'failed';
  /** Why it failed: the provider's own words, in English. */
  error?: string;
}

interface MediaState {
  /** The tab the media panel shows. One for the window: it outlives the panel being closed. */
  tab: MediaTab;
  /** The placeholders an image is being made for, or failed for, by element id. */
  jobs: Record<string, PlaceholderJob>;
}

export const useMedia = create<MediaState>(() => ({ tab: 'uploads', jobs: {} }));

export function setMediaTab(tab: MediaTab): void {
  useMedia.setState({ tab });
}

/** Shows the media panel on a tab: from a row A button, or from another panel. */
export function openMedia(tab: MediaTab): void {
  setMediaTab(tab);
  openPanel(MEDIA_PANEL);
}

export function setJob(elementId: string, job: PlaceholderJob | null): void {
  useMedia.setState((state) => {
    const { [elementId]: _gone, ...rest } = state.jobs;
    return { jobs: job ? { ...rest, [elementId]: job } : rest };
  });
}
