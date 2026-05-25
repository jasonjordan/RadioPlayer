class ParticleVisualizer {
    constructor(audioElement) {
        this.audioElement = audioElement;
        this.canvas = document.getElementById('visualizerCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.particles = [];
        this.audioCtx = null;
        this.analyser = null;
        this.source = null;
        this.dataArray = null;
        this.isActive = false;
        
        this.resize();
        window.addEventListener('resize', () => this.resize());
        
        this.mouseX = -1000;
        this.mouseY = -1000;
        window.addEventListener('mousemove', (e) => {
            this.mouseX = e.clientX;
            this.mouseY = e.clientY;
        });
        window.addEventListener('mouseleave', () => {
            this.mouseX = -1000;
            this.mouseY = -1000;
        });
        
        // Initialize particles
        for (let i = 0; i < 150; i++) {
            this.particles.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                size: Math.random() * 2 + 0.5,
                speedX: Math.random() * 1 - 0.5,
                speedY: Math.random() * 1 - 0.5,
                baseAlpha: Math.random() * 0.4 + 0.1
            });
        }
    }
    
    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }
    
    initAudio() {
        if (this.audioCtx) return;
        
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.audioCtx = new AudioContext();
            this.analyser = this.audioCtx.createAnalyser();
            this.analyser.fftSize = 256;
            this.source = this.audioCtx.createMediaElementSource(this.audioElement);
            this.source.connect(this.analyser);
            this.analyser.connect(this.audioCtx.destination);
            
            this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        } catch (e) {
            console.warn("AudioContext not supported or CORS blocked. Falling back to simulated visualization.", e);
            this.analyser = null;
        }
    }
    
    start() {
        if (!this.isActive) {
            this.isActive = true;
            this.initAudio();
            if (this.audioCtx && this.audioCtx.state === 'suspended') {
                this.audioCtx.resume();
            }
            this.animate();
        }
    }
    
    stop() {
        this.isActive = false;
    }
    
    animate() {
        if (!this.isActive) return;
        
        requestAnimationFrame(() => this.animate());
        
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        let avgFreq = 0;
        
        if (this.analyser) {
            this.analyser.getByteFrequencyData(this.dataArray);
            let sum = 0;
            for (let i = 0; i < this.dataArray.length; i++) {
                sum += this.dataArray[i];
            }
            avgFreq = sum / this.dataArray.length;
        } else {
            // Simulated fake frequency for CORS fallback
            const time = Date.now() / 1000;
            avgFreq = 30 + Math.sin(time * 2) * 20 + Math.random() * 10;
        }
        
        const boost = avgFreq / 255; // 0 to 1
        
        for (let i = 0; i < this.particles.length; i++) {
            let p = this.particles[i];
            
            p.x += p.speedX * (1 + boost * 5);
            p.y += p.speedY * (1 + boost * 5);
            
            // Mouse interaction
            const dx = p.x - this.mouseX;
            const dy = p.y - this.mouseY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < 150) {
                const force = (150 - distance) / 150;
                p.x += (dx / distance) * force * 5;
                p.y += (dy / distance) * force * 5;
            }
            
            if (p.x < 0) p.x = this.canvas.width;
            if (p.x > this.canvas.width) p.x = 0;
            if (p.y < 0) p.y = this.canvas.height;
            if (p.y > this.canvas.height) p.y = 0;
            
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size * (1 + boost), 0, Math.PI * 2);
            
            const alpha = p.baseAlpha + (boost * 0.4);
            this.ctx.fillStyle = `rgba(0, 225, 231, ${Math.min(alpha, 1)})`; // #00E1E7
            this.ctx.fill();
        }
    }
}
