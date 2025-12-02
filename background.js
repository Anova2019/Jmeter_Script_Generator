let isRecording = false;
let isPaused = false;
let recordedRequests = [];
let startTime = 0;
let excludeStatic = true;
let limitDomain = false;
let includePattern = "";
let currentStep = 'Init';
let recordingTabId = null;
let rootDomain = null;
let uniqueDomains = new Set();

importScripts('jmx_converter.js');

// Restore state on startup
chrome.storage.local.get([
    'isRecording', 'isPaused', 'startTime', 'requests',
    'excludeStatic', 'limitDomain', 'includePattern',
    'currentStep', 'recordingTabId', 'rootDomain', 'uniqueDomains'
], (result) => {
    if (result.isRecording) {
        isRecording = true;
        startTime = result.startTime;
        recordingTabId = result.recordingTabId;
        rootDomain = result.rootDomain;
    }
    if (result.isPaused !== undefined) isPaused = result.isPaused;
    if (result.requests) recordedRequests = result.requests;
    if (result.excludeStatic !== undefined) excludeStatic = result.excludeStatic;
    if (result.limitDomain !== undefined) limitDomain = result.limitDomain;
    if (result.includePattern !== undefined) includePattern = result.includePattern;
    if (result.currentStep) currentStep = result.currentStep;
    if (result.uniqueDomains) uniqueDomains = new Set(result.uniqueDomains);
});

// Listen for messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.action) {
        case 'startRecording':
            startRecording();
            sendResponse({ success: true });
            break;
        case 'stopRecording':
            stopRecording();
            sendResponse({ success: true });
            break;
        case 'togglePause':
            togglePause();
            sendResponse({ success: true, isPaused: isPaused });
            break;
        case 'resetRecording':
            resetRecording();
            sendResponse({ success: true });
            break;
        case 'setStep':
            setStep(message.stepName);
            sendResponse({ success: true });
            break;
        case 'getJMX':
            try {
                const jmx = generateJMX(recordedRequests);
                sendResponse({ jmxContent: jmx });
            } catch (e) {
                console.error("JMX Generation Error:", e);
                sendResponse({ error: "Failed to generate JMX: " + e.message });
            }
            break;
        case 'getRecordingState':
            sendResponse({
                isRecording,
                isPaused,
                startTime,
                requestCount: recordedRequests.length,
                currentStep
            });
            break;
    }
    return true;
});

// Listen for storage changes
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
        if (changes.excludeStatic) excludeStatic = changes.excludeStatic.newValue;
        if (changes.limitDomain) limitDomain = changes.limitDomain.newValue;
        if (changes.includePattern) includePattern = changes.includePattern.newValue;
    }
});

// Re-inject UI on tab update
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (isRecording && tabId === recordingTabId && changeInfo.status === 'complete') {
        chrome.tabs.sendMessage(tabId, {
            action: 'showFloatingUI',
            state: {
                startTime,
                requestCount: recordedRequests.length,
                currentStep,
                isPaused
            }
        }).catch(() => { });
    }
});

function startRecording() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length === 0) return;

        const tab = tabs[0];
        recordingTabId = tab.id;
        isRecording = true;
        isPaused = false;
        startTime = Date.now();
        currentStep = 'Init';
        uniqueDomains.clear();

        try {
            const url = new URL(tab.url);
            rootDomain = url.hostname;
            uniqueDomains.add(rootDomain);
        } catch (e) {
            rootDomain = null;
        }

        saveState();
        updateBadge();

        // Inject Content Script
        chrome.scripting.executeScript({
            target: { tabId: recordingTabId },
            files: ['content.js']
        }).then(() => {
            chrome.scripting.insertCSS({
                target: { tabId: recordingTabId },
                files: ['content.css']
            });
        }).catch(() => { }).finally(() => {
            chrome.tabs.sendMessage(recordingTabId, {
                action: 'showFloatingUI',
                state: { startTime, requestCount: 0, currentStep, isPaused: false }
            }).catch(() => { });
        });
    });
}

function stopRecording() {
    isRecording = false;
    isPaused = false;
    chrome.storage.local.set({ isRecording: false, isPaused: false });
    updateBadge();

    if (recordingTabId) {
        chrome.tabs.sendMessage(recordingTabId, { action: 'hideFloatingUI' }).catch(() => { });
    }
}

function togglePause() {
    isPaused = !isPaused;
    chrome.storage.local.set({ isPaused: isPaused });
    updateBadge();

    if (recordingTabId) {
        chrome.tabs.sendMessage(recordingTabId, {
            action: 'updatePauseState',
            isPaused: isPaused
        }).catch(() => { });
    }
}

