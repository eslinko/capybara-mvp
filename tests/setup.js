'use strict';

const chai = require('chai');
try {
  const chaiAsPromised = require('chai-as-promised');
  if (typeof chaiAsPromised === 'function') {
    chai.use(chaiAsPromised);
  } else if (chaiAsPromised && typeof chaiAsPromised.default === 'function') {
    chai.use(chaiAsPromised.default);
  }
} catch (_e) {
  // optional
}

process.env.NODE_ENV = 'test';
console.log('✅ Capybara test environment initialized');
