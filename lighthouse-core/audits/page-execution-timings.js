/**
 * @license
 * Copyright 2016 Google Inc. All rights reserved.
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

const Audit = require('./audit');
const Formatter = require('../formatters/formatter');
const TimelineModel = require('../lib/traces/devtools-timeline-model');

function dumpTree(tree, timeValue) {
  const result = new Map();
  tree.children.forEach((value, key) => result.set(key, value[timeValue].toFixed(1)));
  return result;
}

function getTreeValue(key, tree) {
  return tree.get(key) || 0;
}

/**
 * @param {!Array<!Object>} traceData
 * @return {!Array<!UserTimingsExtendedInfo>}
 */
function filterTrace(traceData) {
  const pageExecutionTimings = [];
  const timelineModel = new TimelineModel(traceData);
  const bottomUpByName = timelineModel.bottomUpGroupBy('EventName');
  const tree = dumpTree(bottomUpByName, 'selfTime');

  // JavaScript
  const compileTime = getTreeValue('Compile Script', tree);
  const evalTime = getTreeValue('Evaluate Script', tree);
  const minorGC = getTreeValue('Minor GC', tree);
  const majorGC = getTreeValue('Major GC', tree);
  const xhrLoad = getTreeValue('XHR Ready State Change', tree);
  const xhrReadyStateChange = getTreeValue('XHR Ready State Change', tree);

  // Layout, Paint, Composite and Recalc styles
  const layout = getTreeValue('Layout', tree);
  const paint = getTreeValue('Paint', tree);
  const composite = getTreeValue('Composite Layers', tree);
  const recalcStyle = getTreeValue('Recalculate Style', tree);

  // DOM/CSS
  const parseHTML = getTreeValue('Parse HTML', tree);
  const parseCSS = getTreeValue('Parse Stylesheet', tree);
  const domGC = getTreeValue('DOM GC', tree);

  // Images
  const imageDecode = getTreeValue('Image Decode', tree);

  pageExecutionTimings.push({
    compile: compileTime,
    eval: evalTime,
    minorGC: minorGC,
    majorGC: majorGC,
    layout: layout,
    paint: paint,
    composite: composite,
    recalcStyle: recalcStyle,
    parseHTML: parseHTML,
    parseCSS: parseCSS,
    domGC: domGC,
    imageDecode: imageDecode,
    xhrLoad: xhrLoad,
    xhrReadyStateChange: xhrReadyStateChange
  });

  return pageExecutionTimings;
}

// Question: safe to just start renaming?
class PageExecutionTimings extends Audit {
  /**
   * @return {!AuditMeta}
   */
  static get meta() {
    return {
      category: 'Performance',
      name: 'page-execution-timings',
      description: 'Page Execution Breakdown',
      helpText: 'A break-down of where time is spent during page execution',
      requiredArtifacts: ['traces']
    };
  }

  /**
   * @param {!Artifacts} artifacts
   * @return {!AuditResult}
   */
  static audit(artifacts) {
    const traceContents = artifacts.traces[Audit.DEFAULT_PASS].traceEvents;
    const pageExecutionTimings = filterTrace(traceContents);

    return PageExecutionTimings.generateAuditResult({
      rawValue: true,
      displayValue: pageExecutionTimings.length,
      extendedInfo: {
        formatter: Formatter.SUPPORTED_FORMATS.PAGE_EXECUTION_TIMINGS,
        value: pageExecutionTimings
      }
    });
  }
}

module.exports = PageExecutionTimings;
