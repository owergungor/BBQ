import { createDomainStore } from "./createStore.ts";
import type {
  LauncherItem,
  LauncherCapabilities,
} from "@bbq/types";
import { bbqCommands } from "../ipc/commands.ts";
import { subscribeToLauncherChanged } from "../ipc/events.ts";

export interface LauncherDomainState {
  items: LauncherItem[];
  favorites: LauncherItem[];
  recent: LauncherItem[];
  capabilities: LauncherCapabilities | null;
  searchQuery: string;
  selectedIndex: number;
  isLoading: boolean;
  error: string | null;
}

export const initialLauncherDomainState: LauncherDomainState = {
  items: [],
  favorites: [],
  recent: [],
  capabilities: null,
  searchQuery: "",
  selectedIndex: 0,
  isLoading: false,
  error: null,
};

export const launcherStore = createDomainStore<LauncherDomainState>(
  initialLauncherDomainState
);

export const useLauncherState = launcherStore.useStore;

export function setLauncherItems(items: LauncherItem[]): void {
  launcherStore.setState({ items, isLoading: false, error: null });
}

export function setLauncherFavorites(favorites: LauncherItem[]): void {
  launcherStore.setState({ favorites });
}

export function setLauncherRecent(recent: LauncherItem[]): void {
  launcherStore.setState({ recent });
}

export function setLauncherCapabilities(
  capabilities: LauncherCapabilities | null
): void {
  launcherStore.setState({ capabilities });
}

export function setSearchQuery(searchQuery: string): void {
  launcherStore.setState({ searchQuery, selectedIndex: 0 });
}

export function setSelectedIndex(selectedIndex: number): void {
  launcherStore.setState({ selectedIndex });
}

export function setLauncherLoading(isLoading: boolean): void {
  launcherStore.setState({ isLoading });
}

export function setLauncherError(error: string | null): void {
  launcherStore.setState({ error, isLoading: false });
}

export async function refreshLauncher(): Promise<void> {
  setLauncherLoading(true);
  try {
    const [caps, items, favorites, recent] = await Promise.all([
      bbqCommands.launcherGetCapabilities(),
      bbqCommands.launcherList(),
      bbqCommands.launcherListFavorites(),
      bbqCommands.launcherListRecent(),
    ]);
    launcherStore.setState({
      capabilities: caps,
      items,
      favorites,
      recent,
      isLoading: false,
      error: null,
    });
  } catch (err) {
    setLauncherError(err instanceof Error ? err.message : String(err));
  }
}

export async function launchItem(item: LauncherItem): Promise<boolean> {
  try {
    await bbqCommands.launcherLaunch(item.id);
    // Refresh to get updated recent actions
    await refreshLauncher();
    return true;
  } catch (err) {
    setLauncherError(err instanceof Error ? err.message : String(err));
    return false;
  }
}

export async function launchAction(item: LauncherItem): Promise<boolean> {
  return launchItem(item);
}

export async function toggleFavorite(item: LauncherItem): Promise<void> {
  try {
    if (item.favorite) {
      await bbqCommands.launcherRemoveFavorite(item.id);
    } else {
      await bbqCommands.launcherAddFavorite(item.id);
    }
    await refreshLauncher();
  } catch (err) {
    setLauncherError(err instanceof Error ? err.message : String(err));
  }
}

export async function clearRecent(): Promise<void> {
  try {
    await bbqCommands.launcherClearRecent();
    await refreshLauncher();
  } catch (err) {
    setLauncherError(err instanceof Error ? err.message : String(err));
  }
}

// Auto-subscribe to backend events in browser/Tauri environment
if (typeof window !== "undefined") {
  subscribeToLauncherChanged(() => {
    refreshLauncher().catch((err) => {
      console.error("Failed to refresh launcher on event:", err);
    });
  }).catch((err) => {
    console.error("Failed to subscribe to launcher changes:", err);
  });
}
