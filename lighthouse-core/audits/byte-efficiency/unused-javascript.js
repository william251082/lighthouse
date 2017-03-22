/**
 * @license
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

const Audit = require('./byte-efficiency-audit');
const URL = require('../../lib/url-shim');

const IGNORE_THRESHOLD_IN_BYTES = 2048;

class UnusedJavaScript extends Audit {
  /**
   * @return {!AuditMeta}
   */
  static get meta() {
    return {
      category: 'Performance',
      name: 'unused-javascript',
      description: 'Unused JavaScript',
      informative: true,
      helpText: 'Remove unused JavaScript to reduce bytes consumed by network activity.',
      requiredArtifacts: ['JsUsage', 'networkRecords']
    };
  }

  /**
   * @param {{used: number, unused: number}} objA
   * @param {{used: number, unused: number}} objB
   * @return {{used: number, unused: number}}
   */
  static _add(objA, objB) {
    return {
      used: objA.used + objB.used,
      unused: objA.unused + objB.unused,
    };
  }

  /**
   * Determines the length of unused and used portions in a set of ranges.
   * Because the protocol reports usage for each function and ranges within each function, nested
   * regions are represented numerous times. This function makes sure to only count each string
   * section once. See unit and smoke tests for examples.
   *
   * @param {!Array<{isUsed: boolean, startOffset: number, endOffset: number
   *    used: number, unused: number}>} ranges
   * @return {{used: number, unused: number}}
   */
  static findUsedAndUnused(ranges) {
    if (ranges.length === 0) {
      return {used: 0, unused: 0};
    } else if (ranges.length === 1) {
      return ranges[0];
    }

    const firstRange = ranges[0];
    const secondRange = ranges[1];
    if (secondRange.startOffset >= firstRange.endOffset) {
      // Ranges aren't nested, we can simply continue on to the rest.
      return this._add(
        this._add(firstRange, {used: secondRange.startOffset - firstRange.endOffset, unused: 0}),
        this.findUsedAndUnused(ranges.slice(1))
      );
    } else {
      let endIndex = 1;
      while (endIndex < ranges.length && ranges[endIndex].startOffset < firstRange.endOffset) {
        endIndex++;
      }

      const spanningRanges = ranges.slice(1, endIndex);
      const restOfRanges = ranges.slice(endIndex);
      if (firstRange.isUsed) {
        // Nested ranges may potentially be unused which we need to account for.
        const earliestStart = secondRange.startOffset;
        const latestEnd = spanningRanges.reduce((max, next) => {
          return max.endOffset >= next.endOffset ? max : next;
        }).endOffset;
        const nextStart = (restOfRanges[0] && restOfRanges[0].startOffset) || firstRange.endOffset;

        const leftEdge = {used: earliestStart - firstRange.startOffset, unused: 0};
        const rightEdge = {used: nextStart - latestEnd, unused: 0};
        const inner = this.findUsedAndUnused(spanningRanges);
        const rest = this.findUsedAndUnused(restOfRanges);
        return this._add(this._add(leftEdge, rightEdge), this._add(inner, rest));
      } else {
        // Nested ranges won't be used if the entire parent wasn't used, just skip the children.
        return this._add(firstRange, this.findUsedAndUnused(restOfRanges));
      }
    }
  }

  /**
   * @param {!Object} script
   * @param {{transferSize: number}} networkRecord
   */
  static computeWaste(script, networkRecord) {
    const url = URL.getDisplayName(script.url);

    let numUnusedFunctions = 0;
    const ranges = [];
    script.functions.forEach(func => {
      let functionIsUsed = false;
      func.ranges.forEach(range => {
        const isUsed = range.count > 0;
        const span = range.endOffset - range.startOffset;
        const used = isUsed ? span : 0;
        const unused = isUsed ? 0 : span;

        functionIsUsed = functionIsUsed || isUsed;
        ranges.push(Object.assign({isUsed, span, used, unused}, range));
      });

      if (!functionIsUsed) {
        numUnusedFunctions++;
      }
    });

    ranges.sort((rangeA, rangeB) => {
      return rangeA.startOffset - rangeB.startOffset || rangeB.endOffset - rangeA.endOffset;
    });

    const results = this.findUsedAndUnused(ranges);
    const wastedRatio = (results.unused / (results.unused + results.used)) || 0;
    const totalBytes = networkRecord.transferSize;
    const wastedBytes = Math.round(totalBytes * wastedRatio);

    return {
      url,
      totalBytes,
      wastedBytes,
      wastedPercent: 100 * wastedRatio,
      numUnused: numUnusedFunctions,
    };
  }

  /**
   * @param {!Artifacts} artifacts
   * @return {{results: !Array<!Object>, tableHeadings: !Object}}
   */
  static audit_(artifacts, networkRecords) {
    const resultsMap = artifacts.JsUsage.reduce((results, script) => {
      const networkRecord = networkRecords.find(record => record.url === script.url);
      if (!networkRecord) {
        return results;
      }

      const result = UnusedJavaScript.computeWaste(script, networkRecord);
      // Use the one with minimal waste since coverage can report false duplicates.
      const existing = results.get(result.url);
      if (!existing || existing.wastedBytes > result.wastedBytes) {
        results.set(result.url, result);
      }

      return results;
    }, new Map());

    const results = Array.from(resultsMap.values())
        .filter(item => item.wastedBytes > IGNORE_THRESHOLD_IN_BYTES);

    return {
      results,
      tableHeadings: {
        url: 'URL',
        numUnused: 'Unused Functions',
        totalKb: 'Original',
        potentialSavings: 'Potential Savings',
      }
    };
  }
}

module.exports = UnusedJavaScript;
