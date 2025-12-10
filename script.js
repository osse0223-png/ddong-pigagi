const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Game State
let gameState = 'START'; // START, PLAYING, GAMEOVER
let score = 0;
let animationId;
let lastTime = 0;
let difficultyMultiplier = 1.1;
let lives = 3;
// let isPinkMode = false; // Removed in favor of cyclic Hue Rotate
const gameContainer = document.querySelector('.game-container');
let scoreTimer = 0;

// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyAlUqUM1jum8HuhlJj6gF_NiXpEMr4D1Qk",
    authDomain: "ddong-6379a.firebaseapp.com",
    databaseURL: "https://ddong-6379a-default-rtdb.firebaseio.com",
    projectId: "ddong-6379a",
    storageBucket: "ddong-6379a.appspot.com",
    messagingSenderId: "",
    appId: ""
};

// Initialize Firebase (Try/Catch to avoid error before user configures)
try {
    firebase.initializeApp(firebaseConfig);
} catch (e) {
    console.warn("Firebase not configured yet.");
}

// Resize Canvas
function resizeCanvas() {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// UI Elements
const scoreElement = document.getElementById('score');
const finalScoreElement = document.getElementById('final-score');
const startScreen = document.getElementById('start-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');
const boostStatusElement = document.getElementById('boost-status');
const livesDisplayElement = document.getElementById('lives-display');
const heartImage = new Image();
heartImage.src = 'heart.png';

// High Score Elements
const nameInput = document.getElementById('player-name');
const saveScoreBtn = document.getElementById('save-score-btn');
const highScoreList = document.getElementById('high-score-list');
const nameInputContainer = document.getElementById('name-input-container');

function updateLivesUI() {
    livesDisplayElement.innerHTML = '';
    for (let i = 0; i < lives; i++) {
        const heart = document.createElement('img');
        heart.src = 'heart.png'; // User uploaded image
        heart.className = 'life-icon';
        livesDisplayElement.appendChild(heart);
    }
}

// Player
const player = {
    x: 0,
    y: 0,
    width: 40,
    height: 40,
    speed: 300, // pixels per second
    boostSpeed: 600,
    normalSpeed: 300,
    isBoosting: false,
    canBoost: true,
    boostDuration: 1000, // 1 second
    boostCooldown: 10000, // 10 seconds
    color: '#00d4ff',
    isInvulnerable: false,
    isShielded: false,
    shieldDuration: 0,

    hit() {
        if (this.isInvulnerable || this.isShielded) return false;

        this.isInvulnerable = true;

        setTimeout(() => {
            this.isInvulnerable = false;
        }, this.invulnerabilityDuration);

        return true; // Damage taken
    },

    boostTimer: null,

    activateBoost() {
        if (this.canBoost && !this.isBoosting) {
            this.isBoosting = true;
            this.canBoost = false;
            this.speed = this.boostSpeed;
            boostStatusElement.innerText = "BOOST: ACTIVE!";
            boostStatusElement.className = "active";

            // Auto-stop after duration if not released earlier
            this.boostTimer = setTimeout(() => {
                this.deactivateBoost();
            }, this.boostDuration);
        }
    },

    deactivateBoost() {
        if (!this.isBoosting) return; // Already stopped

        // Cancel the auto-stop timer if this was a manual release
        if (this.boostTimer) clearTimeout(this.boostTimer);
        this.boostTimer = null;

        this.isBoosting = false;
        this.speed = this.normalSpeed;
        boostStatusElement.innerText = "BOOST: COOLDOWN";
        boostStatusElement.className = "cooldown";

        // Start Cooldown
        setTimeout(() => {
            this.canBoost = true;
            boostStatusElement.innerText = "BOOST: READY (Shift)";
            boostStatusElement.className = "";
        }, this.boostCooldown);
    },

    update(dt) {
        if (keys.ArrowLeft) this.x -= this.speed * dt;
        if (keys.ArrowRight) this.x += this.speed * dt;
        if (keys.ArrowUp) this.y -= this.speed * dt;
        if (keys.ArrowDown) this.y += this.speed * dt;

        // Clamp position
        if (this.x < 0) this.x = 0;
        if (this.x + this.width > canvas.width) this.x = canvas.width - this.width;
        if (this.y < 0) this.y = 0;
        if (this.y + this.height > canvas.height) this.y = canvas.height - this.height;

        // Shield Timer
        if (this.isShielded) {
            this.shieldDuration -= dt;
            if (this.shieldDuration <= 0) {
                this.isShielded = false;
                this.shieldDuration = 0;
            }
        }
    },

    draw() {
        ctx.save();
        ctx.translate(this.x + this.width / 2, this.y + this.height / 2);

        // Draw Shield
        if (this.isShielded) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(0, 0, this.width, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0, 191, 255, 0.3)'; // Light blue transparent
            ctx.fill();
            ctx.lineWidth = 3;
            ctx.strokeStyle = 'rgba(0, 191, 255, 0.8)';
            ctx.stroke();
            ctx.restore();
        }

        // Rotate -45 degrees to make the airplane point UP (since default emoji ✈️ points NE)
        ctx.rotate(-45 * Math.PI / 180);
        ctx.font = '36px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (this.isInvulnerable) {
            // Flash effect
            if (Math.floor(Date.now() / 100) % 2 === 0) {
                ctx.globalAlpha = 0.5;
            }
        }
        ctx.fillText('✈️', 0, 0); // Draw at origin after translate
        ctx.restore();
        ctx.globalAlpha = 1.0; // Reset alpha
    }
};

