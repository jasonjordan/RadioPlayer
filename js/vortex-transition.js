'use strict';

/**
 * VortexTransition — A "drain hole" removal animation for overlay elements.
 *
 * Uses HTML5 Canvas for pixel-level spiral distortion + a particle burst system,
 * orchestrated by a GSAP timeline.
 *
 * Usage:
 *   const vortex = new VortexTransition({ overlay: document.getElementById('dimOverlay') });
 *   vortex.trigger();   // call on play-button click
 */

const VortexTransition = (() => {

    /* ── Animation property definitions ── */
    const DEFAULTS = {
        duration: 2.2,           // total transition seconds
        particleBurstCount: 120, // max particles (throttled by hardware)
        spiralTightness: 6,      // number of full rotations during drain
        drainRadius: 0.0,        // starting drain hole radius (fraction of viewport)
        maxDrainRadius: 1.6,     // ending drain hole radius
        particleLifespan: 1.8,   // seconds
        particleMinSize: 2,
        particleMaxSize: 6,
        fpsThreshold: 45,        // below this, reduce particle count
        colors: ['#00E1E7', '#FF6B00', '#ffffff', '#7B2FBE', '#00FF88']
    };

    /* ── Hardware performance detector ── */
    class PerfMonitor {
        constructor() {
            this._frames = 0;
            this._lastTime = performance.now();
            this._fps = 60;
            this._measuring = false;
        }

        /** Run a quick 200ms measurement to estimate device FPS capability */
        measure() {
            return new Promise(resolve => {
                this._frames = 0;
                this._lastTime = performance.now();
                this._measuring = true;

                const tick = () => {
                    this._frames++;
                    const elapsed = performance.now() - this._lastTime;
                    if (elapsed >= 200) {
                        this._fps = Math.round((this._frames / elapsed) * 1000);
                        this._measuring = false;
                        resolve(this._fps);
                        return;
                    }
                    requestAnimationFrame(tick);
                };
                requestAnimationFrame(tick);
            });
        }

        get fps() { return this._fps; }
    }

    /* ── Particle ── */
    class Particle {
        constructor(x, y, targetX, targetY, color, size, lifespan, delay) {
            this.x = x;
            this.y = y;
            this.originX = x;
            this.originY = y;
            this.targetX = targetX;
            this.targetY = targetY;
            this.color = color;
            this.size = size;
            this.alpha = 1;
            this.lifespan = lifespan;
            this.delay = delay;
            this.elapsed = 0;
            this.alive = true;

            // Spiral parameters — random orbit offset
            this.angle = Math.atan2(y - targetY, x - targetX);
            this.distance = Math.hypot(x - targetX, y - targetY);
            this.spinSpeed = (2 + Math.random() * 4) * (Math.random() > 0.5 ? 1 : -1);
        }

        update(dt) {
            this.elapsed += dt;
            if (this.elapsed < this.delay) return;

            const activeTime = this.elapsed - this.delay;
            const t = Math.min(activeTime / this.lifespan, 1);

            // Ease: cubic in-out
            const eased = t < 0.5
                ? 4 * t * t * t
                : 1 - Math.pow(-2 * t + 2, 3) / 2;

            // Spiral toward center
            const remainDist = this.distance * (1 - eased);
            const currentAngle = this.angle + this.spinSpeed * eased * Math.PI * 2;

            this.x = this.targetX + Math.cos(currentAngle) * remainDist;
            this.y = this.targetY + Math.sin(currentAngle) * remainDist;

            // Fade out in the last 30%
            this.alpha = t > 0.7 ? Math.max(0, 1 - (t - 0.7) / 0.3) : 1;

            // Shrink
            this.size *= (1 - 0.003);

            if (t >= 1) this.alive = false;
        }

        draw(ctx) {
            if (this.elapsed < this.delay || !this.alive) return;
            ctx.save();
            ctx.globalAlpha = this.alpha;
            ctx.fillStyle = this.color;
            ctx.shadowColor = this.color;
            ctx.shadowBlur = this.size * 2;
            ctx.beginPath();
            ctx.arc(this.x, this.y, Math.max(0.5, this.size), 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    /* ── Main VortexTransition class ── */
    class VortexTransition {
        constructor(options = {}) {
            this._overlay = options.overlay || document.getElementById('dimOverlay');
            this._onComplete = options.onComplete || null;
            this._config = { ...DEFAULTS, ...options };

            this._canvas = null;
            this._ctx = null;
            this._particles = [];
            this._progress = { t: 0 };
            this._timeline = null;
            this._animFrameId = null;
            this._perf = new PerfMonitor();
            this._centerX = 0;
            this._centerY = 0;
            this._triggered = false;
        }

        /** Public: fire the vortex drain */
        async trigger() {
            if (this._triggered) return;
            this._triggered = true;

            // Measure hardware capability
            const fps = await this._perf.measure();
            const particleCount = fps < this._config.fpsThreshold
                ? Math.floor(this._config.particleBurstCount * 0.4)
                : this._config.particleBurstCount;

            this._createCanvas();
            this._spawnParticles(particleCount);
            this._buildTimeline();
            this._startRenderLoop();
        }

        /** Create an overlay canvas that sits on top of the dimOverlay */
        _createCanvas() {
            this._canvas = document.createElement('canvas');
            this._canvas.id = 'vortexCanvas';
            this._canvas.style.cssText =
                'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:10000;pointer-events:none;';
            document.body.appendChild(this._canvas);

            this._canvas.width = window.innerWidth * (window.devicePixelRatio || 1);
            this._canvas.height = window.innerHeight * (window.devicePixelRatio || 1);
            this._canvas.style.width = window.innerWidth + 'px';
            this._canvas.style.height = window.innerHeight + 'px';

            this._ctx = this._canvas.getContext('2d');
            this._ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);

            this._centerX = window.innerWidth / 2;
            this._centerY = window.innerHeight / 2;
        }

        /** Spawn particles in a distributed ring around the viewport */
        _spawnParticles(count) {
            const w = window.innerWidth;
            const h = window.innerHeight;
            const cfg = this._config;

            for (let i = 0; i < count; i++) {
                // Distribute spawn points across the viewport edges + random interior
                let x, y;
                const zone = Math.random();
                if (zone < 0.25) {
                    // Top edge
                    x = Math.random() * w;
                    y = Math.random() * 40;
                } else if (zone < 0.5) {
                    // Bottom edge
                    x = Math.random() * w;
                    y = h - Math.random() * 40;
                } else if (zone < 0.7) {
                    // Left edge
                    x = Math.random() * 40;
                    y = Math.random() * h;
                } else if (zone < 0.85) {
                    // Right edge
                    x = w - Math.random() * 40;
                    y = Math.random() * h;
                } else {
                    // Random interior
                    x = Math.random() * w;
                    y = Math.random() * h;
                }

                const color = cfg.colors[Math.floor(Math.random() * cfg.colors.length)];
                const size = cfg.particleMinSize + Math.random() * (cfg.particleMaxSize - cfg.particleMinSize);
                const delay = Math.random() * 0.4; // stagger burst

                this._particles.push(
                    new Particle(x, y, this._centerX, this._centerY, color, size, cfg.particleLifespan, delay)
                );
            }
        }

        /** Build the GSAP timeline that drives the drain + reveal */
        _buildTimeline() {
            const cfg = this._config;

            this._timeline = gsap.timeline({
                onComplete: () => this._finish()
            });

            // Phase 1: Spiral drain the overlay (0 → 0.7)
            this._timeline.to(this._progress, {
                t: 0.7,
                duration: cfg.duration * 0.65,
                ease: 'power2.in'
            });

            // Phase 2: Final collapse + radial reveal (0.7 → 1.0)
            this._timeline.to(this._progress, {
                t: 1.0,
                duration: cfg.duration * 0.35,
                ease: 'power4.in'
            });
        }

        /** The render loop — runs every frame via rAF */
        _startRenderLoop() {
            let lastTime = performance.now();

            const frame = (now) => {
                const dt = (now - lastTime) / 1000;
                lastTime = now;

                this._update(dt);
                this._draw();

                if (this._progress.t < 1 || this._particles.some(p => p.alive)) {
                    this._animFrameId = requestAnimationFrame(frame);
                }
            };

            this._animFrameId = requestAnimationFrame(frame);
        }

        _update(dt) {
            for (let i = this._particles.length - 1; i >= 0; i--) {
                this._particles[i].update(dt);
                if (!this._particles[i].alive) {
                    this._particles.splice(i, 1);
                }
            }
        }

        _draw() {
            const ctx = this._ctx;
            const w = window.innerWidth;
            const h = window.innerHeight;
            const t = this._progress.t;

            ctx.clearRect(0, 0, w, h);

            // ── Draw the draining overlay ──
            // The overlay "drains" by cutting an expanding circular hole from the center,
            // with the edge distorted by a rotating spiral pattern.
            const maxR = Math.hypot(w, h); // diagonal = max radius needed
            const drainR = t * maxR * this._config.maxDrainRadius;

            ctx.save();

            // Draw the dark overlay with a spiral-edged hole
            ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
            ctx.beginPath();
            ctx.rect(0, 0, w, h);

            // Cut a spiral-warped circle from the center
            const segments = 120;
            const spiralRotation = t * this._config.spiralTightness * Math.PI * 2;

            ctx.moveTo(
                this._centerX + drainR * Math.cos(0),
                this._centerY + drainR * Math.sin(0)
            );

            for (let i = 0; i <= segments; i++) {
                const angle = (i / segments) * Math.PI * 2;
                // Add spiral wobble to the edge
                const wobble = 1 + 0.15 * Math.sin(angle * 6 + spiralRotation) * (1 - t);
                const r = drainR * wobble;
                ctx.lineTo(
                    this._centerX + r * Math.cos(angle),
                    this._centerY + r * Math.sin(angle)
                );
            }
            ctx.closePath();
            // Use even-odd rule to cut the hole
            ctx.fill('evenodd');

            // Add a glowing edge to the drain hole
            if (drainR > 5) {
                const edgeGlow = ctx.createRadialGradient(
                    this._centerX, this._centerY, Math.max(0, drainR - 30),
                    this._centerX, this._centerY, drainR + 20
                );
                edgeGlow.addColorStop(0, 'rgba(0, 225, 231, 0)');
                edgeGlow.addColorStop(0.5, `rgba(0, 225, 231, ${0.4 * (1 - t)})`);
                edgeGlow.addColorStop(1, 'rgba(0, 225, 231, 0)');

                ctx.beginPath();
                ctx.arc(this._centerX, this._centerY, drainR + 20, 0, Math.PI * 2);
                ctx.arc(this._centerX, this._centerY, Math.max(0, drainR - 30), 0, Math.PI * 2, true);
                ctx.fillStyle = edgeGlow;
                ctx.fill('evenodd');
            }

            // Draw swirling tendrils being "sucked in"
            if (t < 0.85) {
                const tendrilCount = 8;
                ctx.lineWidth = 2;
                ctx.lineCap = 'round';

                for (let i = 0; i < tendrilCount; i++) {
                    const baseAngle = (i / tendrilCount) * Math.PI * 2 + spiralRotation * 0.3;
                    const startR = drainR + 40 + (1 - t) * 80;
                    const endR = drainR * 0.3;
                    const alpha = (1 - t) * 0.5;

                    ctx.beginPath();
                    ctx.strokeStyle = `rgba(0, 225, 231, ${alpha})`;

                    const steps = 30;
                    for (let s = 0; s <= steps; s++) {
                        const st = s / steps;
                        const easedSt = st * st; // quadratic ease
                        const r = startR + (endR - startR) * easedSt;
                        const a = baseAngle + st * Math.PI * 1.5;
                        const px = this._centerX + r * Math.cos(a);
                        const py = this._centerY + r * Math.sin(a);
                        if (s === 0) ctx.moveTo(px, py);
                        else ctx.lineTo(px, py);
                    }
                    ctx.stroke();
                }
            }

            ctx.restore();

            // ── Draw particles ──
            for (const particle of this._particles) {
                particle.draw(ctx);
            }

            // ── Central vortex glow ──
            if (t > 0.1 && t < 0.95) {
                const glowAlpha = Math.sin(t * Math.PI) * 0.6;
                const glowR = 40 + t * 60;

                const glow = ctx.createRadialGradient(
                    this._centerX, this._centerY, 0,
                    this._centerX, this._centerY, glowR
                );
                glow.addColorStop(0, `rgba(0, 225, 231, ${glowAlpha})`);
                glow.addColorStop(0.4, `rgba(123, 47, 190, ${glowAlpha * 0.4})`);
                glow.addColorStop(1, 'rgba(0, 0, 0, 0)');

                ctx.fillStyle = glow;
                ctx.beginPath();
                ctx.arc(this._centerX, this._centerY, glowR, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        /** Cleanup and trigger radial reveal */
        _finish() {
            // Kill render loop
            if (this._animFrameId) {
                cancelAnimationFrame(this._animFrameId);
            }

            // Remove overlay and canvas
            if (this._overlay) {
                this._overlay.style.display = 'none';
            }

            // Radial gradient reveal on main content
            const main = document.querySelector('main');
            if (main) {
                main.style.clipPath = 'circle(0% at 50% 50%)';
                main.style.transition = 'none';

                // Force reflow
                void main.offsetWidth;

                main.style.transition = 'clip-path 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
                main.style.clipPath = 'circle(150% at 50% 50%)';

                // Clean up clip-path after animation
                setTimeout(() => {
                    main.style.clipPath = '';
                    main.style.transition = '';
                }, 700);
            }

            // Remove canvas with a short fade
            if (this._canvas) {
                this._canvas.style.transition = 'opacity 0.3s';
                this._canvas.style.opacity = '0';
                setTimeout(() => {
                    if (this._canvas && this._canvas.parentNode) {
                        this._canvas.parentNode.removeChild(this._canvas);
                    }
                }, 350);
            }

            // Fire callback
            if (this._onComplete) {
                this._onComplete();
            }
        }

        /** Public: tear down if needed before completion */
        destroy() {
            if (this._timeline) this._timeline.kill();
            if (this._animFrameId) cancelAnimationFrame(this._animFrameId);
            if (this._canvas && this._canvas.parentNode) {
                this._canvas.parentNode.removeChild(this._canvas);
            }
            this._particles = [];
        }
    }

    return VortexTransition;
})();
