class SyncClock {
    constructor(selector = '.utc-clock-display', intervalMs = 1000) {
        this.elements = document.querySelectorAll(selector);
        this.intervalMs = intervalMs;
        if (this.elements.length > 0) {
            this.init();
        }
    }

    init() {
        this.updateClock();
        setInterval(() => this.updateClock(), this.intervalMs);
    }

    async updateClock() {
        let timeStr = "";
        try {
            const res = await fetch('/api/v1/time');
            if (!res.ok) throw new Error('Network time unreachable');
            const data = await res.json();
            timeStr = data.timeString;
        } catch (e) {
            // Instant client-side fallback if backend/network is unavailable
            const now = new Date();
            timeStr = now.toUTCString().split(' ')[4] + ' UTC';
        }

        this.elements.forEach(el => {
            el.textContent = timeStr;
        });
    }
}

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.syncClockInstance = new SyncClock('.utc-clock-display');
});