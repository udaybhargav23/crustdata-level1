const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('chromedriver');

// Global driver for session reuse
let driver = null;

// Main function to process commands
async function interact(command, reuseSession = true) {
  if (!driver || !reuseSession) {
    if (driver) await driver.quit(); // Close old session if not reusing
    driver = await new Builder().forBrowser('chrome').build();
  }

  try {
    console.log(`Processing command: "${command}"`);
    const parts = command.split(', ');

    for (let part of parts) {
      await retryAction(async () => {
        const partLower = part.toLowerCase();
        if (partLower.includes('log into')) {
          const { site, username, password } = extractLoginDetails(part);
          await performLogin(driver, site, username, password);
          console.log(`Logged into ${site}`);
        } else if (partLower.includes('search for')) {
          const query = extractQuery(part);
          await performSearch(driver, query);
          console.log(`Searched for "${query}"`);
        } else if (partLower.includes('add the first result to cart')) {
          await addFirstResultToCart(driver);
          console.log('Added first result to cart');
        } else if (partLower.includes('go to cart and checkout')) {
          await goToCartAndCheckout(driver);
          console.log('Checked out from cart');
        } else if (partLower.includes('star the first result')) {
          await starFirstResult(driver);
          console.log('Starred the first result');
        }
      }, part);
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Extract login details
function extractLoginDetails(part) {
  const match = part.match(/log into (\w+) with username ([\w@.-]+) and password ([\w@]+(?:\W+\w+)*)/i);
  if (!match) throw Error('Invalid login command format. Expected format: "log into <site> with username <username> and password <password>"');
  return { site: match[1].toLowerCase(), username: match[2], password: match[3] };
}

// Extract search query
function extractQuery(part) {
  return part.replace(/search for /i, '').trim();
}

// Retry mechanism
async function retryAction(action, description, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await action();
      return; // If action succeeds, exit the retry loop
    } catch (error) {
      console.warn(`Attempt ${attempt} failed for "${description}": ${error.message}`);
      if (attempt === maxAttempts) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

// Check for CAPTCHA or 2FA with retry
async function checkForCaptchaOr2FA(driver, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const captcha = await driver.findElement(
        By.id('captcha') ||
        By.id('captcha-form') ||
        By.css('form#captcha-form') ||
        By.className('g-recaptcha') ||
        By.id('two-factor-authentication') ||
        By.css('[data-testid="otp-container"]') ||
        By.css('.js-two-factor-prompt')
      );
      if (captcha) {
        console.log('CAPTCHA or 2FA detected! Please solve it manually within 60 seconds.');
        await driver.wait(until.elementIsNotVisible(captcha), 60000);
        console.log('CAPTCHA/2FA solved, proceeding...');
        return true;
      }
    } catch (error) {
      if (attempt === maxAttempts) {
        console.log('No CAPTCHA or 2FA found after retries.');
        return false;
      }
      console.log(`CAPTCHA/2FA check attempt ${attempt} failed, retrying...`);
      await driver.sleep(1000);
    }
  }
  return false;
}

// Check for login error message
async function checkForLoginError(driver) {
  try {
    const error = await driver.findElement(By.css('.flash-error'));
    const errorText = await error.getText();
    if (errorText.trim()) {
      throw new Error(`Login error detected: ${errorText}. Please check your credentials or solve any CAPTCHA/2FA prompts.`);
    }
  } catch (error) {
    if (error.name === 'NoSuchElementError') {
      // No error message found, proceed
      return;
    }
    throw error;
  }
}

// Check if already logged into GitHub
async function isLoggedInToGitHub(driver) {
  try {
    let profileElement;
    try {
      profileElement = await driver.findElement(By.css('[aria-label="View profile and more"]'));
      console.log('Profile element found with aria-label: <[aria-label="View profile and more"]>');
    } catch (error) {
      console.log('Profile locator [aria-label="View profile and more"] not found, trying alternative...');
      profileElement = await driver.findElement(By.css('img.avatar-user')); // Alternative: user avatar image
    }
    const profileHtml = await profileElement.getAttribute('outerHTML');
    console.log(`Profile element found: ${profileHtml}`);
    return true;
  } catch (error) {
    console.log('Not logged in to GitHub.');
    return false;
  }
}

// Login handler
async function performLogin(driver, site, username, password) {
  const url = site === 'saucedemo' ? 'https://www.saucedemo.com' : `https://www.${site}.com`;
  try {
    await driver.get(url);
  } catch (error) {
    throw new Error(`Failed to navigate to ${url}: ${error.message}. Please check your network connection.`);
  }
  console.log(`Navigated to ${url}`);
  const title = await driver.getTitle();
  console.log(`Page title: ${title}`);
  await driver.sleep(2000); // Wait for page to stabilize
  await checkForCaptchaOr2FA(driver);

  if (site === 'saucedemo') {
    try {
      console.log('Locating username field...');
      await driver.wait(until.elementLocated(By.id('user-name')), 10000);
      await driver.findElement(By.id('user-name')).sendKeys(username);
      console.log('Entered username:', username);

      console.log('Locating password field...');
      await driver.findElement(By.id('password')).sendKeys(password);
      console.log('Entered password:', password);

      console.log('Locating login button...');
      await driver.findElement(By.id('login-button')).click();
      console.log('Clicked login button');

      console.log('Waiting for inventory page to load...');
      await driver.wait(until.elementLocated(By.className('inventory_list')), 10000);
      console.log('Inventory page loaded successfully');
    } catch (error) {
      console.error('Login failed for SauceDemo:', error.message);
      throw error;
    }
  } else if (site === 'github') {
    try {
      // Check if already logged in
      if (await isLoggedInToGitHub(driver)) {
        console.log('Already logged into GitHub, skipping login step.');
        return;
      }

      // Check if we're on the homepage and need to click "Sign in"
      if ((await driver.getCurrentUrl()).includes('github.com') && !(await driver.getCurrentUrl()).includes('/login')) {
        console.log('Locating "Sign in" link...');
        await driver.wait(until.elementLocated(By.linkText('Sign in')), 5000);
        await driver.findElement(By.linkText('Sign in')).click();
        console.log('Clicked "Sign in" button, navigating to login page...');
        await driver.wait(until.urlContains('/login'), 10000);
        await driver.sleep(2000); // Wait for CAPTCHA to load
        await checkForCaptchaOr2FA(driver);
      }

      console.log('Locating username field...');
      await driver.wait(until.elementLocated(By.id('login_field')), 5000);
      await driver.findElement(By.id('login_field')).sendKeys(username);
      console.log('Entered username:', username);

      console.log('Locating password field...');
      await driver.findElement(By.id('password')).sendKeys(password);
      console.log(`Attempting GitHub login with password: ${password}`);

      console.log('Locating login button...');
      await driver.findElement(By.name('commit')).click();
      console.log('Clicked login button');

      // Check for login error
      await driver.sleep(1000);
      await checkForLoginError(driver);

      // Check for CAPTCHA or 2FA after login attempt
      await driver.sleep(2000);
      await checkForCaptchaOr2FA(driver);

      console.log('GitHub login successful');
    } catch (error) {
      console.error('Login failed for GitHub:', error.message);
      throw error;
    }
  }
}

// Search handler
async function performSearch(driver, query) {
  const currentUrl = await driver.getCurrentUrl();
  if (currentUrl.includes('saucedemo')) {
    console.log('Locating inventory items...');
    await driver.wait(until.elementLocated(By.className('inventory_item_name')), 5000);
    let items = await driver.findElements(By.className('inventory_item_name'));
    await driver.sleep(2000);
    for (let item of items) {
      let text = await item.getText();
      if (text.toLowerCase().includes(query.toLowerCase())) {
        console.log(`Found item matching query "${query}": ${text}`);
        await item.click();
        console.log(`Clicked on item: ${text}`);
        return;
      }
    }
    throw new Error(`No item found matching "${query}". Please check the query or page content.`);
  } else if (currentUrl.includes('github')) {
    // Navigate to homepage if not already there
    if (!currentUrl.includes('github.com') || currentUrl.includes('/search')) {
      try {
        await driver.get('https://github.com');
      } catch (error) {
        throw new Error(`Failed to navigate to https://github.com: ${error.message}. Please check your network connection.`);
      }
      console.log('Navigated to GitHub homepage');
      await driver.sleep(2000);
      await checkForCaptchaOr2FA(driver);
    }

    // Click the search button to activate the search bar
    let searchButton;
    try {
      console.log('Locating search button...');
      searchButton = await driver.wait(until.elementLocated(By.css('[data-target="qbsearch-input.inputButton"]')), 5000);
      console.log('Found search button, clicking to activate search bar...');
      await searchButton.click();
    } catch (error) {
      console.error('Search button not found:', error.message);
      throw new Error('Failed to locate search button. Please check if the page structure has changed.');
    }

    // Wait for the actual search input field to appear
    let searchInput;
    try {
      console.log('Locating search input field...');
      searchInput = await driver.wait(until.elementLocated(By.id('query-builder-test')), 5000);
      console.log('Found search input with ID "query-builder-test".');
    } catch (error) {
      console.log('ID "query-builder-test" not found, trying alternative locators...');
      try {
        searchInput = await driver.wait(until.elementLocated(By.css('.QueryBuilder-Input')), 5000);
        console.log('Found search input with class "QueryBuilder-Input".');
      } catch (error) {
        console.log('Class "QueryBuilder-Input" not found, trying placeholder...');
        try {
          searchInput = await driver.wait(until.elementLocated(By.css('input[placeholder*="Search"]')), 5000);
          console.log('Found search input with placeholder.');
        } catch (error) {
          throw new Error('Failed to locate search input field. Please check if the page structure has changed.');
        }
      }
    }

    // Ensure the search input is interactable
    await driver.wait(until.elementIsEnabled(searchInput), 5000);
    await driver.wait(until.elementIsVisible(searchInput), 5000);

    // Enter the query and submit
    console.log(`Entering search query: ${query}`);
    await searchInput.sendKeys(query);
    console.log('Submitting search query...');
    await searchInput.submit();
    await driver.sleep(2000); // Wait for the page to start loading results

    // Check for CAPTCHA after search submission
    await checkForCaptchaOr2FA(driver);

    // Wait for search results with multiple locators
    let resultsList;
    try {
      console.log('Waiting for search results...');
      resultsList = await driver.wait(until.elementIsVisible(driver.findElement(By.css('[data-testid="results-list"]'))), 5000);
      console.log('Found search results with data-testid "results-list".');
    } catch (error) {
      console.log('Data-testid "results-list" not found, trying alternative locators...');
      try {
        resultsList = await driver.wait(until.elementIsVisible(driver.findElement(By.css('div[role="list"]'))), 5000);
        console.log('Found search results with role "list".');
      } catch (error) {
        console.log('Role "list" not found, trying class "search-results-container"...');
        try {
          resultsList = await driver.wait(until.elementIsVisible(driver.findElement(By.css('div.search-results-container'))), 5000);
          console.log('Found search results with class "search-results-container".');
        } catch (error) {
          console.log('Class "search-results-container" not found, trying generic container...');
          try {
            resultsList = await driver.wait(until.elementIsVisible(driver.findElement(By.css('div[role="main"]'))), 5000);
            console.log('Found search results with role "main".');
          } catch (error) {
            const pageHtml = await driver.findElement(By.tagName('body')).getAttribute('outerHTML');
            console.log('Could not find search results with any locator. Page HTML:', pageHtml);
            throw new Error('Failed to locate search results container. Please check if the page structure has changed.');
          }
        }
      }
    }

    // Check for "no results" message
    try {
      const noResults = await driver.findElement(By.css('.blankslate'));
      const noResultsText = await noResults.getText();
      if (noResultsText.includes('No results matched your search')) {
        throw new Error(`No search results found for query: ${query}. Please try a different query.`);
      }
    } catch (error) {
      if (error.name === 'NoSuchElementError') {
        // No "no results" message found, proceed
      } else {
        throw error;
      }
    }
  }
}

// SauceDemo actions
async function addFirstResultToCart(driver) {
  console.log('Locating "Add to cart" button...');
  await driver.wait(until.elementLocated(By.className('btn_inventory')), 10000);
  const addButton = await driver.findElement(By.className('btn_inventory'));
  const addButtonHtml = await addButton.getAttribute('outerHTML');
  console.log(`Found "Add to cart" button: ${addButtonHtml}`);
  console.log('Clicking "Add to cart" button...');
  await addButton.click();
  console.log('Item added to cart');
  await driver.sleep(2000);
}

async function goToCartAndCheckout(driver) {
  console.log('Navigating to cart...');
  await driver.findElement(By.className('shopping_cart_link')).click();
  console.log('Cart page loaded');

  console.log('Locating "Checkout" button...');
  await driver.wait(until.elementLocated(By.id('checkout')), 10000);
  const checkoutButton = await driver.findElement(By.id('checkout'));
  const checkoutButtonHtml = await checkoutButton.getAttribute('outerHTML');
  console.log(`Found "Checkout" button: ${checkoutButtonHtml}`);
  console.log('Clicking "Checkout" button...');
  await checkoutButton.click();
  await driver.sleep(2000);

  console.log('Waiting for checkout information page...');
  await driver.wait(until.elementLocated(By.className('checkout_info')), 10000);
  console.log('Checkout information page loaded');
  await driver.sleep(2000);
}

// GitHub actions
async function starFirstResult(driver) {
  let starButton;
  try {
    console.log('Locating "Star" button...');
    starButton = await driver.wait(until.elementLocated(By.xpath('//button[contains(., "Star")]')), 10000);
    console.log('Found star button with text "Star".');
  } catch (error) {
    console.log('Star button with text "Star" not found, trying aria-label...');
    starButton = await driver.wait(until.elementLocated(By.css('button[aria-label="Star this repository"]')), 10000);
    console.log('Found star button with aria-label "Star this repository".');
  }

  const starButtonHtml = await starButton.getAttribute('outerHTML');
  console.log(`Star button HTML: ${starButtonHtml}`);
  console.log('Clicking "Star" button...');
  await starButton.click();
  console.log('Star button clicked');
  await driver.sleep(2000);
}

// Run demos
async function runDemos() {
  await interact('Log into SauceDemo with username standard_user and password secret_sauce, search for backpack, add the first result to cart, go to cart and checkout');
  await interact('Log into GitHub with username your_username and password your_passwors, search for xAI repository, star the first result', true);
  if (driver) await driver.quit();
}

runDemos();