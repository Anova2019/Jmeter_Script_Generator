let isRecording = false;
let recordedRequests = [];
let startTime = 0;
let excludeStatic = true;
let limitDomain = false;
let currentStep = 'Init';
let recordingTabId = null;
let rootDomain = null;

importScripts('jmx_converter.js');

// Restore state on startup
chrome.storage.local.get(['isRecording', 'startTime', 'requests', 'excludeStatic', 'limitDomain', 'currentStep', 'recordingTabId', 'rootDomain'], (result) => {
    if (result.isRecording) {
        isRecording = true;
        startTime = result.startTime;
        recordingTabId = result.recordingTabId;
        rootDomain = result.rootDomain;
    }
    if (result.requests) {
        recordedRequests = result.requests;
    }
    if (result.excludeStatic !== undefined) {
        excludeStatic = result.excludeStatic;
    }
    if (result.limitDomain !== undefined) {
        limitDomain = result.limitDomain;
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
    if (namespace === 'local') {
        if (changes.excludeStatic) {
            excludeStatic = changes.excludeStatic.newValue;
        }
        if (changes.limitDomain) {
            limitDomain = changes.limitDomain.newValue;
        }
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

        const tab = tabs[0];
        recordingTabId = tab.id;
        isRecording = true;
        startTime = Date.now();
        currentStep = 'Init';

        // Capture root domain
        try {
            const url = new URL(tab.url);
            rootDomain = url.hostname;
        } catch (e) {
            rootDomain = null;
        }

        chrome.storage.local.set({
            isRecording: true,
            startTime: startTime,
            currentStep: currentStep,
            recordingTabId: recordingTabId,
            rootDomain: rootDomain
        });

        updateBadge();

        // Programmatically inject content script if needed (for existing tabs)
        chrome.scripting.executeScript({
            target: { tabId: recordingTabId },
            files: ['content.js']
        }).then(() => {
            chrome.scripting.insertCSS({
                target: { tabId: recordingTabId },
                files: ['content.css']
            });
        }).catch(() => {
            // Script might already be there or cannot inject (e.g. chrome:// pages)
        }).finally(() => {
            // Show floating UI
            chrome.tabs.sendMessage(recordingTabId, {
                action: 'showFloatingUI',
                state: { startTime, requestCount: 0, currentStep }
            }).catch(() => { });
        });
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
    rootDomain = null;

    chrome.storage.local.set({
        isRecording: false,
        requests: [],
        requestCount: 0,
        currentStep: currentStep,
        recordingTabId: null,
        rootDomain: null
    });
    updateBadge();
}

function setStep(name) {
    currentStep = name;
    chrome.storage.local.set({ currentStep: name });

    // Update Content Script UI
    if (recordingTabId) {
        chrome.tabs.sendMessage(recordingTabId, {
            action: 'updateStep',
            stepName: name
        }).catch(() => { });
    }

    // Update Popup UI (if open)
    chrome.runtime.sendMessage({
        action: 'updateStep',
        stepName: name
    }).catch(() => { });
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
    if (!excludeStatic && !limitDomain) return false; // No filters active

    const urlObj = new URL(url);

    // Static Asset Filter
    if (excludeStatic) {
        const staticExtensions = /\.(css|jpg|jpeg|png|gif|ico|woff|woff2|ttf|eot|svg|js|map)$/i;
        if (staticExtensions.test(urlObj.pathname)) return true;
    }

    // Domain Filter
    if (limitDomain && rootDomain) {
        // Check if hostname ends with rootDomain (handles subdomains)
        // e.g. root=example.com, host=api.example.com -> MATCH
        // e.g. root=example.com, host=google.com -> NO MATCH
        if (!urlObj.hostname.endsWith(rootDomain)) {
            return true;
        }
    }

    // Exclude chrome extension internal calls
    if (url.startsWith('chrome-extension://')) return true;

    return false;
}
