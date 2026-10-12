'use strict';

/**
 * mint UI only; не смешивать с Hardhat deploy.
 * Public entry: window.runCapyMint(formValues, uiCallbacks)
 * Page bind: window.bindCapyMintPage() — #contractAddress + #mintForm (PK textarea kept).
 * Script order: ethers (CDN), capybara-mint-config.js, then this file.
 * formValues: { privateKey, toAddress, amount, gasPrice }
 * uiCallbacks: { onStatus(message, type), onBusy(boolean) } — optional.
 * Error text uses error.message, else String(error), so non-Error throws still map.
 */

function mintConfig() {
  const config = globalThis.CapyMintConfig;
  if (!config) {
    throw new Error('CapyMintConfig missing — load capybara-mint-config.js first');
  }
  return config;
}

/**
 * @param {{ privateKey?: string, toAddress?: string, amount?: string|number }} formValues
 * @returns {string|null} RU error (HTML wording) or null
 */
function validateMintForm(formValues) {
  const privateKey = String(formValues?.privateKey ?? '').trim();
  const toAddress = String(formValues?.toAddress ?? '').trim();
  const amount = formValues?.amount;

  if (!privateKey.startsWith('0x')) {
    return '❌ Ошибка: приватный ключ должен начинаться с 0x';
  }
  if (!toAddress.startsWith('0x') || toAddress.length !== 42) {
    return '❌ Ошибка: некорректный адрес получателя';
  }
  if (!amount || parseInt(String(amount), 10) <= 0) {
    return '❌ Ошибка: укажите корректное количество токенов';
  }
  return null;
}

/**
 * @param {unknown} error
 * @returns {string}
 */
/**
 * @param {unknown} value
 * @returns {string}
 */
function shortAddress(value) {
  const text = String(value ?? '');
  if (text.length <= 6) return text;
  return `${text.slice(0, 6)}…`;
}

/**
 * @param {string} rpcUrl
 * @returns {string}
 */
function rpcHostOnly(rpcUrl) {
  try {
    return new URL(String(rpcUrl)).hostname;
  } catch {
    return '(bad rpc)';
  }
}

/**
 * @param {string} text
 * @param {string[]} secrets
 * @returns {string}
 */
function redactSecrets(text, secrets) {
  let out = String(text ?? '');
  for (const secret of secrets) {
    const value = String(secret ?? '').trim();
    if (value.length >= 8 && out.includes(value)) {
      out = out.split(value).join('[redacted]');
    }
  }
  return out;
}

let debugPrivateKey = '';

/**
 * @returns {string[]}
 */
function liveDebugSecrets() {
  const secrets = [];
  if (debugPrivateKey) secrets.push(debugPrivateKey);
  if (typeof document !== 'undefined') {
    const pk = document.getElementById('privateKey')?.value;
    if (pk) secrets.push(pk);
  }
  try {
    const rpc = mintConfig().POLYGON_RPC_URL;
    if (rpc) secrets.push(rpc);
  } catch {
    /* config not loaded yet */
  }
  return secrets;
}

/**
 * @param {Date} date
 * @returns {string}
 */
