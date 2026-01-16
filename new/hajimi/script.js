const canvas = document.getElementById('fireworks-canvas');
const ctx = canvas.getContext('2d');
const textContainer = document.querySelector('.text-container');
const h1 = document.querySelector('h1');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let fireworks = [];
let particles = [];
let textParticles = [];

const mouse = {
    x: undefined,
    y: undefined,
    down: false
};

// --- EVENT LISTENERS ---
window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});

window.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
});

window.addEventListener('mousedown', () => {
    mouse.down = true;
});

window.addEventListener('mouseup', () => {
    mouse.down = false;
});


// --- UTILITY ---
function randomColor() {
    return `hsl(${Math.random() * 360}, 100%, 50%)`;
}

// --- CLASSES ---
class Firework {
    constructor() {
        this.x = Math.random() * canvas.width;
        this.y = canvas.height;
        this.targetX = Math.random() * canvas.width;
        this.targetY = Math.random() * (canvas.height / 2.5); // Explode higher
        this.speed = 2 + Math.random() * 2;
        this.angle = Math.atan2(this.targetY - this.y, this.targetX - this.x);
        this.color = randomColor();
        this.trail = [];
    }

    update() {
        this.trail.push({ x: this.x, y: this.y, alpha: 1 });
        if (this.trail.length > 10) this.trail.shift();

        const vx = Math.cos(this.angle) * this.speed;
        const vy = Math.sin(this.angle) * this.speed;
        this.x += vx;
        this.y += vy;
        this.speed *= 1.04;

        if (this.y < this.targetY || this.speed > 12) {
            this.explode();
            return true;
        }
        return false;
    }

    draw() {
        ctx.beginPath();
        if(this.trail.length > 0) {
            ctx.moveTo(this.trail[0].x, this.trail[0].y);
            for(let i = 1; i < this.trail.length; i++) {
                ctx.lineTo(this.trail[i].x, this.trail[i].y);
            }
            ctx.strokeStyle = this.color;
            ctx.lineWidth = 3;
            ctx.stroke();
        }
    }

    explode() {
        const particleCount = 100 + Math.floor(Math.random() * 100);
        for (let i = 0; i < particleCount; i++) {
            particles.push(new Particle(this.x, this.y, this.color));
        }
    }
}

class Particle {
    constructor(x, y, color, isMouseParticle = false) {
        this.x = x;
        this.y = y;
        this.color = color || randomColor();
        this.angle = Math.random() * Math.PI * 2;
        this.speed = Math.random() * 8 + 2;
        this.friction = 0.96;
        this.gravity = 1;
        this.alpha = 1;
        this.decay = Math.random() * 0.02 + 0.015;
        this.size = Math.random() * 2 + 1;
        this.trail = [];
        if(isMouseParticle) {
            this.speed = Math.random() * 4 + 1;
            this.decay = Math.random() * 0.04 + 0.04;
        }
    }

    update() {
        this.trail.push({ x: this.x, y: this.y });
        if (this.trail.length > 5) this.trail.shift();

        this.speed *= this.friction;
        this.x += Math.cos(this.angle) * this.speed;
        this.y += Math.sin(this.angle) * this.speed + this.gravity;
        this.alpha -= this.decay;

        return this.alpha <= this.decay;
    }

    draw() {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.beginPath();
        ctx.moveTo(this.trail[0]?.x, this.trail[0]?.y);
        for(let i = 1; i < this.trail.length; i++) {
            ctx.lineTo(this.trail[i].x, this.trail[i].y);
        }
        ctx.strokeStyle = this.color;
        ctx.lineWidth = this.size;
        ctx.stroke();
        ctx.restore();
    }
}

class TextParticle {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.originX = x;
        this.originY = y;
        this.color = randomColor();
        this.size = 2;
        this.vx = (Math.random() - 0.5) * 25; // Explode outwards
        this.vy = (Math.random() - 0.5) * 25;
        this.friction = 0.95 + Math.random() * 0.02;
        this.gravity = 0.5;
        this.alpha = 1;
        this.decay = Math.random() * 0.01 + 0.005;
    }

    update() {
        this.vx *= this.friction;
        this.vy *= this.friction;
        this.vy += this.gravity;
        this.x += this.vx;
        this.y += this.vy;
        this.alpha -= this.decay;

        return this.alpha <= this.decay;
    }

    draw() {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

function explodeText() {
    h1.style.opacity = 0; // Hide the original text
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;

    const h1Styles = window.getComputedStyle(h1);
    tempCtx.fillStyle = '#fff';
    tempCtx.font = `${h1Styles.fontSize} ${h1Styles.fontFamily}`;
    tempCtx.textAlign = 'center';
    tempCtx.textBaseline = 'middle';
    tempCtx.fillText('新年快乐', canvas.width / 2, canvas.height / 2);

    const pixels = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height).data;
    const density = 4; // Use 1 pixel every 4x4 block
    for (let y = 0; y < tempCanvas.height; y += density) {
        for (let x = 0; x < tempCanvas.width; x += density) {
            const index = (y * tempCanvas.width + x) * 4;
            if (pixels[index] > 0) { // If it's not a transparent pixel
                textParticles.push(new TextParticle(x, y));
            }
        }
    }
}

// --- ANIMATION LOOP ---
function animate() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (mouse.x && mouse.y) {
        for(let i=0; i < 2; i++) { // Create a small trail on mouse move
           particles.push(new Particle(mouse.x, mouse.y, null, true));
        }
    }

    for (let i = fireworks.length - 1; i >= 0; i--) {
        if (fireworks[i].update()) {
            fireworks.splice(i, 1);
        } else {
            fireworks[i].draw();
        }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
        if (particles[i].update()) {
            particles.splice(i, 1);
        } else {
            particles[i].draw();
        }
    }

    for (let i = textParticles.length - 1; i >= 0; i--) {
        if (textParticles[i].update()) {
            textParticles.splice(i, 1);
        } else {
            textParticles[i].draw();
        }
    }

    requestAnimationFrame(animate);
}

// --- INITIALIZATION ---
function launchFirework() {
    if (fireworks.length < 10) { // More simultaneous fireworks
        fireworks.push(new Firework());
    }
}

setTimeout(explodeText, 5000); // Explode text after 5 seconds
setInterval(launchFirework, 400); // Launch fireworks more frequently

animate();

