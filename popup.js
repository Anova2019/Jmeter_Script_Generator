document.addEventListener('DOMContentLoaded', () => {
    // UI Elements
    const startBtn = document.getElementById('startBtn');
    const activeControls = document.getElementById('activeControls');
    const pauseBtn = document.getElementById('pauseBtn');
    const stopBtn = document.getElementById('stopBtn');
    const resetBtn = document.getElementById('resetBtn');
    const exportBtn = document.getElementById('exportBtn');
    const settingsBtn = document.getElementById('settingsBtn');
    const advancedOptions = document.getElementById('advancedOptions');

    const testNameInput = document.getElementById('testName');
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    const timer = document.getElementById('timer');

    const requestCount = document.getElementById('requestCount');
    const domainCount = document.getElementById('domainCount');

    const stepNameInput = document.getElementById('stepNameInput');
    const addStepBtn = document.getElementById('addStepBtn');
    const currentStepDisplay = document.getElementById('currentStepDisplay');

    const excludeStatic = document.getElementById('excludeStatic');
    const limitDomain = document.getElementById('limitDomain');
    const includePattern = document.getElementById('includePattern');

    let timerInterval;

    // Initialize UI based on stored state
    chrome.storage.local.get([
        'isRecording', 'isPaused', 'startTime', 'requestCount', 'domainCount',
        'excludeStatic', 'limitDomain', 'includePattern', 'currentStep', 'testName'
    ], (result) => {
        // Restore Settings
        if (result.excludeStatic !== undefined) excludeStatic.checked = result.excludeStatic;
        if (result.limitDomain !== undefined) limitDomain.checked = result.limitDomain;
        if (result.includePattern) includePattern.value = result.includePattern;
        if (result.testName) testNameInput.value = result.testName;

        // Restore State
        if (result.isRecording) {
            setRecordingState(true, result.isPaused);
            if (!result.isPaused) {
                startTimer(result.startTime);
            } else {
                timer.textContent = "PAUSED";
            }
        } else {
            setRecordingState(false);
        }

        if (result.requestCount) {
            requestCount.textContent = result.requestCount;
            if (result.requestCount > 0) exportBtn.disabled = false;
        }
        if (result.domainCount) domainCount.textContent = result.domainCount;
        if (result.currentStep) currentStepDisplay.textContent = result.currentStep;
    });

    // --- Event Listeners ---

    // Settings Toggle
    settingsBtn.addEventListener('click', () => {
        advancedOptions.classList.toggle('hidden');
    });

    // Start
    startBtn.addEventListener('click', () => {
        const testName = testNameInput.value.trim() || "Recorded Test Plan";
        chrome.storage.local.set({ testName: testName });

        chrome.runtime.sendMessage({ action: 'startRecording' }, (response) => {
            if (response && response.success) {
                setRecordingState(true, false);
                startTimer(Date.now());
                currentStepDisplay.textContent = 'Init';
            }
        });
    });

    // Pause/Resume
    pauseBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'togglePause' }, (response) => {
            if (response && response.success) {
                const isPaused = response.isPaused;
                updatePauseUI(isPaused);
            }
        });
    });

    // Stop
    stopBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'stopRecording' }, (response) => {
            if (response && response.success) {
                setRecordingState(false);
                stopTimer();
            }
        });
    });

    // Reset
    resetBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'resetRecording' }, (response) => {
            if (response && response.success) {
                resetUI();
            }
        });
    });

    // Export
    exportBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'getJMX' }, (response) => {
            if (response && response.jmxContent) {
                downloadJMX(response.jmxContent, testNameInput.value.trim());
            }
        });
    });

    // Settings Changes
    excludeStatic.addEventListener('change', (e) => {
        chrome.storage.local.set({ excludeStatic: e.target.checked });
    });
    limitDomain.addEventListener('change', (e) => {
        chrome.storage.local.set({ limitDomain: e.target.checked });
    });
    includePattern.addEventListener('change', (e) => {
        chrome.storage.local.set({ includePattern: e.target.value });
    });
    testNameInput.addEventListener('change', (e) => {
        chrome.storage.local.set({ testName: e.target.value });
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
        if (e.key === 'Enter') addStepBtn.click();
    });

    // Listen for updates from background
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'updateStats') {
            requestCount.textContent = message.count;
            if (message.domainCount) domainCount.textContent = message.domainCount;

            if (message.count > 0 && !startBtn.classList.contains('hidden')) {
                exportBtn.disabled = false;
            }
        } else if (message.action === 'updateStep') {
            currentStepDisplay.textContent = message.stepName;
        }
    });

    // --- Helpers ---

    function setRecordingState(isRecording, isPaused) {
        if (isRecording) {
            startBtn.classList.add('hidden');
            activeControls.classList.remove('hidden');

            testNameInput.disabled = true;
            stepNameInput.disabled = false;
            addStepBtn.disabled = false;
            exportBtn.disabled = true;

            updatePauseUI(isPaused);
        } else {
            startBtn.classList.remove('hidden');
            activeControls.classList.add('hidden');

            testNameInput.disabled = false;
            stepNameInput.disabled = true;
            addStepBtn.disabled = true;

            statusDot.className = 'dot';
            statusText.textContent = 'Ready to record';

            if (parseInt(requestCount.textContent) > 0) {
                exportBtn.disabled = false;
            }
        }
    }

    function updatePauseUI(isPaused) {
        if (isPaused) {
            statusDot.className = 'dot paused';
            statusText.textContent = 'Paused';
            pauseBtn.classList.add('paused');
            pauseBtn.querySelector('span').textContent = 'Resume';
            stopTimer();
            timer.textContent = "PAUSED";
        } else {
            statusDot.className = 'dot recording';
            statusText.textContent = 'Recording...';
            pauseBtn.classList.remove('paused');
            pauseBtn.querySelector('span').textContent = 'Pause';
            // Resume timer logic would need offset calculation, for now just restart from current time diff
            // Simplified for this version:
            chrome.storage.local.get(['startTime'], (res) => {
                if (res.startTime) startTimer(res.startTime);
            });
        }
    }

    function startTimer(startTime) {
        clearInterval(timerInterval);
        const update = () => {
            const diff = Math.floor((Date.now() - startTime) / 1000);
            const minutes = Math.floor(diff / 60).toString().padStart(2, '0');
            const seconds = (diff % 60).toString().padStart(2, '0');
            timer.textContent = `${minutes}:${seconds}`;
        };
        update();
        timerInterval = setInterval(update, 1000);
    }

    function stopTimer() {
        clearInterval(timerInterval);
    }

    function resetUI() {
        stopTimer();
        requestCount.textContent = '0';
        domainCount.textContent = '0';
        timer.textContent = '00:00';
        currentStepDisplay.textContent = 'Init';
        exportBtn.disabled = true;
        setRecordingState(false);
    }

    function downloadJMX(content, testName) {
        const blob = new Blob([content], { type: 'application/xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const safeName = testName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        a.download = `${safeName}_${new Date().toISOString().slice(0, 10)}.jmx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
});
