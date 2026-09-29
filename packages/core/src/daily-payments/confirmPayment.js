'use strict';

const readline = require('readline');

/**
 * @param {string} question
 * @returns {Promise<string>}
 */
async function defaultConfirmFn(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const answer = await new Promise((resolve) => {
    rl.question(question, resolve);
  });
  rl.close();
  return (answer || '').trim().toLowerCase();
}

/**
 * @param {string} answer
 * @returns {boolean}
 */
function isAffirmative(answer) {
  const normalized = String(answer).trim().toLowerCase();
  return normalized === 'да' || normalized === 'yes' || normalized === 'y';
}

/**
 * @param {{
 *   owedTotalDisplay: string,
 *   walletName: string,
 *   confirmFn?: (question: string) => Promise<string>,
 *   isTty?: boolean,
 * }} params
 * @returns {Promise<boolean>}
 */
async function confirmPayment(params) {
  const {
    owedTotalDisplay,
    walletName,
    confirmFn = defaultConfirmFn,
    isTty = process.stdin.isTTY,
    question: customQuestion = null,
  } = params;

  if (!isTty) {
    const error = new Error(
      'Подтверждение выплаты требует интерактивный TTY. Запустите команду в терминале.'
    );
    error.code = 'TTY_REQUIRED';
    throw error;
  }

  const question =
    customQuestion ??
    `❓ Подтвердить перевод ${owedTotalDisplay} на ${walletName}? (да/нет) `;
  const answer = await confirmFn(question);
  return isAffirmative(answer);
}

module.exports = {
  defaultConfirmFn,
  isAffirmative,
  confirmPayment,
};
