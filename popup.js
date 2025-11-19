document.addEventListener('DOMContentLoaded', () => {
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const resetBtn = document.getElementById('resetBtn');
    const exportBtn = document.getElementById('exportBtn');
    const requestCount = document.getElementById('requestCount');
    const timer = document.getElementById('timer');
    const statusBadge = document.getElementById('statusBadge');
    const statusText = document.getElementById('statusText');
    const excludeStatic = document.getElementById('excludeStatic');

    // Step controls
    const stepNameInput = document.getElementById('stepNameInput');
    const addStepBtn = document.getElementById('addStepBtn');
    const currentStepDisplay = document.getElementById('currentStepDisplay');

    let timerInterval;

    // Initialize UI based on stored state
    chrome.storage.local.get(['isRecording', 'startTime', 'requestCount', 'excludeStatic', 'currentStep'], (result) => {
        if (result.isRecording) {
            setRecordingState(true);
            startTimer(result.startTime);
        } else {
            setRecordingState(false);
        }

        if (result.requestCount) {
            requestCount.textContent = result.requestCount;
            if (result.requestCount > 0) {
                exportBtn.disabled = false;
            }
        }

        if (result.excludeStatic !== undefined) {
            excludeStatic.checked = result.excludeStatic;
        }

        if (result.currentStep) {
            currentStepDisplay.textContent = result.currentStep;
        }
    });

    // Event Listeners
    startBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'startRecording' }, (response) => {
            if (response && response.success) {
                setRecordingState(true);
                startTimer(Date.now());
                currentStepDisplay.textContent = 'Init';
            }
        });
    });

    stopBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'stopRecording' }, (response) => {
            if (response && response.success) {
                setRecordingState(false);
                stopTimer();
            }
        });
    });

    resetBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'resetRecording' }, (response) => {
            if (response && response.success) {
                resetUI();
            }
        });
    });

    exportBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'getJMX' }, (response) => {
            if (response && response.jmxContent) {
                downloadJMX(response.jmxContent);
            }
        });
    });

    excludeStatic.addEventListener('change', (e) => {
        chrome.storage.local.set({ excludeStatic: e.target.checked });
    });

    // Step Management
    addStepBtn.addEventListener('click', () => {
        const stepName = stepNameInput.value.trim();
        if (stepName) {
            chrome.runtime.sendMessage({ action: 'setStep', stepName: stepName }, (response) => {
                if (response && response.success) {
                    currentStepDisplay.textContent = stepName;
                    stepNameInput.value = '';
                }
            });
        }
    });

    stepNameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addStepBtn.click();
        }
    });

    // Listen for updates from background
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'updateStats') {
            requestCount.textContent = message.count;
            if (message.count > 0 && !startBtn.disabled) { // If stopped and has requests
                exportBtn.disabled = false;
            }
        }
    });

    function setRecordingState(isRecording) {
        if (isRecording) {
            startBtn.disabled = true;
            stopBtn.disabled = false;
            exportBtn.disabled = true;

            // Enable step controls
            stepNameInput.disabled = false;
            addStepBtn.disabled = false;

            statusBadge.classList.add('recording');
            statusText.textContent = 'Recording...';
        } else {
            startBtn.disabled = false;
            stopBtn.disabled = true;

            // Disable step controls
            stepNameInput.disabled = true;
            addStepBtn.disabled = true;

            statusBadge.classList.remove('recording');
            statusText.textContent = 'Idle';

            // Enable export if we have requests
            if (parseInt(requestCount.textContent) > 0) {
                exportBtn.disabled = false;
            }
        }
    }

    function startTimer(startTime) {
        clearInterval(timerInterval);
        timerInterval = setInterval(() => {
            const diff = Math.floor((Date.now() - startTime) / 1000);
            const minutes = Math.floor(diff / 60).toString().padStart(2, '0');
            const seconds = (diff % 60).toString().padStart(2, '0');
            timer.textContent = `${minutes}:${seconds}`;
        }, 1000);
    }

    function stopTimer() {
        clearInterval(timerInterval);
    }

    function resetUI() {
        stopTimer();
        requestCount.textContent = '0';
        timer.textContent = '00:00';
        currentStepDisplay.textContent = 'Init';
        exportBtn.disabled = true;
        setRecordingState(false);
    }

    function downloadJMX(content) {
        const blob = new Blob([content], { type: 'application/xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `recording_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.jmx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
});
