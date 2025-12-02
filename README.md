# Neo JMeter Script Recorder Chrome Extension

This Chrome extension allows you to record your browser interactions and export them as a JMeter (.jmx) test plan.

## Features
- **Record HTTP/HTTPS Requests**: Captures URL, method, headers, and body data.
- **Tab Isolation**: Only captures requests from the tab where recording started.
- **Domain Filtering**: Option to "Limit to Current Domain" to exclude third-party requests (e.g., analytics, ads).
- **Transaction Steps**: Organize your recording into named steps (e.g., "Login", "Search").
- **Floating UI**: A draggable overlay on the page to manage recording and add steps without opening the popup.
- **Filter Static Assets**: Option to exclude images, CSS, JS, and other static files.
- **JMX Export**: Generates a ready-to-use JMeter `.jmx` file with Transaction Controllers.

## Installation
1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** in the top right corner.
3. Click on **Load unpacked**.
4. Select the `Jmeter_Script_Generator` folder.
5. The extension icon should appear in your browser toolbar.

## Usage
1. **Start Recording**:
   - Click the extension icon.
   - (Optional) Check "Limit to Current Domain" to filter noise.
   - Click **Start Recording**.
   - A floating overlay will appear on the page.

2. **During Recording**:
   - Navigate through your test flow.
   - Use the Floating UI to **Add Steps** (e.g., type "Checkout" and click "+").
   - The extension badge will pulse "REC".

3. **Stop & Export**:
   - Click **Stop** on the overlay or popup.
   - Open the popup and click **Download JMX**.
   - Open the `.jmx` file in Apache JMeter.

## Structure
- `manifest.json`: Extension configuration.
- `background.js`: Core logic, request capturing, and filtering.
- `content.js` & `content.css`: Floating UI implementation.
- `popup.html/css/js`: The main extension popup.
- `jmx_converter.js`: Utility to convert captured requests to XML format.
