/**
 * Represents a Gun object with various properties such as id, name, type, color, power, recoil, cooldown, and ammo.
 * Also supports optional sprite rendering with per-gun offsets.
 * @param def
 * @constructor
 */
function Gun(def) {
    def = def || {};
    this.id = def.id | 0;
    this.name = String(def.name);
    this.type = String(def.type);
    this.color = def.color || '#333333';
    this.power = (def.power | 0) || 0;        // knockback applied to target on hit (horizontal)
    this.recoil = (def.recoil | 0) || 0;      // pure horizontal recoil applied to shooter
    this.cooldownMs = (def.cooldownMs | 0) || 0;
    this.ammo = (def.ammo | 0) || 0;

    // Sprite rendering fields
    this.spriteSrc = null;
    this._spriteImage = null;
    this._spriteReady = false;
    this.offsetX = (def.offset && (def.offset.x || 0)) || 0;
    this.offsetY = (def.offset && (def.offset.y || 0)) || 0;
    // Optional size controls from registry
    this.scale = (typeof def.scale === 'number' && isFinite(def.scale) && def.scale > 0) ? def.scale : 1;
    this.size = (def.size && typeof def.size === 'object') ? {
        w: (def.size.w | 0) || 0,
        h: (def.size.h | 0) || 0
    } : null;

    // If a sprite is provided in the definition, load it
    if (typeof def.sprite === 'string') {
        this.setSprite(def.sprite, this.offsetX, this.offsetY);
    }

    this.cooldownTimerMs = 0;
}

Gun.prototype.setSprite = function(src, ox, oy){
    this.spriteSrc = (typeof src === 'string') ? src : null;
    this.offsetX = (ox | 0) || 0;
    this.offsetY = (oy | 0) || 0;
    this._spriteReady = false;
    this._spriteImage = null;
    if (this.spriteSrc && typeof Image !== 'undefined'){
        const img = new Image();
        const self = this;
        img.onload = function(){ self._spriteReady = true; };
        img.onerror = function(){ self._spriteReady = false; };
        img.src = this.spriteSrc;
        this._spriteImage = img;
    }
};

Gun.prototype.canFire = function () {
    return this.cooldownTimerMs <= 0 && this.ammo > 0;
};

Gun.prototype.onFired = function () {
    if (this.ammo > 0) this.ammo -= 1;
    this.cooldownTimerMs = this.cooldownMs;
};

Gun.prototype.isDepleted = function () {
    return this.ammo <= 0;
};

Gun.prototype.tick = function (dt) {
    if (this.cooldownTimerMs > 0) {
        this.cooldownTimerMs -= dt * 1000;
        if (this.cooldownTimerMs < 0) this.cooldownTimerMs = 0;
    }
};

/**
 * Render the gun. If a sprite is available, draw it with per-gun offsets.
 * Fallback to a simple rectangle if the sprite is not ready.
 * The gun is anchored near the player's facing edge at mid-height, then
 * offset by (offsetX, offsetY). X offset is mirrored when facing left.
 * @param ctx
 * @param player
 */
Gun.prototype.draw = function (ctx, player) {
    if (!ctx || !player) return;

    // Base rectangle dimensions (used for default sizing when no sprite or no explicit size)
    const baseW = Math.max(14, Math.floor(player.w * 0.28));
    const baseH = Math.max(6, Math.floor(player.h * 0.08));
    const inset = Math.max(4, Math.floor(player.w * 0.06));

    // Compute target draw size for sprite (tw, th)
    let tw = baseW;
    let th = baseH;

    // If sprite available, prefer variable width by preserving its aspect ratio by default
    const hasSprite = (this._spriteImage && this._spriteReady && ctx.drawImage);
    if (hasSprite) {
        // Priority: explicit size -> base size scaled -> aspect from image with baseH
        if (this.size && (this.size.w > 0 || this.size.h > 0)) {
            if (this.size.w > 0 && this.size.h > 0) {
                tw = this.size.w | 0;
                th = this.size.h | 0;
            } else if (this.size.w > 0 && this._spriteImage.naturalWidth && this._spriteImage.naturalHeight) {
                tw = this.size.w | 0;
                const ar = this._spriteImage.naturalHeight / this._spriteImage.naturalWidth;
                th = Math.max(1, Math.round(tw * ar));
            } else if (this.size.h > 0 && this._spriteImage.naturalWidth && this._spriteImage.naturalHeight) {
                th = this.size.h | 0;
                const ar = this._spriteImage.naturalWidth / this._spriteImage.naturalHeight;
                tw = Math.max(1, Math.round(th * ar));
            }
        } else if (this.scale && this.scale !== 1) {
            tw = Math.max(1, Math.round(baseW * this.scale));
            th = Math.max(1, Math.round(baseH * this.scale));
        } else if (this._spriteImage.naturalWidth && this._spriteImage.naturalHeight) {
            // Default: keep a consistent height, derive width from sprite aspect ratio
            th = baseH;
            const ar = this._spriteImage.naturalWidth / this._spriteImage.naturalHeight;
            tw = Math.max(6, Math.round(th * ar));
        }
    }

    const baseY = Math.floor(player.y + player.h * 0.5 - th * 0.5);
    let baseX;
    if (player.facing >= 0) {
        baseX = Math.floor(player.x + player.w - inset - tw);
    } else {
        baseX = Math.floor(player.x + inset);
    }

    // If sprite available, draw sprite with flipping & offsets
    if (hasSprite) {
        const ox = (player.facing >= 0) ? this.offsetX : (-this.offsetX); // mirror X offset when facing left
        const oy = this.offsetY;
        const x = baseX + ox;
        const y = baseY + oy;

        // Draw with optional horizontal flip when facing left
        if (player.facing < 0) {
            try {
                ctx.save();
                // Flip around the center of the gun rect to keep alignment
                const cx = Math.floor(x + tw / 2);
                ctx.translate(cx, 0);
                ctx.scale(-1, 1);
                ctx.drawImage(this._spriteImage, -Math.floor(tw / 2), y, tw, th);
                ctx.restore();
            } catch (e) {
                // fallback to rectangle on error
                ctx.fillStyle = this.color || '#333333';
                ctx.fillRect(baseX, baseY, baseW, baseH);
            }
        } else {
            try {
                ctx.drawImage(this._spriteImage, x, y, tw, th);
            } catch (e2) {
                ctx.fillStyle = this.color || '#333333';
                ctx.fillRect(baseX, baseY, baseW, baseH);
            }
        }
        return;
    }

    // Fallback: colored rectangle
    ctx.fillStyle = this.color || '#333333';
    ctx.fillRect(baseX, baseY, baseW, baseH);
};

window.Gun = Gun;
