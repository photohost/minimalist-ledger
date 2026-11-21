const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateAmount } = require('../core.js');

test('金額算式支援手機及鍵盤符號、運算順序、零與空白', () => {
  for (const [text, amount] of [
    ['', null], ['０', 0], ['000172', 172], ['172＋35×2', 242],
    ['９０－３０／３', 80], ['7-9+3', 1], ['24/3/2', 4],
    ['100÷3×3', 100], ['1/3+2/3', 1], ['999999999+1', 1000000000],
    ['999999999*999999999/999999999', 999999999]
  ]) assert.equal(calculateAmount(text), amount, text);
});

test('拒絕小數、未完成算式、超額、負數及無效除法', () => {
  for (const text of ['.5','２．５','12.0','1e2','0x10','12元','12+','*4','10--2',
    '2-3','1/0','1/3','1000000001','(2+4)','1'.repeat(81)]) {
    assert.throws(() => calculateAmount(text), undefined, text);
  }
});
