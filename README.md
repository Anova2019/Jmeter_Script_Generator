# JMeter Script Generator Chrome Extension

This Chrome extension allows you to record your browser interactions and export them as a JMeter (.jmx) test plan.

## Features
- **Record HTTP/HTTPS Requests**: Captures URL, method, headers, and body data.
- **Filter Static Assets**: Option to exclude images, CSS, JS, and other static files to keep the script clean.
- **Real-time Stats**: Shows the number of captured requests and recording duration.
- **JMX Export**: Generates a ready-to-use JMeter `.jmx` file.

## Installation
1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** in the top right corner.
3. Click on **Load unpacked**.
4. Select the `Jmeter_Script_Generator` folder (the directory where these files are located).
5. The extension icon should appear in your browser toolbar.

## Usage
1. Click the extension icon to open the popup.
2. Click **Start Recording**.
3. Navigate through the website you want to test.
4. The extension badge will show "REC" and pulse red.
5. When finished, open the popup and click **Stop**.
6. Click **Download JMX** to save the script.
7. Open the `.jmx` file in Apache JMeter.

## Structure
- `manifest.json`: Extension configuration.
- `background.js`: Handles the recording logic and network listeners.
- `popup.html/css/js`: The user interface.
- `jmx_converter.js`: Utility to convert captured requests to XML format.
