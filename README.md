# Be Anon FB

A simple userscript for viewing Facebook and Messenger stories without leaving a trace.

### What it is
Be Anon FB is a lightweight browser script that prevents Facebook from tracking your story views. It is designed to run through common userscript managers and works across both the Facebook and Messenger web platforms.

### What it does
The script keeps your name off the "Seen by" list of any story you watch. It automatically finds and stops the outgoing network notifications that would otherwise tell the poster you've seen their content. This allows you to browse stories privately without affecting the rest of the site's features.

### How it works
The script starts running as soon as the page begins to load, allowing it to monitor all outgoing network traffic. It intercepts the browser's native networking tools and inspects outgoing requests for specific data patterns.

Whenever the browser attempts to send a "seen" signal to Facebook, the script identifies the specific network instruction responsible and blocks it before it leaves your computer. It stops the notification from reaching the server and provides a mock successful response back to the browser. This ensures that your view is never recorded while keeping the website's interface functioning normally.

## Requirements

A userscript manager extension in your browser. [Tampermonkey](https://www.tampermonkey.net/) and [Violentmonkey](https://violentmonkey.github.io/) both work.

## Installation

1. Install a userscript manager if you don't have one.
2. Open `be-anon-facebook.js` and copy its contents into a new userscript in your manager, or use your manager's import feature.
3. Navigate to Facebook/Messenger - the script activates automatically.