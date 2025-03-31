# Crustdata Level 1 Submission - AI Agent for Browser Automation

This project implements an AI agent to automate browser workflows for the Crustdata Level 1 challenge. It uses Selenium WebDriver to control a Chrome browser and performs the following tasks:

- Logs into SauceDemo and GitHub.
- Searches for specific items (e.g., "backpack" on SauceDemo, "xAI repository" on GitHub).
- Interacts with search results (e.g., adds to cart on SauceDemo, stars a repository on GitHub).

## Features
- **Interact API**: Accepts natural language commands to automate browser actions.
- **Error Handling**: Includes retries, network error detection, and clear error messages.
- **Bonus Features**: CAPTCHA detection, session reuse, and dynamic content handling.

## Setup
1. Install dependencies:
   ```bash
   npm install
