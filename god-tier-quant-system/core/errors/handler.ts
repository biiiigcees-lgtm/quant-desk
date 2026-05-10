export function safeHandler<T>(
  fn: (event: T) => void,
  _context: string,
): (event: T) => void {
  return (event: T) => {
    try {
      fn(event);
    } catch (_) {
      // Silent — service continues processing subsequent events
    }
  };
}
