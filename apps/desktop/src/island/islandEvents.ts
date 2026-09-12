export type IslandEvent =
  | { type: "USER_HOVER" }
  | { type: "USER_UNHOVER" }
  | { type: "USER_CLICK" }
  | { type: "USER_ESCAPE" }
  | { type: "CLICK_OUTSIDE" }
  | { type: "DRAG_ENTER" }
  | { type: "DRAG_LEAVE" }
  | { type: "DROP"; paths: string[] }
  | { type: "MEDIA_EVENT"; isPlaying: boolean; title?: string | null }
  | { type: "CLIPBOARD_EVENT"; preview: string }
  | { type: "FILE_EVENT"; fileCount: number }
  | { type: "SYSTEM_EVENT" }
  | { type: "WIDGET_SELECT"; widgetId: string }
  | { type: "HOTKEY_TRIGGER" };

export const EventPriority = {
  UserInteraction: 100,
  DragDrop: 90,
  ActiveMedia: 80,
  ClipboardEvent: 70,
  FileEvent: 60,
  System: 50,
  BackgroundWidget: 40,
  Idle: 10,
} as const;

export type EventPriority = (typeof EventPriority)[keyof typeof EventPriority];

export function getEventPriority(event: IslandEvent): EventPriority {
  switch (event.type) {
    case "USER_CLICK":
    case "USER_ESCAPE":
    case "USER_HOVER":
    case "USER_UNHOVER":
    case "CLICK_OUTSIDE":
    case "WIDGET_SELECT":
    case "HOTKEY_TRIGGER":
      return EventPriority.UserInteraction;
    case "DRAG_ENTER":
    case "DRAG_LEAVE":
    case "DROP":
      return EventPriority.DragDrop;
    case "MEDIA_EVENT":
      return EventPriority.ActiveMedia;
    case "CLIPBOARD_EVENT":
      return EventPriority.ClipboardEvent;
    case "FILE_EVENT":
      return EventPriority.FileEvent;
    case "SYSTEM_EVENT":
      return EventPriority.System;
    default:
      return EventPriority.Idle;
  }
}