function formatDebugStamp(date) {
  const pad = (n, width = 2) => String(n).padStart(width, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

/**
 * Append-only Matrix log. Never writes privateKey or a full RPC URL.
 * @param {'info'|'ok'|'err'} level
 * @param {string} message
 * @param {string} [detail]
 */
function appendMintDebug(level, message, detail) {
  const safeLevel = level === 'ok' || level === 'err' ? level : 'info';
  const secrets = liveDebugSecrets();
  const safeMessage = redactSecrets(message, secrets);
  const safeDetail = detail == null || detail === '' ? '' : redactSecrets(detail, secrets);
  const line = safeDetail
    ? `[${formatDebugStamp(new Date())}] ${safeLevel} ${safeMessage} | ${safeDetail}`
    : `[${formatDebugStamp(new Date())}] ${safeLevel} ${safeMessage}`;
  if (typeof document !== 'undefined') {
    const terminal = document.getElementById('mintDebugTerminal');
    if (terminal) {
      terminal.textContent = terminal.textContent ? `${terminal.textContent}\n${line}` : line;
      terminal.scrollTop = terminal.scrollHeight;
    }
  }
  if (safeLevel === 'err') {
    console.error(line);
  } else {
    console.info(line);
  }
}

function clearMintDebug() {
  if (typeof document === 'undefined') return;
  const terminal = document.getElementById('mintDebugTerminal');
  if (terminal) terminal.textContent = '';
}

/**
 * @param {unknown} data
 * @returns {string}
 */
function shortErrorData(data) {
  if (data == null || data === '') return '';
  const raw = typeof data === 'string' ? data : JSON.stringify(data);
  return raw.length > 160 ? `${raw.slice(0, 160)}…` : raw;
}

function mapMintError(error) {
  const message = String(error?.message ?? error ?? '');
  if (message.includes('invalid private key')) {
    return 'Некорректный формат приватного ключа';
  }
  if (message.includes('insufficient funds')) {
    return 'Недостаточно MATIC для оплаты gas';
  }
  if (message.includes('execution reverted')) {
    return 'Ошибка выполнения: проверь адреса';
  }
  if (message.includes('invalid address')) {
    return 'Некорректный адрес';
  }
  return message;
}

/**
 * @param {{ privateKey: string, toAddress: string, amount: string|number, gasPrice?: string|number }} formValues
 * @param {{ onStatus?: (message: string, type: string) => void, onBusy?: (busy: boolean) => void }|null} [uiCallbacks]
 * @returns {Promise<{ ok: boolean, hash?: string, receipt?: object, explorerUrl?: string, error?: string }>}
 */
async function runCapyMint(formValues, uiCallbacks) {
  const onStatus = uiCallbacks?.onStatus ?? (() => {});
  const onBusy = uiCallbacks?.onBusy ?? (() => {});
  const privateKey = String(formValues?.privateKey ?? '').trim();
  const toAddress = String(formValues?.toAddress ?? '').trim();
  const amount = formValues?.amount;
  const gasPriceRaw = formValues?.gasPrice;
  debugPrivateKey = privateKey;

  try {
  appendMintDebug('info', 'mint submit');
  const validationError = validateMintForm({ privateKey, toAddress, amount });
  if (validationError) {
    appendMintDebug('err', validationError);
    onStatus(validationError, 'error');
    return { ok: false, error: validationError };
  }

  let config;
  try {
    config = mintConfig();
  } catch (error) {
    const errorMsg = mapMintError(error);
    appendMintDebug('err', errorMsg, `raw=${String(error)}`);
    onStatus(`❌ Ошибка: ${errorMsg}`, 'error');
    return { ok: false, error: errorMsg };
  }
  appendMintDebug('info', `config ok address=${shortAddress(config.CAPY_TOKEN_ADDRESS)}`);

  const ethersLib = globalThis.ethers;
  if (!ethersLib) {
    const missing = 'ethers не загружен (CDN script до mint.js)';
    appendMintDebug('err', missing);
    onStatus(`❌ Ошибка: ${missing}`, 'error');
    return { ok: false, error: missing };
  }
  appendMintDebug('info', 'ethers present');

  onBusy(true);
  try {
    onStatus('🌿 Подключаюсь к Polygon...', 'info');
    appendMintDebug('info', `rpc host=${rpcHostOnly(config.POLYGON_RPC_URL)}`);
    const provider = new ethersLib.JsonRpcProvider(config.POLYGON_RPC_URL);
    const wallet = new ethersLib.Wallet(privateKey, provider);
    appendMintDebug('info', `wallet=${wallet.address}`);
    const contract = new ethersLib.Contract(
      config.CAPY_TOKEN_ADDRESS,
      config.MINT_ABI,
      wallet,
    );

    onStatus('🔏 Подписываю транзакцию...', 'info');
    const amountWei = ethersLib.parseUnits(String(amount), config.TOKEN_DECIMALS);
    const gasLabel =
      gasPriceRaw !== undefined && gasPriceRaw !== null && String(gasPriceRaw).trim() !== ''
        ? String(gasPriceRaw).trim()
        : '?';
    const overrides = gasLabel === '?' ? {} : { gasPrice: ethersLib.parseUnits(gasLabel, 'gwei') };
    appendMintDebug('info', `amountWei=${amountWei} to=${toAddress} gasPrice=${gasLabel}`);
    // estimateGas not called

    const tx = await contract.mint(toAddress, amountWei, overrides);
    appendMintDebug('ok', `tx.hash=${tx.hash}`);
    onStatus('⏳ Ожидаю подтверждения на блокчейне...', 'info');
    const receipt = await tx.wait();
    appendMintDebug('ok', `receipt status=${receipt?.status} gasUsed=${receipt?.gasUsed}`);
    const explorerUrl = `${config.POLYGON_TX_EXPLORER_BASE}${tx.hash}`;
    return { ok: true, hash: tx.hash, receipt, explorerUrl };
  } catch (error) {
    const errorMsg = mapMintError(error);
    const code = error?.code ?? '';
    const reason = error?.reason ?? error?.shortMessage ?? '';
    const data = shortErrorData(error?.data ?? error?.info?.error?.data);
    appendMintDebug(
      'err',
      errorMsg,
      `code=${code} reason=${reason} data=${data} raw=${String(error)}`,
    );
    onStatus(`❌ Ошибка: ${errorMsg}`, 'error');
    return { ok: false, error: errorMsg };
  } finally {
    onBusy(false);
    appendMintDebug('info', 'busy=false');
  }
  } finally {
    debugPrivateKey = '';
  }
}

function showMintStatus(message, type) {
  const status = document.getElementById('status');
  if (!status) return;
  const useLoader = type === 'info' && !String(message).startsWith('❌');
  status.innerHTML = useLoader ? `<span class="loader"></span>${message}` : message;
  status.className = `status ${type || 'info'}`;
}

function showMintSuccess(amount, toAddress, hash, explorerUrl) {
  const txLink = `<a href="${explorerUrl}" target="_blank" class="tx-link">${hash}</a>`;
  showMintStatus(
    `✅ <strong>Успешно выпущено!</strong><br><br>` +
      `💚 Выпущено: <strong>${amount} $CAPY</strong><br>` +
      `👤 Адрес: <code>${toAddress}</code><br>` +
      `⛓️ TX: ${txLink}`,
    'success',
  );
}

/**
 * Fills info-box from config and binds #mintForm to runCapyMint.
 * No-op when there is no DOM (Node smoke).
 */
function bindCapyMintPage() {
  if (typeof document === 'undefined') return;
  const addressNode = document.getElementById('contractAddress');
  if (addressNode) {
    addressNode.textContent = mintConfig().CAPY_TOKEN_ADDRESS;
  }
  const form = document.getElementById('mintForm');
  if (!form || form.dataset.capyMintBound === '1') return;
  form.dataset.capyMintBound = '1';
  const mintBtn = document.getElementById('mintBtn');
  let keepDebugOnReset = false;
  form.addEventListener('reset', () => {
    if (keepDebugOnReset) {
      keepDebugOnReset = false;
      return;
    }
    clearMintDebug();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const privateKey = document.getElementById('privateKey').value;
    const toAddress = document.getElementById('toAddress').value;
    const amount = document.getElementById('amount').value;
    const gasPrice = document.getElementById('gasPrice').value;
    const result = await runCapyMint(
      { privateKey, toAddress, amount, gasPrice },
      {
        onStatus: showMintStatus,
        onBusy(busy) {
          if (mintBtn) mintBtn.disabled = busy;
        },
      },
    );
    if (result.ok) {
      showMintSuccess(amount, String(toAddress).trim(), result.hash, result.explorerUrl);
      keepDebugOnReset = true;
      form.reset();
    }
  });
}

globalThis.validateMintForm = validateMintForm;
globalThis.mapMintError = mapMintError;
globalThis.appendMintDebug = appendMintDebug;
globalThis.clearMintDebug = clearMintDebug;
globalThis.runCapyMint = runCapyMint;
globalThis.bindCapyMintPage = bindCapyMintPage;

if (typeof document !== 'undefined') {
  bindCapyMintPage();
}
