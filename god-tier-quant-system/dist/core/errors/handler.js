export function safeHandler(fn, _context) {
    return (event) => {
        try {
            fn(event);
        }
        catch (_) {
            // Silent — service continues processing subsequent events
        }
    };
}
