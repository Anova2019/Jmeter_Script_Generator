(function () {
    if (window.jmeterRecorderInjected) return;
    window.jmeterRecorderInjected = true;

    let overlay = null;
    let timerInterval = null;

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        switch (message.action) {
            case 'showFloatingUI':
                createOverlay(message.state);
                break;
            case 'hideFloatingUI':
                removeOverlay();
                break;
            case 'updateStats':
                updateStats(message.count);
                break;
            case 'updateStep':
                updateStepDisplay(message.stepName);
                break;
            case 'updatePauseState':
                updatePauseState(message.isPaused);
                break;
        }
    });

    function createOverlay(state) {
        if (document.getElementById('jmeter-recorder-overlay')) return;

        const div = document.createElement('div');
        div.id = 'jmeter-recorder-overlay';
        div.innerHTML = `
            <div class="jro-header" id="jro-drag-handle">
                <div class="jro-title">
                    <span class="jro-status-dot ${state.isPaused ? 'paused' : ''}" id="jro-dot"></span>
                    JMeter Recorder
                </div>
            </div>
            <div class="jro-content">
                <div class="jro-stats">
                    <div class="jro-stat-item">
                        <span class="jro-stat-label">Requests</span>
                        <span class="jro-stat-value" id="jro-count">${state.requestCount || 0}</span>
                    </div>
                    <div class="jro-stat-item">
                        <span class="jro-stat-label">Time</span>
                        <span class="jro-stat-value" id="jro-timer">00:00</span>
                    </div>
                </div>
                
                <div class="jro-step-section">
                    <div class="jro-current-step">
                        Step: <span class="jro-step-name" id="jro-step">${state.currentStep || 'Init'}</span>
                    </div>
                    <div class="jro-controls">
                        <input type="text" id="jro-step-input" class="jro-input" placeholder="New Step Name...">
                        <button id="jro-add-step" class="jro-btn jro-btn-primary">+</button>
                    </div>
                </div>

                <div class="jro-actions">
                    <button id="jro-pause" class="jro-btn jro-btn-warning">${state.isPaused ? 'Resume' : 'Pause'}</button>
                    <button id="jro-stop" class="jro-btn jro-btn-danger">Stop</button>
                </div>
            </div>
        `;

        document.body.appendChild(div);

        // Initialize Timer
        if (!state.isPaused) {
            startTimer(state.startTime);
        } else {
            document.getElementById('jro-timer').textContent = "PAUSED";
        }

        // Event Listeners
        document.getElementById('jro-add-step').addEventListener('click', addStep);
        document.getElementById('jro-step-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') addStep();
        });

        document.getElementById('jro-stop').addEventListener('click', () => {
            chrome.runtime.sendMessage({ action: 'stopRecording' });
            removeOverlay();
        });

        document.getElementById('jro-pause').addEventListener('click', () => {
            chrome.runtime.sendMessage({ action: 'togglePause' });
        });

        // Drag Logic
        makeDraggable(div);
    }

    function removeOverlay() {
        const el = document.getElementById('jmeter-recorder-overlay');
        if (el) el.remove();
        if (timerInterval) clearInterval(timerInterval);
    }

    function updateStats(count) {
        const el = document.getElementById('jro-count');
        if (el) el.textContent = count;
    }

    function updateStepDisplay(name) {
        const el = document.getElementById('jro-step');
        if (el) el.textContent = name;
    }

    function updatePauseState(isPaused) {
        const dot = document.getElementById('jro-dot');
        const btn = document.getElementById('jro-pause');
        const timerEl = document.getElementById('jro-timer');

        if (isPaused) {
            if (dot) dot.classList.add('paused');
            if (btn) btn.textContent = 'Resume';
            if (timerEl) timerEl.textContent = "PAUSED";
            if (timerInterval) clearInterval(timerInterval);
        } else {
            if (dot) dot.classList.remove('paused');
            if (btn) btn.textContent = 'Pause';
            // Restart timer (simplified)
            chrome.storage.local.get(['startTime'], (res) => {
                if (res.startTime) startTimer(res.startTime);
            });
        }
    }

    function addStep() {
        const input = document.getElementById('jro-step-input');
        const name = input.value.trim();
        if (name) {
            chrome.runtime.sendMessage({ action: 'setStep', stepName: name });
            input.value = '';
        }
    }

    function startTimer(startTime) {
        if (timerInterval) clearInterval(timerInterval);

        const timerEl = document.getElementById('jro-timer');

        const update = () => {
            if (!timerEl) return;
            const diff = Math.floor((Date.now() - startTime) / 1000);
            const minutes = Math.floor(diff / 60).toString().padStart(2, '0');
            const seconds = (diff % 60).toString().padStart(2, '0');
            timerEl.textContent = `${minutes}:${seconds}`;
        };

        update();
        timerInterval = setInterval(update, 1000);
    }

    function makeDraggable(element) {
        const handle = element.querySelector('#jro-drag-handle');
        let isDragging = false;
        let startX, startY, initialLeft, initialTop;

        handle.addEventListener('mousedown', (e) => {
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;

            const rect = element.getBoundingClientRect();
            initialLeft = rect.left;
            initialTop = rect.top;

            // Remove bottom/right positioning to allow left/top positioning
            element.style.bottom = 'auto';
            element.style.right = 'auto';
            element.style.left = `${initialLeft}px`;
            element.style.top = `${initialTop}px`;

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });

        function onMouseMove(e) {
            if (!isDragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            element.style.left = `${initialLeft + dx}px`;
            element.style.top = `${initialTop + dy}px`;
        }

        function onMouseUp() {
            isDragging = false;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        }
    }
})();