// Heart Items
let hearts = [];
let heartTimer = 0;
let heartInterval = 20; // seconds

class HeartItem {
    constructor() {
        this.width = 40;
        this.height = 40;
        this.x = Math.random() * (canvas.width - this.width);
        this.y = -this.height;
        this.speed = 150; // Slowly falling
        this.vy = this.speed;
    }

    update(dt) {
        this.y += this.vy * dt;
    }

    draw() {
        ctx.save();
        // Circular clip for the heart item
        ctx.beginPath();
        ctx.arc(this.x + this.width / 2, this.y + this.height / 2, this.width / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();

        ctx.drawImage(heartImage, this.x, this.y, this.width, this.height);

        // Optional border to make it pop
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ff69b4';
        ctx.stroke();
        ctx.restore();
    }
}

// Item Classes
let items = []; // Holds Bombs and Clocks
let itemTimer = 0;
let itemInterval = 15; // Items appear every ~15 seconds

class GameItem {
    constructor(type) {
        this.type = type; // 'BOMB' or 'CLOCK'
        this.width = 40;
        this.height = 40;
        this.x = Math.random() * (canvas.width - this.width);
        this.y = -this.height;
        this.speed = 150;
        this.vy = this.speed;
    }

    update(dt) {
        this.y += this.vy * dt;
    }

    draw() {
        ctx.save();
        ctx.font = '30px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        let emoji = '';
        if (this.type === 'BOMB') emoji = '💣';
        else if (this.type === 'CLOCK') emoji = '⌛';
        else if (this.type === 'SHIELD') emoji = '🛡️';

        ctx.fillText(emoji, this.x + this.width / 2, this.y + this.height / 2);

        // Glow effect
        if (this.type === 'BOMB') ctx.strokeStyle = 'orange';
        else if (this.type === 'CLOCK') ctx.strokeStyle = 'cyan';
        else if (this.type === 'SHIELD') ctx.strokeStyle = 'dodgerblue';

        ctx.lineWidth = 2;
        // ctx.strokeRect(this.x, this.y, this.width, this.height); // Removed border as requested before

        ctx.restore();
    }
}

// Global Effect Variables
// let timeScale = 1.0; // Removed permanent slow logic
// let slowMotionTimer = 0;

// Warning Indicator for Red Poops
let warnings = [];

class WarningIndicator {
    constructor(x, y, onComplete) {
        this.x = x;
        this.y = y;
        this.duration = 1.0; // 1 second warning
        this.timer = 0;
        this.onComplete = onComplete;
        this.visible = true;
    }

    update(dt) {
        this.timer += dt;
        // Blink effect
        if (Math.floor(this.timer * 10) % 2 === 0) {
            this.visible = true;
        } else {
            this.visible = false;
        }

        if (this.timer >= this.duration) {
            this.onComplete();
            return true; // Remove me
        }
        return false;
    }

