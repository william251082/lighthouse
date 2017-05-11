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

/* globals self Util */

/**
 * Create render context for critical-request-chain tree display.
 * @param {!Object<string, !DetailsRenderer.CRCNode>} tree
 * @return {{tree: !Object<string, !DetailsRenderer.CRCNode>, startTime: number, transferSize: number}}
 */
function initTree(tree) {
  const transferSize = 0;
  let startTime = 0;
  const rootNodes = Object.keys(tree);
  if (rootNodes.length > 0) {
    const node = tree[rootNodes[0]];
    startTime = node.request.startTime;
  }

  return {tree, startTime, transferSize};
}

/**
 * Helper to create context for each critical-request-chain node based on its
 * parent. Calculates if this node is the last child, whether it has any
 * children itself and what the tree looks like all the way back up to the root,
 * so the tree markers can be drawn correctly.
 * @param {!Object<string, !DetailsRenderer.CRCNode>} parent
 * @param {string} id
 * @param {number} startTime
 * @param {number} transferSize
 * @param {!Array<boolean>=} treeMarkers
 * @param {boolean=} parentIsLastChild
 * @return {!DetailsRenderer.CRCSegment}
 */
function createSegment(parent, id, startTime, transferSize, treeMarkers, parentIsLastChild) {
  const node = parent[id];
  const siblings = Object.keys(parent);
  const isLastChild = siblings.indexOf(id) === (siblings.length - 1);
  const hasChildren = Object.keys(node.children).length > 0;

  // Copy the tree markers so that we don't change by reference.
  const newTreeMarkers = Array.isArray(treeMarkers) ? treeMarkers.slice(0) : [];

  // Add on the new entry.
  if (typeof parentIsLastChild !== 'undefined') {
    newTreeMarkers.push(!parentIsLastChild);
  }

  return {
    node,
    isLastChild,
    hasChildren,
    startTime,
    transferSize: transferSize + node.request.transferSize,
    treeMarkers: newTreeMarkers
  };
}


class DetailsRenderer {
  /**
   * @param {!DOM} dom
   * @param {!Document|!Element} templateContext
   */
  constructor(dom, templateContext) {
    /** @private {!DOM} */
    this._dom = dom;
    /** @private {!Document|!Element} */
    this._templateContext = templateContext;
  }

  /**
   * @param {!Document|!Element} context
   */
  setTemplateContext(context) {
    this._templateContext = context;
  }

  /**
   * @param {!DetailsRenderer.DetailsJSON} details
   * @return {!Node}
   */
  render(details) {
    switch (details.type) {
      case 'text':
        return this._renderText(details);
      case 'url':
        return this._renderURL(details);
      case 'thumbnail':
        return this._renderThumbnail(details);
      case 'cards':
        return this._renderCards(/** @type {!DetailsRenderer.CardsDetailsJSON} */ (details));
      case 'table':
        return this._renderTable(/** @type {!DetailsRenderer.TableDetailsJSON} */ (details));
      case 'code':
        return this._renderCode(details);
      case 'node':
        return this.renderNode(/** @type {!DetailsRenderer.NodeDetailsJSON} */(details));
      case 'crc':
        return this._renderCriticalRequestChains(
            /** @type {!DetailsRenderer.CRCDetailsJSON} */ (details));
      case 'list':
        return this._renderList(/** @type {!DetailsRenderer.ListDetailsJSON} */ (details));
      default:
        throw new Error(`Unknown type: ${details.type}`);
    }
  }

  /**
   * @param {!DetailsRenderer.DetailsJSON} text
   * @return {!Element}
   */
  _renderURL(text) {
    const element = this._renderText(text);
    element.classList.add('lh-text__url');
    return element;
  }

  /**
   * @param {!DetailsRenderer.DetailsJSON} text
   * @return {!Element}
   */
  _renderText(text) {
    const element = this._dom.createElement('div', 'lh-text');
    element.textContent = text.text;
    return element;
  }

  /**
   * Create small thumbnail with scaled down image asset.
   * If the supplied details doesn't have an image/* mimeType, then an empty span is returned.
   * @param {!DetailsRenderer.ThumbnailDetails} value
   * @return {!Element}
   */
  _renderThumbnail(value) {
    if (/^image/.test(value.mimeType) === false) {
      return this._dom.createElement('span');
    }

    const element = this._dom.createElement('img', 'lh-thumbnail');
    element.src = value.url;
    element.alt = '';
    element.title = value.url;
    return element;
  }

  /**
   * @param {!DetailsRenderer.ListDetailsJSON} list
   * @return {!Element}
   */
  _renderList(list) {
    const element = this._dom.createElement('details', 'lh-details');
    if (list.header) {
      const summary = this._dom.createElement('summary', 'lh-list__header');
      summary.textContent = list.header.text;
      element.appendChild(summary);
    }

    const itemsElem = this._dom.createElement('div', 'lh-list__items');
    for (const item of list.items) {
      itemsElem.appendChild(this.render(item));
    }
    element.appendChild(itemsElem);
    return element;
  }