function resetRecording() {
    isRecording = false;
    isPaused = false;
    recordedRequests = [];
    currentStep = 'Init';
    recordingTabId = null;
    rootDomain = null;
    uniqueDomains.clear();

    saveState();
    updateBadge();
}

function setStep(name) {
    currentStep = name;
    chrome.storage.local.set({ currentStep: name });

    if (recordingTabId) {
        chrome.tabs.sendMessage(recordingTabId, {
            action: 'updateStep',
            stepName: name
        }).catch(() => { });
    }

    chrome.runtime.sendMessage({
        action: 'updateStep',
        stepName: name
    }).catch(() => { });
}

function saveState() {
    chrome.storage.local.set({
        isRecording,
        isPaused,
        startTime,
        currentStep,
        recordingTabId,
        rootDomain,
        requests: recordedRequests,
        requestCount: recordedRequests.length,
        uniqueDomains: Array.from(uniqueDomains)
    });
}

function updateBadge() {
    if (isRecording) {
        if (isPaused) {
            chrome.action.setBadgeText({ text: '||' });
            chrome.action.setBadgeBackgroundColor({ color: '#F59E0B' }); // Amber
        } else {
            chrome.action.setBadgeText({ text: 'REC' });
            chrome.action.setBadgeBackgroundColor({ color: '#EF4444' }); // Red
        }
    } else {
        chrome.action.setBadgeText({ text: '' });
    }
}

// Web Request Listener
let pendingRequests = new Map();

chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
        if (!isRecording || isPaused) return;
        if (recordingTabId && details.tabId !== recordingTabId) return;
        if (shouldExclude(details.url)) return;

        pendingRequests.set(details.requestId, {
            url: details.url,
            method: details.method,
            timeStamp: details.timeStamp,
            requestBody: details.requestBody,
            step: currentStep
        });
    },
    { urls: ["<all_urls>"] },
    ["requestBody"]
);

chrome.webRequest.onBeforeSendHeaders.addListener(
    (details) => {
        if (!isRecording || isPaused) return;
        if (recordingTabId && details.tabId !== recordingTabId) return;

        const req = pendingRequests.get(details.requestId);
        if (req) {
            req.requestHeaders = details.requestHeaders;

            // Sanitize request to ensure JSON serializability (handle ArrayBuffers)
            const sanitizedReq = sanitizeRequest(req);
            recordedRequests.push(sanitizedReq);
            pendingRequests.delete(details.requestId);

            // Track Domain
            try {
                const hostname = new URL(req.url).hostname;
                uniqueDomains.add(hostname);
            } catch (e) { }

            // Update stats
            const count = recordedRequests.length;
            const domainCount = uniqueDomains.size;

            const stats = {
                action: 'updateStats',
                count: count,
                domainCount: domainCount
            };

            chrome.runtime.sendMessage(stats).catch(() => { });

            if (recordingTabId) {
                chrome.tabs.sendMessage(recordingTabId, stats).catch(() => { });
            }

            chrome.storage.local.set({
                requestCount: count,
                domainCount: domainCount,
                requests: recordedRequests, // Persist requests
                uniqueDomains: Array.from(uniqueDomains)
            });
        }
    },
    { urls: ["<all_urls>"] },
    ["requestHeaders", "extraHeaders"]
);

function shouldExclude(url) {
    if (!excludeStatic && !limitDomain && !includePattern) return false;

    const urlObj = new URL(url);

    // Static Asset Filter
    if (excludeStatic) {
        const staticExtensions = /\.(css|jpg|jpeg|png|gif|ico|woff|woff2|ttf|eot|svg|js|map|json)$/i;
        if (staticExtensions.test(urlObj.pathname)) return true;
    }

    // Domain Filter
    if (limitDomain && rootDomain) {
        if (!urlObj.hostname.endsWith(rootDomain)) {
            return true;
        }
    }

    // Regex Include Pattern
    if (includePattern) {
        try {
            const regex = new RegExp(includePattern);
            if (!regex.test(url)) return true; // Exclude if doesn't match pattern
        } catch (e) {
            // Invalid regex, ignore
        }
    }

    if (url.startsWith('chrome-extension://')) return true;

    return false;
}

function sanitizeRequest(req) {
    const cleanReq = { ...req };
    if (cleanReq.requestBody && cleanReq.requestBody.raw) {
        cleanReq.requestBody = { ...cleanReq.requestBody };
        cleanReq.requestBody.raw = cleanReq.requestBody.raw.map(part => {
            if (part.bytes) {
                // Convert ArrayBuffer to regular Array for JSON serialization
                // ArrayBuffer is not directly JSON serializable and can cause issues in storage/messaging
                return { ...part, bytes: Array.from(new Uint8Array(part.bytes)) };
            }
            return part;
        });
    }
    return cleanReq;
}