    draw() {
        if (!this.visible) return;

        ctx.save();
        ctx.font = '30px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'red';

        // Draw warning sign relative to screen edge if needed, or just at spawn point
        // Since spawn point is off-screen, we need to clamp it to screen edge for visibility
        let drawX = this.x;
        let drawY = this.y;
        const padding = 50;

        if (drawX < 0) drawX = padding;
        if (drawX > canvas.width) drawX = canvas.width - padding;
        if (drawY < 0) drawY = padding;
        if (drawY > canvas.height) drawY = canvas.height - padding;

        ctx.fillText('⚠️', drawX, drawY);
        ctx.restore();
    }
}

// Poops
let poops = [];
let poopTimer = 0;
let poopInterval = 0.45; // Slightly easier start

class Poop {
    constructor(isRed = false, startX, startY) {
        // Variable Size (20px to 60px)
        const size = 20 + Math.random() * 40;
        this.width = size;
        this.height = size;

        // Speed varies more wildly now, multiplied by difficulty
        const baseSpeed = 200 + Math.random() * 200;
        this.speed = baseSpeed * difficultyMultiplier;
        this.color = '#8b4513';

        this.isRed = isRed;
        if (this.isRed) {
            this.speed *= 2.5; // Very fast
        }

        // If coordinates provided (from warning), use them. Else random generation.
        if (startX !== undefined && startY !== undefined) {
            this.x = startX;
            this.y = startY;
        } else {
            // 0: Top, 1: Right, 2: Bottom, 3: Left
            const side = Math.floor(Math.random() * 4);

            if (side === 0) { // Top
                this.x = Math.random() * (canvas.width - this.width);
                this.y = -this.height;
            } else if (side === 1) { // Right
                this.x = canvas.width;
                this.y = Math.random() * (canvas.height - this.height);
            } else if (side === 2) { // Bottom
                this.x = Math.random() * (canvas.width - this.width);
                this.y = canvas.height;
            } else { // Left
                this.x = -this.width;
                this.y = Math.random() * (canvas.height - this.height);
            }
        }

        // Calculate Target Point
        let targetX, targetY;

        if (this.isRed) {
            // Target the player directly!
            targetX = player.x + player.width / 2;
            targetY = player.y + player.height / 2;
        } else {
            // Random point in central area
            targetX = Math.random() * (canvas.width * 0.8) + (canvas.width * 0.1);
            targetY = Math.random() * (canvas.height * 0.8) + (canvas.height * 0.1);
        }

        // Calculate Angle and Velocity
        const angle = Math.atan2(targetY - this.y, targetX - this.x);
        this.vx = Math.cos(angle) * this.speed;
        this.vy = Math.sin(angle) * this.speed;
    }

    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
    }

    draw() {
        ctx.save();
        if (this.isRed) {
            ctx.shadowColor = 'red';
            ctx.shadowBlur = 20;
        }
        ctx.font = `${this.width}px Arial`; // Scale emoji with size
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('💩', this.x + this.width / 2, this.y + this.height / 2);
        ctx.restore();
    }
}

// Input Handling
const keys = {
    ArrowLeft: false,
    ArrowRight: false,
    ArrowUp: false,
    ArrowDown: false
};

window.addEventListener('keydown', e => {
    if (keys.hasOwnProperty(e.code)) keys[e.code] = true;

    // Boost Trigger: Ignore if key is being held down (repeat)
    if (e.key === 'Shift' && !e.repeat) {
        player.activateBoost();
    }
});

window.addEventListener('keyup', e => {
    if (keys.hasOwnProperty(e.code)) keys[e.code] = false;

    // Stop Boost on Release
    if (e.key === 'Shift') {
        player.deactivateBoost();
    }
});

// Collision Detection
function checkCollision(rect1, rect2) {
    // 20% padding on each side (60% effective size)
    const padding1 = rect1.width * 0.2;
    const padding2 = rect2.width * 0.2;

    const r1x = rect1.x + padding1;
    const r1y = rect1.y + padding1;
    const r1w = rect1.width - padding1 * 2;
    const r1h = rect1.height - padding1 * 2;

    const r2x = rect2.x + padding2;
    const r2y = rect2.y + padding2;
    const r2w = rect2.width - padding2 * 2;
    const r2h = rect2.height - padding2 * 2;

    return (
        r1x < r2x + r2w &&
        r1x + r1w > r2x &&
        r1y < r2y + r2h &&
        r1y + r1h > r2y
    );
}

