/**
 *  Canvas renderer with customizable background color and font.
 * @param canvas
 * @param config
 * @constructor
 */
function Renderer(canvas, config) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.config = config || window.GameConfig;

    // Fixed internal resolution for logical rendering
    if (this.config && this.config.canvas) {
        canvas.width = this.config.canvas.width || canvas.width;
        canvas.height = this.config.canvas.height || canvas.height;
    }
}

/**
 *  Fill the canvas with the background color, thus clearing the previous frame
 */
Renderer.prototype.clear = function clear() {
    this.ctx.fillStyle = this.config && this.config.canvas && this.config.canvas.background;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
};

/**
 *  Warps drawRect to use custom options
 */
Renderer.prototype.drawRect = function drawRect(x, y, w, h, color) {
    if (color) this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y, w, h);
};

/**
 *  Warps drawText to use custom options
 */
Renderer.prototype.drawText = function drawText(text, x, y, options) {
    const opts = options || {};
    if (opts.font) this.ctx.font = opts.font; else this.ctx.font = '20px Segoe UI, Arial, sans-serif';
    if (opts.color) this.ctx.fillStyle = opts.color; else this.ctx.fillStyle = '#fff';
    if (opts.textAlign) this.ctx.textAlign = opts.textAlign; else this.ctx.textAlign = 'left';
    if (opts.textBaseline) this.ctx.textBaseline = opts.textBaseline; else this.ctx.textBaseline = 'alphabetic';
    this.ctx.fillText(text, x, y);
};

/**
 *  Scale the canvas element visually to fit the window while preserving the aspect ratio.
 *  This changes only the CSS size (style width/height), not the internal resolution.
 */
Renderer.prototype.attachAutoResize = function attachAutoResize() {
    const canvas = this.canvas;
    const baseW = canvas.width;
    const baseH = canvas.height;

    function resize() {
        const ww = window.innerWidth;
        const wh = window.innerHeight;
        const scale = Math.min(ww / baseW, wh / baseH);
        const cssW = Math.floor(baseW * scale);
        const cssH = Math.floor(baseH * scale);
        canvas.style.width = cssW + 'px';
        canvas.style.height = cssH + 'px';
    }

    window.addEventListener('resize', resize);
    // Initial call
    resize();

    return () => window.removeEventListener('resize', resize);
};

// Expose the class globally
window.Renderer = Renderer;
