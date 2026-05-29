class Plasma {
    constructor(cv) {
        this.cv = cv.getContext("2d");
        
        // Use the resolution from the user's snippet for performance. 
        // The CSS will scale this up to fill the viewport, creating a smooth gradient.
        this.screenWidth = 320;
        this.screenHeight = 200;
        
        // Ensure the canvas element has the correct internal dimensions
        cv.width = this.screenWidth;
        cv.height = this.screenHeight;
        
        this.cv1 = document.createElement("canvas"); 
        this.cv1.width = this.screenWidth;
        this.cv1.height = this.screenHeight;
        this.cv1ctx = this.cv1.getContext("2d");
        
        this.pos1 = 0;
        this.pos3 = 0;
        this.tpos1 = 0;
        this.tpos2 = 0;
        this.tpos3 = 0;
        this.tpos4 = 0;
        
        this.sine = new Array(512);
        this.palette = new Array(256);
        this.pixelBuffer = new Array(this.screenHeight * this.screenWidth);
        
        this.createSineTable();
        this.createPalette();
    }

    createSineTable() {
        for (let i = 0; i < this.sine.length; i++) {
            let rad = i * 0.703125 * 0.0174532;
            this.sine[i] = Math.sin(rad) * 1024;
        }
    }
  
    createPalette() {
        for (let i = 0; i < 256; i++) {
            // Full color spectrum (rainbow) for maximum saturation
            let h = (i / 256) * 360;
            let s = 1; // 100% saturation
            let l = 0.5; // 50% lightness for maximum vibrance
            
            let c = (1 - Math.abs(2 * l - 1)) * s;
            let x = c * (1 - Math.abs((h / 60) % 2 - 1));
            let m = l - c/2;
            
            let r = 0, g = 0, b = 0;
            if (0 <= h && h < 60) { r = c; g = x; b = 0; }
            else if (60 <= h && h < 120) { r = x; g = c; b = 0; }
            else if (120 <= h && h < 180) { r = 0; g = c; b = x; }
            else if (180 <= h && h < 240) { r = 0; g = x; b = c; }
            else if (240 <= h && h < 300) { r = x; g = 0; b = c; }
            else if (300 <= h && h < 360) { r = c; g = 0; b = x; }
            
            this.palette[i] = {
                r: Math.round((r + m) * 255),
                g: Math.round((g + m) * 255),
                b: Math.round((b + m) * 255)
            };
        }
    }
  
    computeFrame() {
        this.tpos4 = 0;
        this.tpos3 = this.pos3; 
        
        for (let i = 0; i < this.screenHeight; i++) {
            this.tpos1 = this.pos1 + 2; 
            this.tpos2 = 1.5; 
            this.tpos3 &= 511;
            this.tpos4 &= 511;
            for (let j = 0; j < this.screenWidth; j++) {
                this.tpos1 &= 511;
                this.tpos2 &= 511;
                let x = this.sine[Math.floor(this.tpos1)] + this.sine[Math.floor(this.tpos2)] +
                        this.sine[Math.floor(this.tpos3)] + this.sine[Math.floor(this.tpos4)];
                let index = (128 + (x >> 4)) % 255;
                if (index < 0) {
                    index = 255 + index;
                }
                this.pixelBuffer[i * this.screenWidth + j] = this.palette[index];
                
                // Zoom in by reducing inner loop increments
                this.tpos1 += 2;
                this.tpos2 += 1.5;
            }
            
            this.tpos4 += 1.5;
            this.tpos3 += 0.5;
        }
        
        // Slow down the animation even more
        this.pos1 += 0.5;
        this.pos3 += 0.4; 
    }

    renderFrame() {
        this.cv.clearRect(0, 0, this.screenWidth, this.screenHeight);
        this.cv1ctx.clearRect(0, 0, this.screenWidth, this.screenHeight);
        let imgData = this.cv1ctx.createImageData(this.screenWidth, this.screenHeight);
        
        for (let i = 0; i < this.screenHeight; i++) {
            for (let j = 0; j < this.screenWidth; j++) {
                let idx = i * this.screenWidth + j; 
                let color = this.pixelBuffer[idx];
                let imgIdx = idx * 4;
                imgData.data[imgIdx] = color.r;
                imgData.data[imgIdx + 1] = color.g;
                imgData.data[imgIdx + 2] = color.b;
                imgData.data[imgIdx + 3] = 255;
            }
        }
        this.cv1ctx.putImageData(imgData, 0, 0);
        this.cv.drawImage(this.cv1, 0, 0, this.screenWidth, this.screenHeight);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    const canvas = document.getElementById("plasma");
    if (canvas) {
        const plasma = new Plasma(canvas);
        
        // Request animation frame polyfill just in case
        const requestAnimFrame = (
            window.requestAnimationFrame || 
            window.webkitRequestAnimationFrame || 
            window.mozRequestAnimationFrame || 
            window.oRequestAnimationFrame || 
            window.msRequestAnimationFrame || 
            function(callback) {
                window.setTimeout(callback, 1000 / 60);
            }
        );

        function renderAndDraw() {
            plasma.computeFrame();
            plasma.renderFrame();
            requestAnimFrame(renderAndDraw);
        }
        renderAndDraw();
    }
});
