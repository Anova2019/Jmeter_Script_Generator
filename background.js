importScripts('jmx_converter.js');

let isRecording = false;
let recordedRequests = [];
let startTime = 0;
let excludeStatic = true;
let currentStep = 'Init';

// Restore state on startup
chrome.storage.local.get(['isRecording', 'startTime', 'requests', 'excludeStatic', 'currentStep'], (result) => {
    if (result.isRecording) {
        isRecording = true;
        startTime = result.startTime;
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

// Listen for messages from popup
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
    }
    return true; // Keep channel open for async response
});

// Listen for storage changes (e.g. excludeStatic toggle)
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.excludeStatic) {
        excludeStatic = changes.excludeStatic.newValue;
    }
});

function startRecording() {
    isRecording = true;
    startTime = Date.now();
    currentStep = 'Init';
    chrome.storage.local.set({
        isRecording: true,
        startTime: startTime,
        currentStep: currentStep
    });
    updateBadge();
}

function stopRecording() {
    isRecording = false;
    chrome.storage.local.set({ isRecording: false });
    updateBadge();
}

function resetRecording() {
    isRecording = false;
    recordedRequests = [];
    currentStep = 'Init';
    chrome.storage.local.set({
        isRecording: false,
        requests: [],
        requestCount: 0,
        currentStep: currentStep
    });
    updateBadge();
}

function setStep(name) {
    currentStep = name;
    chrome.storage.local.set({ currentStep: name });
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
const extraInfoSpec = ["requestHeaders", "extraHeaders"]; // 'requestBody' is needed for onBeforeRequest

// We need two listeners:
// 1. onBeforeRequest to get the body and initialize the request object
// 2. onBeforeSendHeaders to get the headers (which happen after onBeforeRequest)

// Actually, we can just capture onBeforeSendHeaders and try to match with onBeforeRequest data, 
// OR just use onBeforeRequest if we don't strictly need headers (but we do for JMX).
// The issue is linking them. RequestId is unique.

let pendingRequests = new Map();

chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
        if (!isRecording) return;
        if (shouldExclude(details.url)) return;

        // Store request body and basic info
        pendingRequests.set(details.requestId, {
            url: details.url,
            method: details.method,
            timeStamp: details.timeStamp,
            requestBody: details.requestBody,
            step: currentStep // Tag with current step
        });
    },
    { urls: ["<all_urls>"] },
    ["requestBody"]
);

chrome.webRequest.onBeforeSendHeaders.addListener(
    (details) => {
        if (!isRecording) return;

        const req = pendingRequests.get(details.requestId);
        if (req) {
            req.requestHeaders = details.requestHeaders;

            // We consider the request "captured" at this point for simplicity, 
            // though we could wait for onCompleted to get response status.
            // For JMX generation, we mainly need the request details.
            recordedRequests.push(req);
            pendingRequests.delete(details.requestId);

            // Update storage/UI periodically or on every request
            // To avoid too many writes, maybe throttle this? 
            // For now, let's just send a message to popup if open
            chrome.runtime.sendMessage({
                action: 'updateStats',
                count: recordedRequests.length
            }).catch(() => { }); // Ignore error if popup is closed

            // Update storage count
            chrome.storage.local.set({
                requestCount: recordedRequests.length,
                // requests: recordedRequests // Optional: save all requests to storage (careful with size)
            });
        }
    },
    { urls: ["<all_urls>"] },
    ["requestHeaders", "extraHeaders"]
);

// Clean up pending requests that never completed (optional)
// ...

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
