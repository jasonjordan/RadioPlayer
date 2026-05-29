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
        for (let i = 0; i < 64; i++) {
            let r = i << 2; 
            let g = 255 - ((i << 2) + 1);
            this.palette[i] = {r: r, g: g, b: 0}; 
            g = (i << 2) + 1;
            this.palette[i + 64] = {r: 255, g: g, b: 0};
            r = 255 - ((i << 2) + 1);
            g = r;
            this.palette[i + 128] = {r: r, g: g, b: 0};
            g = (i << 2) + 1;
            this.palette[i + 192] = {r: 0, g: g, b: 0};
        }
    }
  
    computeFrame() {
        this.tpos4 = 0;
        this.tpos3 = this.pos3; 
        
        for (let i = 0; i < this.screenHeight; i++) {
            this.tpos1 = this.pos1 + 5; 
            this.tpos2 = 3; 
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
                
                // Keep the structural shape the same
                this.tpos1 += 5;
                this.tpos2 += 3;
            }
            
            this.tpos4 += 3;
            this.tpos3 += 1;
        }
        
        // Slow down the animation for a smoother background effect
        this.pos1 += 1.5;
        this.pos3 += 1.2; 
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
