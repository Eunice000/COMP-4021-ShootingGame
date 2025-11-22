/**
 *  Get the current time in milliseconds.
 * @returns {DOMHighResTimeStamp|number}
 */
const getNow = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

/**
 *  Simple timer utilities for the game loop.
 * @type {{now: function(): number, startRAF(*): function(): void}}
 */
let Timer = {
    now: getNow,
    // Runs a requestAnimationFrame (RAF) loop and calls the provided callback with delta time in seconds
    startRAF(loop) {
        let running = true;
        let last = getNow();

        function frame(t) {
            if (!running) return;
            const dtMs = t - last;
            last = t;
            // Convert to seconds and clamp to avoid giant catch-up steps
            const dt = Math.min(0.1, Math.max(0, dtMs / 1000));
            loop(dt);
            requestAnimationFrame(frame);
        }

        requestAnimationFrame(frame);
        return () => {
            running = false;
        };
    }
};

window.Timer = Timer;
