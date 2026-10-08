/**
 * escapeManager.ts
 * Centralized, prioritized Escape key coordination for BBQ.
 *
 * Enforces deterministic Escape handling order:
 * Higher-priority child interactions (Modals, Context Menus, Dropdowns, Drop Shelf, Active Inputs)
 * consume Escape first and prevent parent surfaces (Island Shell) from collapsing prematurely.
 */

export const EscapePriority = {
  MODAL: 100,
  CONTEXT_MENU: 80,
  DROPDOWN: 60,
  CHILD_INTERACTION: 40,
  INPUT: 20,
  ISLAND_FALLBACK: 0,
} as const;

export type EscapePriority = (typeof EscapePriority)[keyof typeof EscapePriority];

export type EscapeHandler = () => boolean;

interface RegisteredEntry {
  id: number;
  priority: number;
  handler: EscapeHandler;
}

export class EscapeManager {
  private entries: RegisteredEntry[] = [];
  private nextId = 1;
  private isListening = false;
  private keydownListener: ((e: KeyboardEvent) => void) | null = null;

  constructor() {
    this.handleKeyDown = this.handleKeyDown.bind(this);
  }

  /**
   * Registers an Escape handler with a given priority.
   * Higher priority values execute before lower priority values.
   * If a handler returns `true`, Escape is marked as consumed and no lower-priority
   * handlers are invoked.
   * Returns an idempotent unregister function.
   */
  public register(
    handler: EscapeHandler,
    priority: number = EscapePriority.CHILD_INTERACTION
  ): () => void {
    const entry: RegisteredEntry = {
      id: this.nextId++,
      priority,
      handler,
    };

    this.entries.push(entry);
    // Sort descending by priority, preserving registration order for equal priorities
    this.entries.sort((a, b) => b.priority - a.priority);

    this.ensureListener();

    let unregistered = false;
    return () => {
      if (unregistered) return;
      unregistered = true;
      this.entries = this.entries.filter((e) => e.id !== entry.id);
      if (this.entries.length === 0) {
        this.teardownListener();
      }
    };
  }

  /**
   * Programmatic dispatch of an Escape event.
   * Iterates registered handlers from highest priority to lowest.
   * Stops at the first handler that returns `true`.
   * Returns `true` if consumed by any handler, `false` otherwise.
   */
  public dispatchEscape(event?: KeyboardEvent): boolean {
    // Clone list to guard against modifications during handler execution
    const snapshot = [...this.entries];

    for (const entry of snapshot) {
      try {
        const consumed = entry.handler();
        if (consumed) {
          if (event) {
            event.preventDefault();
            event.stopPropagation();
          }
          return true;
        }
      } catch (err) {
        console.error("Error in EscapeHandler:", err);
      }
    }

    return false;
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      if (e.defaultPrevented) {
        // Handled and consumed at DOM element level (e.g. text input)
        return;
      }
      this.dispatchEscape(e);
    }
  }

  private ensureListener(): void {
    if (this.isListening || typeof window === "undefined") return;
    this.keydownListener = this.handleKeyDown;
    window.addEventListener("keydown", this.keydownListener, false);
    this.isListening = true;
  }

  private teardownListener(): void {
    if (!this.isListening || typeof window === "undefined") return;
    if (this.keydownListener) {
      window.removeEventListener("keydown", this.keydownListener, false);
      this.keydownListener = null;
    }
    this.isListening = false;
  }

  /**
   * Clears all registered handlers and removes window listener (used in tests/cleanups).
   */
  public reset(): void {
    this.entries = [];
    this.teardownListener();
  }

  /**
   * Returns currently registered handler count.
   */
  public getCount(): number {
    return this.entries.length;
  }
}

export const escapeManager = new EscapeManager();
