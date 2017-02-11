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

const Formatter = require('./formatter');
const path = require('path');
const fs = require('fs');
const html = fs.readFileSync(path.join(__dirname, 'partials/page-execution-timings.html'), 'utf8');

class PageExecutionTimings extends Formatter {
  static getFormatter(type) {
    switch (type) {
      case 'pretty':
        return events => {
          if (!Array.isArray(events)) {
            return '';
          }

          const measuresStr = events.reduce((prev, event) => {
            let output = '\nJavaScript:\n';
            output += `    - Compile Time: ${event.compile}ms\n`;
            output += `    - Eval Time: ${event.eval}ms\n`;
            output += `    - Minor GC: ${event.minorGC}ms\n`;
            output += `    - Major GC: ${event.majorGC}ms\n`;
            output += `    - XHR Ready State Change: ${event.xhrReadyStateChange}ms\n`;
            output += `    - XHR Load: ${event.xhrLoad}ms\n`;

            output += '\nLayout, Paint, Composite and Recalc styles:\n';
            output += `    - Layout: ${event.layout}ms\n`;
            output += `    - Paint: ${event.paint}ms\n`;
            output += `    - Composite Layers: ${event.composite}ms\n`;
            output += `    - Recalc Styles: ${event.recalcStyle}ms\n`;

            output += '\nDOM/CSS:\n';
            output += `    - Parse HTML: ${event.parseHTML}ms\n`;
            output += `    - Parse Stylesheet: ${event.parseCSS}ms\n`;
            output += `    - DOM GC: ${event.domGC}ms\n`;

            output += '\nImages:\n';
            output += `    - Image decode: ${event.imageDecode}ms\n`;

            return output + '\n';
          }, '');

          return measuresStr;
        };

      case 'html':
        // Returns a handlebars string to be used by the Report.
        return html;

      default:
        throw new Error('Unknown formatter type');
    }
  }
}

module.exports = PageExecutionTimings;
