import { createDomainStore } from "./createStore.ts";
import type { MediaState, MediaSession, PlaybackState } from "@bbq/types";
import { subscribeToMediaChanged, subscribeToMediaPlaybackState } from "../ipc/events.ts";
import { bbqCommands } from "../ipc/commands.ts";

export const mediaStore = createDomainStore<MediaState>({
  currentSession: null,
});

export const useMediaState = mediaStore.useStore;

/**
 * Initializes the media store by querying current session and listening for event updates
 */
export async function initializeMediaStore(): Promise<() => void> {
  try {
    const session = await bbqCommands.mediaGetCurrentSession();
    mediaStore.setState({ currentSession: session });
  } catch (err) {
    console.error("Failed to query initial media session:", err);
  }

  const unlistenChanged = await subscribeToMediaChanged((session: MediaSession | null) => {
    mediaStore.setState({ currentSession: session });
  });

  const unlistenPlayback = await subscribeToMediaPlaybackState((state: PlaybackState) => {
    const current = mediaStore.getState().currentSession;
    if (current) {
      mediaStore.setState({
        currentSession: {
          ...current,
          state,
        },
      });
    }
  });

  return () => {
    unlistenChanged();
    unlistenPlayback();
  };
}