// Game Loop
function update(timestamp) {
    if (!lastTime) lastTime = timestamp; // Safety check
    const dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;

    if (gameState === 'PLAYING') {
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Update & Draw Player
        player.update(dt);
        player.draw();

        // Update & Draw Warnings
        for (let i = warnings.length - 1; i >= 0; i--) {
            const warning = warnings[i];
            const shouldRemove = warning.update(dt);
            warning.draw();
            if (shouldRemove) {
                warnings.splice(i, 1);
            }
        }

        // Spawn Poops
        poopTimer += dt;
        if (poopTimer > poopInterval) {
            poopTimer = 0;

            // Check for Red Poop Chance First (5% chance)
            if (Math.random() < 0.05) {
                // Determine spawn position specifically for warning
                const side = Math.floor(Math.random() * 4);
                let wx, wy;
                const size = 30; // approx size

                if (side === 0) { wx = Math.random() * canvas.width; wy = -size; }
                else if (side === 1) { wx = canvas.width; wy = Math.random() * canvas.height; }
                else if (side === 2) { wx = Math.random() * canvas.width; wy = canvas.height; }
                else { wx = -size; wy = Math.random() * canvas.height; }

                // Capture player position NOW (for targeting)
                const targetX = player.x + player.width / 2;
                const targetY = player.y + player.height / 2;

                // Create Warning Instead
                warnings.push(new WarningIndicator(wx, wy, () => {
                    // Spawn actual red poop at this location when done, targeting the SNAPSHOTTED position
                    poops.push(new Poop(true, wx, wy, targetX, targetY));
                }));
            } else {
                // Regular Poop
                poops.push(new Poop(false));
            }

            // Increase difficulty
            difficultyMultiplier += 0.005;
            // Cap interval at a minimum to prevent unplayable state
            if (poopInterval > 0.1) poopInterval -= 0.002;
        }

        // Spawn Hearts
        heartTimer += dt;
        if (heartTimer > heartInterval) {
            heartTimer = 0;
            hearts.push(new HeartItem());
            heartInterval = 15 + Math.random() * 15;
        }

        // Update & Draw Hearts
        for (let i = hearts.length - 1; i >= 0; i--) {
            const heart = hearts[i];
            heart.update(dt);
            heart.draw();

            if (checkCollision(player, heart)) {
                lives++;
                updateLivesUI();
                hearts.splice(i, 1);
            } else if (heart.y > canvas.height) {
                hearts.splice(i, 1);
            }
        }

        // Spawn Items (Bomb/Clock/Shield)
        itemTimer += dt;
        if (itemTimer > itemInterval) {
            itemTimer = 0;
            // Randomly choose Bomb, Clock, or Shield
            const rand = Math.random();
            let type = 'BOMB';
            if (rand < 0.33) type = 'BOMB';
            else if (rand < 0.66) type = 'CLOCK';
            else type = 'SHIELD';

            items.push(new GameItem(type));
            // Randomize interval (More frequent: 5 to 15 seconds)
            itemInterval = 5 + Math.random() * 10;
        }

        // Update & Draw Items
        for (let i = items.length - 1; i >= 0; i--) {
            const item = items[i];
            item.update(dt);
            item.draw();

            if (checkCollision(player, item)) {
                if (item.type === 'BOMB') {
                    // Bomb Effect: Clear all poops
                    const poopCount = poops.length;
                    score += poopCount * 5; // Bonus score
                    scoreElement.innerText = score;
                    poops = []; // Nuke them
                    // Visual feedback
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                } else if (item.type === 'CLOCK') {
                    // Clock Effect: PERMANENTLY Slow down game by 50%
                    difficultyMultiplier *= 0.5;
                    // Slow down existing poops
                    poops.forEach(p => {
                        p.vx *= 0.5;
                        p.vy *= 0.5;
                        p.speed *= 0.5;
                    });

                    // Visual feedback (Flash cyan)
                    gameContainer.style.border = "5px solid cyan";
                    setTimeout(() => gameContainer.style.border = "none", 500);
                } else if (item.type === 'SHIELD') {
                    // Shield Effect: Invincibility for 3 seconds
                    player.isShielded = true;
                    player.shieldDuration = 3.0;
                }
                items.splice(i, 1);
            } else if (item.y > canvas.height) {
                items.splice(i, 1);
            }
        }

        // Update & Draw Poops
        for (let i = poops.length - 1; i >= 0; i--) {
            const poop = poops[i];
            // No timeScale variable anymore, direct update
            poop.update(dt);
            poop.draw();

            // Collision Check
            if (checkCollision(player, poop)) {
                if (player.hit()) {
                    lives--;
                    updateLivesUI();
                    poops.splice(i, 1);

                    if (lives <= 0) {
                        endGame();
                    }
                }
            }

            // Remove off-screen poops
            if (poop.y > canvas.height + 50 || poop.y < -50 ||
                poop.x > canvas.width + 50 || poop.x < -50) {

                poops.splice(i, 1);
                // 1 point bonus for dodging
                score += 1;
                scoreElement.innerText = score;
            }
        }

        // Time-based Scoring & Background Cycle
        scoreTimer += dt;
        if (scoreTimer > 1.0) { // Every 1 second
            score += 1;
            scoreElement.innerText = score;
            scoreTimer = 0;

            // Cyclic Background Update: Hue rotate every 100 points
            const phase = Math.floor(score / 100);
            const rotation = phase * 60;
            gameContainer.style.filter = `hue-rotate(${rotation}deg)`;
        }

        animationId = requestAnimationFrame(update);
    }
}

