# WhatsApp Score Tracker Bot

## Table of Contents

- [Introduction](#introduction)
- [Technical Overview](#technical-overview)
- [How It Works](#how-it-works)
- [Example Usage](#example-usage)
- [Dependencies](#dependencies)
- [Installation](#installation)
  - [Prerequisites](#prerequisites)
  - [Setup](#setup)
  - [Running the Bot](#running-the-bot)
- [Commands](#commands)
- [Project Structure](#project-structure)
- [License](#license)
- [Contact](#contact)

---

## Introduction

The **WhatsApp Score Tracker Bot** is a Node.js application designed to track and manage scores within WhatsApp groups. It allows users to submit numerical scores, keeps track of total and monthly scores, and sends automatic congratulatory messages when certain milestones are reached.

---

## Technical Overview

This bot leverages the following technologies:

- **Node.js**: Server-side JavaScript runtime.
- **whatsapp-web.js**: A powerful library to interact with the WhatsApp Web API.
- **MongoDB**: NoSQL database to store user data and scores.
- **Mongoose**: Object Data Modeling (ODM) library for MongoDB and Node.js.
- **Express.js**: Web framework for Node.js to run a minimal server.
- **Moment.js**: Library for parsing, validating, manipulating, and formatting dates.
- **dotenv**: Loads environment variables from a `.env` file.
- **qrcode-terminal**: Generates QR codes in the terminal for authentication.

### Key Features

- **User Identification**: Uses the unique WhatsApp sender ID to distinguish users.
- **Score Tracking**: Records scores per user, both total and monthly.
- **Automatic Milestone Notifications**: Sends a congratulatory message when a user reaches multiples of 50 points.
- **Command Handling**: Supports various commands to interact with the bot.
- **Configurable Start Day**: Allows setting a custom day to begin the monthly score cycle.

---

## How It Works

The bot listens for incoming messages in WhatsApp groups and individual chats. When a message containing only a number is received, the bot:

1. **Identifies the User**: Extracts the sender's unique ID to ensure accurate tracking.
2. **Validates the Score**: Checks if the message is a positive integer.
3. **Updates the Database**:
   - If the user exists, it updates their total and monthly scores.
   - If the user is new, it creates a new record in the database.
4. **Sends Responses**:
   - Replies with a "✅" if automatic replies are enabled.
   - Sends a congratulatory message if the user reaches a milestone (e.g., 50, 100 points).

---

## Example Usage

### Scenario

In a WhatsApp group, members are tracking their daily study hours. They report their hours by sending the number to the group. The bot keeps track of these numbers and provides rankings.

### Participants

- **user1**
- **user2**
- **user3**

### Interactions

1. **user1** sends:
5
- Bot replies:
  ```
  ✅
  ```

2. **user2** sends:
7- Bot replies:
  ```
  ✅
  ```

3. **user1** reaches a milestone by accumulating 50 study hours over time.
- Bot sends:
  ```
  user1 has just reached 50 points!!! 🎉
  ```

4. **user3** sends an invalid message:
Studied 6 hours
- Bot ignores the message (since it contains non-numeric characters).

5. **A member types a command**:
/top
- Bot replies:
  ```
  *Global Ranking:*
  1. user2 - Total: 70
  2. user1 - Total: 50
  ```

---

## Dependencies

- **Node.js** (v12 or higher)
- **npm** (Node Package Manager)
- **MongoDB Atlas** (or local MongoDB instance)
- **whatsapp-web.js**
- **Mongoose**
- **Express.js**
- **Moment.js**
- **dotenv**
- **qrcode-terminal**

---

## Installation

### Prerequisites

- **Node.js** installed on your machine.
- **MongoDB** database set up (MongoDB Atlas recommended).
- **Git** for cloning the repository.

### Setup

1. **Clone the Repository**

```bash
git clone https://github.com/your-username/whatsapp-score-tracker-bot.git
cd whatsapp-score-tracker-bot
```
2. **Install Dependencies**
npm install
3. **Environment Variables**
Create a .env file in the root directory and add:
```env
MONGODB_URI=your_mongodb_connection_string
```
4. **Configuration**
Adjust config.js if needed:
```javascript
const moment = require('moment');
require('moment/locale/en'); // Use English locale

moment.locale('en');

module.exports = {
  MONTH_START_DAY: 1, // Change to your preferred start day
};
```
## Running the Bot
Start the bot by running:
```bash
node index.js
```
Upon starting, a QR code will appear in the terminal. Scan it with your WhatsApp application to authenticate the bot.
## Commands
/ping

    Description: Checks if the bot is responsive.
    Usage: /ping
    Bot Replies: pong

/top

    Description: Displays the global ranking based on total scores.
    Usage: /top
    Bot Replies:

    markdown

    *Global Ranking:*
    1. user2 - Total: 70
    2. user1 - Total: 50

/month

    Description: Displays the ranking for the current month.
    Usage: /month
    Bot Replies:

    markdown

    *Ranking for October:*
    1. user2 - October: 20
    2. user1 - October: 15

/noreply

    Description: Disables automatic "✅" replies.
    Usage: /noreply
    Bot Replies: ✅ Automatic replies have been disabled.

/reply

    Description: Enables automatic "✅" replies.
    Usage: /reply
    Bot Replies: ✅ Automatic replies have been enabled.

/commands

    Description: Lists all available commands.
    Usage: /commands
    Bot Replies:

    sql

*Available Commands:*
/ping - Checks bot responsiveness.
/top - Shows global ranking.
/month - Shows current month's ranking.
/noreply - Disables automatic "✅" replies.
/reply - Enables automatic "✅" replies.
/commands - Lists all commands.
