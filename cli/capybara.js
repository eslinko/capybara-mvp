'use strict';

/**
 * Capybara CLI entry — lives in capybara/; scripts/capybara.js is a thin shim.
 *
 * Usage (from repo root):
 *   CAPYBARA_ACTION=0 node scripts/capybara.js
 *   CAPYBARA_ACTION=0 npm run cli   (from capybara/)
 */
const logger = require('../packages/core/src/lib/infrastructure/Logger');
const CapybaraRouter = require('../packages/core/src/CapybaraRouter');

async function main() {
  const logLevel = process.env.LOG_LEVEL || (process.env.DEBUG ? 'debug' : 'info');
  logger.setLevel(logLevel);

  const rawAction = process.env.CAPYBARA_ACTION;
  if (rawAction === undefined || rawAction === null || String(rawAction).trim() === '') {
    logger.error('CAPYBARA_ACTION is required (e.g. CAPYBARA_ACTION=0 node scripts/capybara.js)');
    process.exit(1);
  }

  const action = parseInt(String(rawAction).trim(), 10);
  if (Number.isNaN(action)) {
    logger.error(`Invalid CAPYBARA_ACTION: ${rawAction}`);
    process.exit(1);
  }

  if (action === 5) {
    logger.error('Unknown Capybara action: 5. use 51 or 52');
    process.exit(1);
  }

  if (action === 6) {
    const wallet = process.env.CAPYBARA_WALLET;
    const walletKey = wallet === undefined || wallet === null ? '' : String(wallet).trim().toLowerCase();
    if (walletKey !== 'tristan' && walletKey !== 'bastian') {
      logger.error('CAPYBARA_WALLET must be tristan or bastian for action 6');
      process.exit(1);
    }
  }

  // Actions 51 and 52 do not use CAPYBARA_WALLET (unlike 1, 2, and 4).
  if (action === 1 || action === 2 || action === 4) {
    const wallet = process.env.CAPYBARA_WALLET;
    if (wallet === undefined || wallet === null || String(wallet).trim() === '') {
      logger.error(
        `CAPYBARA_WALLET is required for action ${action} (e.g. CAPYBARA_ACTION=${action} CAPYBARA_WALLET=tristan node scripts/capybara.js)`
      );
      process.exit(1);
    }
    if (action === 2 || action === 4) {
      const walletKey = String(wallet).toLowerCase().trim();
      if (walletKey !== 'tristan' && walletKey !== 'bastian') {
        logger.error(`CAPYBARA_WALLET must be tristan or bastian for action ${action}`);
        process.exit(1);
      }
    }
  }

  const router = new CapybaraRouter();
  try {
    await router.route(action);
  } catch (error) {
    if (error.message && error.message.includes('Unknown Capybara action')) {
      logger.error(error.message);
    } else {
      logger.error('Capybara CLI failed:', error.message);
    }
    if (action === 6 && error.code === 'ECANCEL') {
      process.exit(2);
    }
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