  /**
   * @param {!DetailsRenderer.TableDetailsJSON} details
   * @return {!Element}
   */
  _renderTable(details) {
    if (!details.items.length) return this._dom.createElement('span');

    const element = this._dom.createElement('details', 'lh-details');
    if (details.header) {
      element.appendChild(this._dom.createElement('summary')).textContent = details.header;
    }

    const tableElem = this._dom.createChildOf(element, 'table', 'lh-table');
    const theadElem = this._dom.createChildOf(tableElem, 'thead');
    const theadTrElem = this._dom.createChildOf(theadElem, 'tr');

    for (const heading of details.itemHeaders) {
      const itemType = heading.itemType || 'text';
      const classes = `lh-table-column--${itemType}`;
      this._dom.createChildOf(theadTrElem, 'th', classes).appendChild(this.render(heading));
    }

    const tbodyElem = this._dom.createChildOf(tableElem, 'tbody');
    for (const row of details.items) {
      const rowElem = this._dom.createChildOf(tbodyElem, 'tr');
      for (const columnItem of row) {
        const classes = `lh-table-column--${columnItem.type}`;
        this._dom.createChildOf(rowElem, 'td', classes).appendChild(this.render(columnItem));
      }
    }
    return element;
  }

  /**
   * @param {!DetailsRenderer.NodeDetailsJSON} item
   * @return {!Element}
   * @protected
   */
  renderNode(item) {
    throw new Error('Not yet implemented', item);
  }

  /**
   * @param {!DetailsRenderer.CardsDetailsJSON} details
   * @return {!Element}
   */
  _renderCards(details) {
    const element = this._dom.createElement('details', 'lh-details');
    if (details.header) {
      element.appendChild(this._dom.createElement('summary')).textContent = details.header.text;
    }

    const cardsParent = this._dom.createElement('div', 'lh-scorecards');
    for (const item of details.items) {
      const card = cardsParent.appendChild(
          this._dom.createElement('div', 'lh-scorecard', {title: item.snippet}));
      const titleEl = this._dom.createElement('div', 'lh-scorecard__title');
      const valueEl = this._dom.createElement('div', 'lh-scorecard__value');
      const targetEl = this._dom.createElement('div', 'lh-scorecard__target');

      card.appendChild(titleEl).textContent = item.title;
      card.appendChild(valueEl).textContent = item.value;

      if (item.target) {
        card.appendChild(targetEl).textContent = `target: ${item.target}`;
      }
    }

    element.appendChild(cardsParent);
    return element;
  }

  /**
   * @param {!DetailsRenderer.DetailsJSON} details
   * @return {!Element}
   */
  _renderCode(details) {
    const pre = this._dom.createElement('pre', 'lh-code');
    pre.textContent = details.text;
    return pre;
  }

