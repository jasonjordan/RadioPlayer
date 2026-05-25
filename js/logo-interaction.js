document.addEventListener('DOMContentLoaded', () => {
    const logoWrapper = document.getElementById('footerLogoWrapper');
    const logo = document.getElementById('footerLogo');
    
    if (!logoWrapper || !logo) return;

    logoWrapper.addEventListener('mouseenter', (e) => {
        if (logo.dataset.hidden === 'true') return;

        let dirX = e.movementX;
        let dirY = e.movementY;

        // If movement is 0 (e.g., entered by scrolling), calculate based on center
        if (Math.abs(dirX) < 1 && Math.abs(dirY) < 1) {
            const rect = logoWrapper.getBoundingClientRect();
            dirX = (rect.left + rect.width/2 < e.clientX) ? -1 : 1;
            dirY = (rect.top + rect.height/2 < e.clientY) ? -1 : 1;
        }

        // Normalize direction and multiply by a large distance (2000px) to shoot off screen
        const dist = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
        const moveX = (dirX / dist) * 2000;
        const moveY = (dirY / dist) * 2000;

        // Ease-in: start slow, then accelerate
        logo.style.transition = 'transform 1s cubic-bezier(0.55, 0.085, 0.68, 0.53)';
        logo.style.transform = `translate(${moveX}px, ${moveY}px)`;
        logo.dataset.hidden = 'true';
    });

    document.addEventListener('mousemove', (e) => {
        if (logo.dataset.hidden === 'true') {
            const rect = logoWrapper.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            
            const dist = Math.sqrt(Math.pow(e.clientX - cx, 2) + Math.pow(e.clientY - cy, 2));
            
            // If the mouse is far enough away from the original position, sneak back
            if (dist > 300) {
                // Ease-out: start fast, then slow down (sneak back in)
                logo.style.transition = 'transform 4s cubic-bezier(0.1, 0.8, 0.2, 1)';
                logo.style.transform = `translate(0px, 0px)`;
                logo.dataset.hidden = 'false';
            }
        }
    });
});
