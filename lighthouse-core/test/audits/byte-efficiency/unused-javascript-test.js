/**
 * Copyright 2017 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
'use strict';

const UnusedJavaScript = require('../../../audits/byte-efficiency/unused-javascript');
const assert = require('assert');

/* eslint-env mocha */

function generateRecord(url, transferSize) {
  url = `https://google.com/${url}`;
  return {url, transferSize};
}

function generateScript(url, ranges) {
  url = `https://google.com/${url}`;
  const functions = ranges.map(range => {
    return {
      ranges: [
        {
          startOffset: range[0],
          endOffset: range[1],
          count: range[2] ? 1 : 0,
        }
      ]
    };
  });

  return {url, functions};
}

describe('UnusedJavaScript audit', () => {
  describe('#findUsedAndUnused', () => {
    it('should work for an empty list', () => {
      const result = UnusedJavaScript.findUsedAndUnused([]);
      assert.deepEqual(result, {used: 0, unused: 0});
    });

    it('should work for a single range', () => {
      const range = {used: 100, unused: 0};
      const result = UnusedJavaScript.findUsedAndUnused([range]);
      assert.deepEqual(result, {used: 100, unused: 0});
    });

    it('should work for a series of ranges', () => {
      const rangeA = {used: 100, unused: 0, startOffset: 0, endOffset: 100};
      const rangeB = {used: 0, unused: 20, startOffset: 100, endOffset: 120};
      const result = UnusedJavaScript.findUsedAndUnused([rangeA, rangeB]);
      assert.deepEqual(result, {used: 100, unused: 20});
    });

    it('should work for a used nested ranges', () => {
      const rangeA = {used: 100, unused: 0, isUsed: true, startOffset: 0, endOffset: 100};
      const rangeB = {used: 40, unused: 0, isUsed: true, startOffset: 10, endOffset: 50};
      const rangeC = {used: 0, unused: 10, isUsed: false, startOffset: 20, endOffset: 30};
      const rangeD = {used: 15, unused: 0, isUsed: true, startOffset: 75, endOffset: 90};
      const result = UnusedJavaScript.findUsedAndUnused([rangeA, rangeB, rangeC, rangeD]);
      assert.deepEqual(result, {used: 90, unused: 10});
    });
  });

  describe('#computeWaste', () => {
    const scriptUsage = generateScript('myscript.js', [
      [0, 100, true], // 40% used overall

      [0, 10, true],
      [0, 40, true],
      [20, 40, false],

      [60, 100, false],
      [70, 80, false],

      [100, 150, false],
      [180, 200, false],
      [100, 200, true], // 30% used overall
    ]);

    it('should compute wastedPercent', () => {
      const result = UnusedJavaScript.computeWaste(scriptUsage, {transferSize: 0});
      assert.equal(result.wastedPercent, 65);
    });

    it('should compute wastedBytes', () => {
      const result = UnusedJavaScript.computeWaste(scriptUsage, {transferSize: 1000});
      assert.equal(result.wastedBytes, 650);
    });

    it('should compute numUnused', () => {
      const result = UnusedJavaScript.computeWaste(scriptUsage, {transferSize: 1000});
      assert.equal(result.numUnused, 5);
    });

    it('should get totalBytes', () => {
      const result = UnusedJavaScript.computeWaste(scriptUsage, {transferSize: 1000});
      assert.equal(result.totalBytes, 1000);
    });
  });

  describe('audit_', () => {
    const scriptA = generateScript('scriptA.js', [[0, 100, true]]);
    const scriptADuplicate = generateScript('scriptA.js', [[0, 100, true]]);
    const scriptB = generateScript('scriptB.js', [[0, 100, true], [0, 50, false]]);
    const scriptBDuplicate = generateScript('scriptB.js', [[0, 100, false]]);
    const recordA = generateRecord('scriptA.js', 35000);
    const recordB = generateRecord('scriptB.js', 50000);

    const result = UnusedJavaScript.audit_(
      {JsUsage: [scriptA, scriptADuplicate, scriptB, scriptBDuplicate]},
      [recordA, recordB]
    );

    it('should consolidate duplicates', () => {
      assert.equal(result.results.length, 1);
      assert.equal(result.results[0].wastedPercent, 50);
    });
  });
});