  /**
   * @param {!DetailsRenderer.CRCDetailsJSON} details
   * @return {!Node}
   */
  _renderCriticalRequestChains(details) {
    const tmpl = this._dom.cloneTemplate('#tmpl-lh-crc', this._templateContext);

    // Fill in top summary.
    this._dom.find('.lh-crc__longest_duration', tmpl).textContent =
        Util.formatNumber(details.longestChain.duration) + 'ms';
    this._dom.find('.lh-crc__longest_length', tmpl).textContent = details.longestChain.length;
    this._dom.find('.lh-crc__longest_transfersize', tmpl).textContent =
        Util.formateBytesToKB(details.longestChain.transferSize) + 'KB';

    const detailsEl = this._dom.find('.lh-details', tmpl);

    this._dom.find(':scope > summary', detailsEl).textContent = details.header.text;

    /**
     * Creates the DOM for a tree segment.
     * @param {!DetailsRenderer.CRCSegment} segment
     * @return {!Node}
     */
    const createChainNode = segment => {
      const chainsEl = this._dom.cloneTemplate('#tmpl-lh-crc__chains', tmpl);

      // Hovering over request shows full URL.
      this._dom.find('.crc-node', chainsEl).setAttribute('title', segment.node.request.url);

      const treeMarkeEl = this._dom.find('.crc-node__tree-marker', chainsEl);

      // Construct lines and add spacers for sub requests.
      segment.treeMarkers.forEach(separator => {
        if (separator) {
          treeMarkeEl.appendChild(this._dom.createElement('span', 'tree-marker vert'));
          treeMarkeEl.appendChild(this._dom.createElement('span', 'tree-marker space'));
        } else {
          treeMarkeEl.appendChild(this._dom.createElement('span', 'tree-marker space'));
          treeMarkeEl.appendChild(this._dom.createElement('span', 'tree-marker space'));
        }
      });

      if (segment.isLastChild) {
        treeMarkeEl.appendChild(this._dom.createElement('span', 'tree-marker up-right'));
        treeMarkeEl.appendChild(this._dom.createElement('span', 'tree-marker right'));
      } else {
        treeMarkeEl.appendChild(this._dom.createElement('span', 'tree-marker vert-right'));
        treeMarkeEl.appendChild(this._dom.createElement('span', 'tree-marker right'));
      }

      if (segment.hasChildren) {
        treeMarkeEl.appendChild(this._dom.createElement('span', 'tree-marker horiz-down'));
      } else {
        treeMarkeEl.appendChild(this._dom.createElement('span', 'tree-marker right'));
      }

      // Fill in url, host, and request size information.
      const {file, hostname} = Util.parseURL(segment.node.request.url);
      const treevalEl = this._dom.find('.crc-node__tree-value', chainsEl);
      this._dom.find('.crc-node__tree-file', treevalEl).textContent = `${file}`;
      this._dom.find('.crc-node__tree-hostname', treevalEl).textContent = `(${hostname})`;

      if (!segment.hasChildren) {
        const span = this._dom.createElement('span', 'crc-node__chain-duration');
        span.textContent = ' - ' + Util.chainDuration(
            segment.node.request.startTime, segment.node.request.endTime) + 'ms, ';
        const span2 = this._dom.createElement('span', 'crc-node__chain-duration');
        span2.textContent = Util.formateBytesToKB(details.longestChain.transferSize) + 'KB';

        treevalEl.appendChild(span);
        treevalEl.appendChild(span2);
      }

      return chainsEl;
    };

    /**
     * Recursively builds a tree from segments.
     * @param {!DetailsRenderer.CRCSegment} segment
     */
    function buildTree(segment) {
      detailsEl.appendChild(createChainNode(segment));

      for (const key of Object.keys(segment.node.children)) {
        const childSegment = createSegment(
            segment.node.children, key, segment.startTime, segment.transferSize,
            segment.treeMarkers, segment.isLastChild);
        buildTree(childSegment);
      }
    }

    const root = initTree(details.chains);

    for (const key of Object.keys(root.tree)) {
      const segment = createSegment(root.tree, key, root.startTime, root.transferSize);
      buildTree(segment);
    }

    return tmpl;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = DetailsRenderer;
} else {
  self.DetailsRenderer = DetailsRenderer;
}

/**
 * @typedef {{
 *     type: string,
 *     text: (string|undefined)
 * }}
 */
DetailsRenderer.DetailsJSON; // eslint-disable-line no-unused-expressions

/**
 * @typedef {{
 *     type: string,
 *     header: ({text: string}|undefined),
 *     items: !Array<{type: string, text: (string|undefined)}>
 * }}
 */
DetailsRenderer.ListDetailsJSON; // eslint-disable-line no-unused-expressions

/** @typedef {{
 *     type: string,
 *     header: ({text: string}|undefined),
 *     items: !Array<{title: string, value: string, snippet: (string|undefined), target: string}>
 * }}
 */
DetailsRenderer.CardsDetailsJSON; // eslint-disable-line no-unused-expressions

/**
 * @typedef {{
 *     type: string,
 *     itemType: (string|undefined),
 *     text: (string|undefined)
 * }}
 */
DetailsRenderer.TableHeaderJSON; // eslint-disable-line no-unused-expressions

/**
 * @typedef {{
 *     type: string,
 *     text: (string|undefined),
 *     path: (string|undefined),
 *     selector: (string|undefined),
 *     snippet:(string|undefined)
 * }}
 */
DetailsRenderer.NodeDetailsJSON; // eslint-disable-line no-unused-expressions

/** @typedef {{
 *     type: string,
 *     header: ({text: string}|undefined),
 *     items: !Array<!Array<!DetailsRenderer.DetailsJSON>>,
 *     itemHeaders: !Array<!DetailsRenderer.TableHeaderJSON>
 * }}
 */
DetailsRenderer.TableDetailsJSON; // eslint-disable-line no-unused-expressions

/** @typedef {{
 *     type: string,
 *     url: ({text: string}|undefined),
 *     mimeType: ({text: string}|undefined)
 * }}
 */
DetailsRenderer.ThumbnailDetails; // eslint-disable-line no-unused-expressions

/** @typedef {{
 *     type: string,
 *     header: ({text: string}|undefined),
 *     longestChain: {duration: number, length: number, transferSize: number},
 *     chains: !Object<string, !DetailsRenderer.CRCNode>
 * }}
 */
DetailsRenderer.CRCDetailsJSON; // eslint-disable-line no-unused-expressions

/** @typedef {{
 *     endTime: number,
 *     responseReceivedTime: number,
 *     startTime: number,
 *     transferSize: number,
 *     url: string
 * }}
 */
DetailsRenderer.CRCRequest; // eslint-disable-line no-unused-expressions

/**
 * Record type so children can circularly have CRCNode values.
 * @struct
 * @record
 */
DetailsRenderer.CRCNode = function() {};

/** @type {!Object<string, !DetailsRenderer.CRCNode>} */
DetailsRenderer.CRCNode.prototype.children; // eslint-disable-line no-unused-expressions

/** @type {!DetailsRenderer.CRCRequest} */
DetailsRenderer.CRCNode.prototype.request; // eslint-disable-line no-unused-expressions

/** @typedef {{
 *     node: !DetailsRenderer.CRCNode,
 *     isLastChild: boolean,
 *     hasChildren: boolean,
 *     startTime: number,
 *     transferSize: number,
 *     treeMarkers: !Array<boolean>
 * }}
 */
DetailsRenderer.CRCSegment; // eslint-disable-line no-unused-expressions