function startGame() {
    startBtn.blur(); // Remove focus from button to ensure keyboard works
    gameState = 'PLAYING';
    score = 0;
    poops = [];
    hearts = [];
    warnings = [];
    items = [];
    timeScale = 1.0;
    difficultyMultiplier = 1.1;
    poopInterval = 0.45;
    lives = 3;
    heartTimer = 0;
    heartInterval = 20;

    // Reset Background
    gameContainer.style.filter = 'none';
    scoreTimer = 0;

    updateLivesUI();
    scoreElement.innerText = score;
    boostStatusElement.innerText = "BOOST: READY (Shift)";
    boostStatusElement.className = "";
    player.canBoost = true;
    player.isBoosting = false;
    player.speed = player.normalSpeed;
    startScreen.classList.remove('active');
    gameOverScreen.classList.remove('active');

    // Reset player position
    resizeCanvas(); // Ensure canvas size is correct
    player.x = canvas.width / 2 - player.width / 2;
    player.y = canvas.height / 2 - player.height / 2;

    lastTime = performance.now();
    animationId = requestAnimationFrame(update);
}

function endGame() {
    gameState = 'GAMEOVER';
    cancelAnimationFrame(animationId);
    finalScoreElement.innerText = score;
    gameOverScreen.classList.add('active');

    // Show input logic
    nameInput.value = '';
    nameInputContainer.style.display = 'flex';
    renderLeaderboard();
}

// Firebase & Local Storage Logic
function getHighScores() {
    const scores = localStorage.getItem('poopHighScores');
    return scores ? JSON.parse(scores) : [];
}

function saveHighScore() {
    const name = nameInput.value.trim() || '익명';
    const timestamp = Date.now();

    // Try Firebase First
    try {
        const db = firebase.database();
        db.ref('scores').push({
            name: name,
            score: score,
            timestamp: timestamp
        });
    } catch (e) {
        console.warn("Firebase save failed (using local):", e);
        // Fallback to Local Storage
        const highScores = getHighScores();
        const newScore = { name, score };
        highScores.push(newScore);
        highScores.sort((a, b) => b.score - a.score);
        highScores.splice(10);
        localStorage.setItem('poopHighScores', JSON.stringify(highScores));
        renderLeaderboard(highScores);
    }

    nameInputContainer.style.display = 'none';
}

function renderLeaderboard(localData = null) {
    highScoreList.innerHTML = '';

    if (localData) {
        localData.forEach(scoreData => {
            const li = document.createElement('li');
            li.innerHTML = `<span>${scoreData.name}</span> <span>${scoreData.score}</span>`;
            highScoreList.appendChild(li);
        });
        return;
    }

    // Try Listen to Firebase
    try {
        const db = firebase.database();
        db.ref('scores').orderByChild('score').limitToLast(10).on('value', (snapshot) => {
            const scores = [];
            snapshot.forEach((child) => {
                scores.push(child.val());
            });
            scores.reverse();

            highScoreList.innerHTML = '';
            scores.forEach(scoreData => {
                const li = document.createElement('li');
                li.innerHTML = `<span>${scoreData.name}</span> <span>${scoreData.score}</span>`;
                highScoreList.appendChild(li);
            });
        });
    } catch (e) {
        // Fallback
        const highScores = getHighScores();
        highScores.forEach(scoreData => {
            const li = document.createElement('li');
            li.innerHTML = `<span>${scoreData.name}</span> <span>${scoreData.score}</span>`;
            highScoreList.appendChild(li);
        });
    }
}

saveScoreBtn.addEventListener('click', saveHighScore);
startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', startGame);
