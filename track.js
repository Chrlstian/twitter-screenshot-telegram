const TelegramBot = require('node-telegram-bot-api');
const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

// Telegram Bot Token and Chat ID
const TELEGRAM_BOT_TOKEN = '7667528987:AAEEzGSppQjleJxgerdClix6Ps9Y8zpvuhA';
const TELEGRAM_CHAT_ID = '5966357024';

// Initialize Telegram bot
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN);

// Array of Twitter profiles to track
const TWITTER_USER_HANDLES = ['SuiNetwork', 'elonmusk', 'jack']; // Add more users as needed

// Store the last processed tweet for each user
let lastProcessedTweets = {};

// Create temp directory path
const tempDir = path.join(__dirname, 'temp');

// CSS to hide login prompts and other unwanted elements
const HIDE_LOGIN_CSS = ` 
  div[aria-label="Login form"],
  div[role="group"][tabindex="0"],
  div[data-testid="TopNavBar"],
  div[data-testid="BottomBar"],
  div[data-testid="LoginForm"],
  div[data-testid="SignupForm"],
  div[data-testid="sheetDialog"],
  div[data-testid="mask"],
  div[aria-labelledby="modal-header"],
  div[role="dialog"],
  div[data-testid="appbar-scroll-below-top"] {
    display: none !important;
    visibility: hidden !important;
    opacity: 0 !important;
  }
  body {
    overflow: auto !important;
  }
`;

// Function to capture screenshot of a tweet
async function captureTweetScreenshot(tweetUrl) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 800 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    await page.setRequestInterception(true);
    page.on('request', request => request.continue());
    await page.evaluateOnNewDocument(`document.addEventListener('DOMContentLoaded', () => { const style = document.createElement('style'); style.textContent = ${JSON.stringify(HIDE_LOGIN_CSS)}; document.head.appendChild(style); });`);

    await page.goto(tweetUrl, { waitUntil: 'networkidle0' });
    await page.addStyleTag({ content: HIDE_LOGIN_CSS });

    await page.waitForSelector('article[data-testid="tweet"]', { timeout: 30000 });

    await new Promise(resolve => setTimeout(resolve, 1000));

    const element = await page.$('article[data-testid="tweet"]');
    const screenshotPath = path.join(tempDir, `tweet_${Date.now()}.png`);
    await element.screenshot({ path: screenshotPath });

    return screenshotPath;
  } catch (error) {
    console.error('Error capturing screenshot:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

// Function to fetch tweets and capture screenshots
async function fetchAndProcessTweets() {
  let browser;
  try {
    console.log('Checking for new tweets...');
    
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    await page.setRequestInterception(true);
    page.on('request', request => request.continue());
    await page.evaluateOnNewDocument(`document.addEventListener('DOMContentLoaded', () => { const style = document.createElement('style'); style.textContent = ${JSON.stringify(HIDE_LOGIN_CSS)}; document.head.appendChild(style); });`);

    for (let userHandle of TWITTER_USER_HANDLES) {
      console.log(`Fetching tweets for ${userHandle}...`);
      
      // Navigate to the user's profile
      await page.goto(`https://twitter.com/${userHandle}`, {
        waitUntil: 'networkidle0',
        timeout: 60000
      });

      await page.addStyleTag({ content: HIDE_LOGIN_CSS });

      await page.waitForSelector('article[data-testid="tweet"]', { timeout: 30000 });

      const tweets = await page.$$eval('article[data-testid="tweet"]', tweets => {
        return tweets.map(tweet => {
          const link = tweet.querySelector('a[href*="/status/"]');
          return link ? link.href : null;
        }).filter(Boolean);
      });

      if (tweets.length > 0) {
        const latestTweet = tweets[0];
        if (latestTweet !== lastProcessedTweets[userHandle]) {
          try {
            console.log(`Processing latest tweet from ${userHandle}: ${latestTweet}`);
            
            const screenshotPath = await captureTweetScreenshot(latestTweet);
            
            await sendToTelegram(screenshotPath, latestTweet, userHandle);
            
            lastProcessedTweets[userHandle] = latestTweet;
            await fs.unlink(screenshotPath).catch(console.error);
          } catch (error) {
            console.error(`Error processing tweet from ${userHandle}:`, error);
          }
        } else {
          console.log(`No new tweets for ${userHandle}`);
        }
      }
    }
  } catch (error) {
    console.error('Error fetching tweets:', error);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

async function sendToTelegram(screenshotPath, tweetUrl, userHandle) {
  try {
    await fs.access(screenshotPath);
    const screenshot = await fs.readFile(screenshotPath);
    await bot.sendPhoto(TELEGRAM_CHAT_ID, screenshot, {
      caption: `New tweet from @${userHandle}: ${tweetUrl}`
    });
    console.log('Screenshot sent to Telegram successfully');
  } catch (error) {
    console.error('Error sending to Telegram:', error);
    throw error;
  }
}

async function setupTempDirectory() {
  try {
    await fs.mkdir(tempDir, { recursive: true });
    console.log('Temporary directory created at:', tempDir);
  } catch (error) {
    console.error('Error creating temp directory:', error);
    throw error;
  }
}

async function cleanupTempFiles() {
  try {
    const files = await fs.readdir(tempDir);
    for (const file of files) {
      const filePath = path.join(tempDir, file);
      await fs.unlink(filePath).catch(console.error);
    }
  } catch (error) {
    console.error('Error cleaning up temp files:', error);
  }
}

async function startBot() {
  try {
    console.log('Starting Twitter profile tracking...');
    await setupTempDirectory();
    await cleanupTempFiles();
    await fetchAndProcessTweets();
    setInterval(fetchAndProcessTweets, 300000);
    setInterval(cleanupTempFiles, 3600000);
  } catch (error) {
    console.error('Error starting bot:', error);
  }
}

startBot();







