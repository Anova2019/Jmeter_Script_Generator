let isRecording = false;
let recordedRequests = [];
let startTime = 0;
let excludeStatic = true;
let currentStep = 'Init';
let recordingTabId = null;

importScripts('jmx_converter.js');

// Restore state on startup
chrome.storage.local.get(['isRecording', 'startTime', 'requests', 'excludeStatic', 'currentStep', 'recordingTabId'], (result) => {
    if (result.isRecording) {
        isRecording = true;
        startTime = result.startTime;
        recordingTabId = result.recordingTabId;
    }
    if (result.requests) {
        recordedRequests = result.requests;
    }
    if (result.excludeStatic !== undefined) {
        excludeStatic = result.excludeStatic;
    }
    if (result.currentStep) {
        currentStep = result.currentStep;
    }
});

// Listen for messages from popup or content script
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
        case 'resetRecording':
            resetRecording();
            sendResponse({ success: true });
            break;
        case 'setStep':
            setStep(message.stepName);
            sendResponse({ success: true });
            break;
        case 'getJMX':
            const jmx = generateJMX(recordedRequests);
            sendResponse({ jmxContent: jmx });
            break;
        case 'getRecordingState':
            sendResponse({
                isRecording,
                startTime,
                requestCount: recordedRequests.length,
                currentStep
            });
            break;
    }
    return true; // Keep channel open for async response
});

// Listen for storage changes
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.excludeStatic) {
        excludeStatic = changes.excludeStatic.newValue;
    }
});

// Re-inject UI on tab update (navigation)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (isRecording && tabId === recordingTabId && changeInfo.status === 'complete') {
        chrome.tabs.sendMessage(tabId, {
            action: 'showFloatingUI',
            state: {
                startTime,
                requestCount: recordedRequests.length,
                currentStep
            }
        }).catch(() => { }); // Ignore if content script not ready
    }
});

function startRecording() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length === 0) return;

        recordingTabId = tabs[0].id;
        isRecording = true;
        startTime = Date.now();
        currentStep = 'Init';

        chrome.storage.local.set({
            isRecording: true,
            startTime: startTime,
            currentStep: currentStep,
            recordingTabId: recordingTabId
        });

        updateBadge();

        // Show floating UI
        chrome.tabs.sendMessage(recordingTabId, {
            action: 'showFloatingUI',
            state: { startTime, requestCount: 0, currentStep }
        }).catch(() => { });
    });
}

function stopRecording() {
    isRecording = false;
    chrome.storage.local.set({ isRecording: false });
    updateBadge();

    // Hide floating UI
    if (recordingTabId) {
        chrome.tabs.sendMessage(recordingTabId, { action: 'hideFloatingUI' }).catch(() => { });
    }
}

function resetRecording() {
    isRecording = false;
    recordedRequests = [];
    currentStep = 'Init';
    recordingTabId = null;

    chrome.storage.local.set({
        isRecording: false,
        requests: [],
        requestCount: 0,
        currentStep: currentStep,
        recordingTabId: null
    });
    updateBadge();
}

function setStep(name) {
    currentStep = name;
    chrome.storage.local.set({ currentStep: name });

    // Update UI
    if (recordingTabId) {
        chrome.tabs.sendMessage(recordingTabId, {
            action: 'updateStep',
            stepName: name
        }).catch(() => { });
    }
}

function updateBadge() {
    if (isRecording) {
        chrome.action.setBadgeText({ text: 'REC' });
        chrome.action.setBadgeBackgroundColor({ color: '#EF4444' });
    } else {
        chrome.action.setBadgeText({ text: '' });
    }
}

// Web Request Listener
const filter = { urls: ["<all_urls>"] };
const extraInfoSpec = ["requestHeaders", "extraHeaders"];

let pendingRequests = new Map();

chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
        if (!isRecording) return;
        if (recordingTabId && details.tabId !== recordingTabId) return; // Filter by Tab ID
        if (shouldExclude(details.url)) return;

        // Store request body and basic info
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
        if (!isRecording) return;
        if (recordingTabId && details.tabId !== recordingTabId) return; // Filter by Tab ID

        const req = pendingRequests.get(details.requestId);
        if (req) {
            req.requestHeaders = details.requestHeaders;
            recordedRequests.push(req);
            pendingRequests.delete(details.requestId);

            // Update stats
            const count = recordedRequests.length;
            chrome.runtime.sendMessage({ action: 'updateStats', count: count }).catch(() => { });

            if (recordingTabId) {
                chrome.tabs.sendMessage(recordingTabId, {
                    action: 'updateStats',
                    count: count
                }).catch(() => { });
            }

            chrome.storage.local.set({ requestCount: count });
        }
    },
    { urls: ["<all_urls>"] },
    ["requestHeaders", "extraHeaders"]
);

function shouldExclude(url) {
    if (!excludeStatic) return false;

    // Simple regex for static assets
    const staticExtensions = /\.(css|jpg|jpeg|png|gif|ico|woff|woff2|ttf|eot|svg|js|map)$/i;
    const urlObj = new URL(url);
    if (staticExtensions.test(urlObj.pathname)) return true;

    // Exclude chrome extension internal calls
    if (url.startsWith('chrome-extension://')) return true;

    return false;
}
