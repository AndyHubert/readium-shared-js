//  LauncherOSX
//
//  Created by Boris Schneiderman.
//  Copyright (c) 2014 Readium Foundation and/or its licensees. All rights reserved.
//  
//  Redistribution and use in source and binary forms, with or without modification, 
//  are permitted provided that the following conditions are met:
//  1. Redistributions of source code must retain the above copyright notice, this 
//  list of conditions and the following disclaimer.
//  2. Redistributions in binary form must reproduce the above copyright notice, 
//  this list of conditions and the following disclaimer in the documentation and/or 
//  other materials provided with the distribution.
//  3. Neither the name of the organization nor the names of its contributors may be 
//  used to endorse or promote products derived from this software without specific 
//  prior written permission.
//  
//  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND 
//  ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED 
//  WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. 
//  IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, 
//  INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, 
//  BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, 
//  DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF 
//  LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE 
//  OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED 
//  OF THE POSSIBILITY OF SUCH DAMAGE.

/**
 * CFI navigation helper class
 *
 * @param options Additional settings for NavigationLogic object
 *      - paginationInfo            Layout details, used by clientRect-based geometry
 *      - visibleContentOffsets     Function that returns offsets. If supplied it is used instead of the inferred offsets
 *      - frameDimensions           Function that returns an object with width and height properties. Needs to be set.
 *      - $iframe                   Iframe reference, and needs to be set.
 * @constructor
 */
define(["jquery", "underscore", "../helpers", 'readium_cfi_js'], function($, _, Helpers, epubCfi) {

var CfiNavigationLogic = function(options) {

    var self = this;
    options = options || {};

    var debugMode = ReadiumSDK.DEBUG_MODE;

    this.getRootElement = function() {

        return options.$iframe[0].contentDocument.documentElement;
    };
    
    this.getBodyElement = function () {
        
        // In SVG documents the root element can be considered the body.
        return this.getRootDocument().body || this.getRootElement();
    };

    this.getRootDocument = function () {
        return options.$iframe[0].contentDocument;
    };

    function createRange() {
        return self.getRootDocument().createRange();
    }

    function createRangeFromNode(textnode) {
        var documentRange = createRange();
        documentRange.selectNodeContents(textnode);
        return documentRange;
    }

    function getNodeClientRect(node) {
        var range = createRange();
        range.selectNode(node);
        return normalizeRectangle(range.getBoundingClientRect(),0,0);
    }

    function getNodeContentsClientRect(node) {
        var range = createRange();
        range.selectNodeContents(node);
        return normalizeRectangle(range.getBoundingClientRect(),0,0);
    }

    function getElementClientRect($element) {
        return normalizeRectangle($element[0].getBoundingClientRect(),0,0);
    }

    function getNodeRangeClientRect(startNode, startOffset, endNode, endOffset) {
        var range = createRange();
        range.setStart(startNode, startOffset ? startOffset : 0);
        if (endNode.nodeType === Node.ELEMENT_NODE) {
            range.setEnd(endNode, endOffset ? endOffset : endNode.childNodes.length);
        } else if (endNode.nodeType === Node.TEXT_NODE) {
            range.setEnd(endNode, endOffset ? endOffset : 0);
        }
        return normalizeRectangle(range.getBoundingClientRect(),0,0);
    }

    function getNodeClientRectList(node, visibleContentOffsets) {
        visibleContentOffsets = visibleContentOffsets || getVisibleContentOffsets();
        
        var range = createRange();
        range.selectNode(node);
        return _.map(range.getClientRects(), function (rect) {
            return normalizeRectangle(rect, visibleContentOffsets.left, visibleContentOffsets.top);
        });
    }

    function getRangeClientRectList(range, visibleContentOffsets) {
        visibleContentOffsets = visibleContentOffsets || getVisibleContentOffsets();

        //noinspection JSUnresolvedFunction

        return _.map(range.getClientRects(), function (rect) {

            return normalizeRectangle(rect, visibleContentOffsets.left, visibleContentOffsets.top);
        });
    }

    function getFrameDimensions() {
        if (options.frameDimensions) {
            return options.frameDimensions();
        }
        
        console.error('CfiNavigationLogic: No frame dimensions specified!');
        return null;
    }

    function getCaretRangeFromPoint(x, y, document) {
        document = document || self.getRootDocument();
        Helpers.polyfillCaretRangeFromPoint(document); //only polyfills once, no-op afterwards
        return document.caretRangeFromPoint(x, y);
    }

    function isPaginatedView() {
        return !!options.paginationInfo;
    }

    /**
     * @private
     * Checks whether or not pages are rendered right-to-left
     *
     * @returns {boolean}
     */
    function isPageProgressionRightToLeft() {
        return options.paginationInfo && !!options.paginationInfo.rightToLeft;
    }

    /**
     * @private
     * Checks whether or not pages are rendered with vertical writing mode
     *
     * @returns {boolean}
     */
    function isVerticalWritingMode() {
        return options.paginationInfo && !!options.paginationInfo.isVerticalWritingMode;
    }


    /**
     * @private
     * Checks whether or not a (fully adjusted) rectangle is at least partly visible
     *
     * @param {Object} rect
     * @param {Object} [frameDimensions]
     * @param {boolean} [isVwm]           isVerticalWritingMode
     * @returns {boolean}
     */
    function isRectVisible(rect, ignorePartiallyVisible, frameDimensions, isVwm) {

        frameDimensions = frameDimensions || getFrameDimensions();
        isVwm = isVwm || isVerticalWritingMode();

        //Text nodes without printable text dont have client rectangles
        if (!rect) {
            return false;
        }
        //Sometimes we get client rects that are "empty" and aren't supposed to be visible
        if (rect.left == 0 && rect.right == 0 && rect.top == 0 && rect.bottom == 0) {
            return false;
        }

        if (isPaginatedView()) {
            return (rect.left >= 0 && rect.left < frameDimensions.width) || 
                (!ignorePartiallyVisible && rect.left < 0 && rect.right >= 0);
        } else {
            return (rect.top >= 0 && rect.top < frameDimensions.height) || 
                (!ignorePartiallyVisible && rect.top < 0 && rect.bottom >= 0);
        }

    }

    /**
     * @private
     * Retrieves _current_ full width of a column (including its gap)
     *
     * @returns {number} Full width of a column in pixels
     */
    function getColumnFullWidth() {

        if (!options.paginationInfo || isVerticalWritingMode())
        {
            return options.$iframe.width();
        }

        return options.paginationInfo.columnWidth + options.paginationInfo.columnGap;
    }

    /**
     * @private
     *
     * Retrieves _current_ offset of a viewport
     * (related to the beginning of the chapter)
     *
     * @returns {Object}
     */
    function getVisibleContentOffsets() {
        if (options.visibleContentOffsets) {
            return options.visibleContentOffsets();
        }

        if (isVerticalWritingMode()) {
            return {
                top: (options.paginationInfo ? options.paginationInfo.pageOffset : 0),
                left: 0
            };
        }

        return {
            top: 0,
            left: 0
        };
    }

    /**
     * New (rectangle-based) algorithm, useful in multi-column layouts
     *
     * Note: the second param (props) is ignored intentionally
     * (no need to use those in normalization)
     *
     * @param {jQuery} $element
     * @param {Object} _props
     * @param {boolean} shouldCalculateVisibilityPercentage
     * @param {Object} [frameDimensions]
     * @returns {number|null}
     *      0 for non-visible elements,
     *      0 < n <= 100 for visible elements
     *      (will just give 100, if `shouldCalculateVisibilityPercentage` => false)
     *      null for elements with display:none
     */
    function checkVisibilityByRectangles($element, shouldCalculateVisibilityPercentage, visibleContentOffsets, frameDimensions) {
        visibleContentOffsets = visibleContentOffsets || getVisibleContentOffsets();
        frameDimensions = frameDimensions || getFrameDimensions();

        var clientRectangles = getNormalizedRectangles($element, visibleContentOffsets);
        if (clientRectangles.length === 0) { // elements with display:none, etc.
            return null;
        }

        var visibilityPercentage = 0;

        if (clientRectangles.length === 1) {
            var adjustedRect = clientRectangles[0];
            
            if (isPaginatedView()) {
                if (adjustedRect.bottom > frameDimensions.height || adjustedRect.top < 0) {
                    // because of webkit inconsistency, that single rectangle should be adjusted
                    // until it hits the end OR will be based on the FIRST column that is visible
                    adjustRectangle(adjustedRect, true, frameDimensions);
                }
            }

            if (isRectVisible(adjustedRect, false, frameDimensions)) {
                //it might still be partially visible in webkit
                if (shouldCalculateVisibilityPercentage && adjustedRect.top < 0) {
                    visibilityPercentage =
                        Math.ceil(100 * (adjustedRect.height + adjustedRect.top) / adjustedRect.height);
                } else {
                    visibilityPercentage = 100;
                }
            }
        } else {
            // for an element split between several CSS columns,z
            // both Firefox and IE produce as many client rectangles;
            // each of those should be checked
            for (var i = 0, l = clientRectangles.length; i < l; ++i) {
                if (isRectVisible(clientRectangles[i], false, frameDimensions)) {
                    visibilityPercentage = shouldCalculateVisibilityPercentage
                        ? measureVisibilityPercentageByRectangles(clientRectangles, i)
                        : 100;
                    break;
                }
            }
        }

        return visibilityPercentage;
    }

    /**
     * Finds a page index (0-based) for a specific element.
     * Calculations are based on rectangles retrieved with getClientRects() method.
     *
     * @param {jQuery} $element
     * @param {number} spatialVerticalOffset
     * @returns {number|null}
     */
    function findPageByRectangles($element, spatialVerticalOffset) {

        var visibleContentOffsets = getVisibleContentOffsets();

        var clientRectangles = getNormalizedRectangles($element, visibleContentOffsets);
        if (clientRectangles.length === 0) { // elements with display:none, etc.
            return null;
        }

        return calculatePageIndexByRectangles(clientRectangles, spatialVerticalOffset);
    }

    /**
     * @private
     * Calculate a page index (0-based) for given client rectangles.
     *
     * @param {object} clientRectangles
     * @param {number} [spatialVerticalOffset]
     * @param {object} [frameDimensions]
     * @param {object} [columnFullWidth]
     * @returns {number|null}
     */
    function calculatePageIndexByRectangles(clientRectangles, spatialVerticalOffset, frameDimensions, columnFullWidth) {
        var isRtl = isPageProgressionRightToLeft();
        var isVwm = isVerticalWritingMode();
        columnFullWidth = columnFullWidth || getColumnFullWidth();
        frameDimensions = frameDimensions || getFrameDimensions();

        if (spatialVerticalOffset) {
            trimRectanglesByVertOffset(clientRectangles, spatialVerticalOffset,
                frameDimensions, columnFullWidth, isRtl, isVwm);
        }

        var firstRectangle = _.first(clientRectangles);
        if (clientRectangles.length === 1) {
            adjustRectangle(firstRectangle, false, frameDimensions, columnFullWidth, isRtl, isVwm);
        }

        var pageIndex;

        if (isVwm) {
            var topOffset = firstRectangle.top;
            pageIndex = Math.floor(topOffset / frameDimensions.height);
        } else {
            var leftOffset = firstRectangle.left;
            if (isRtl) {
                leftOffset = (columnFullWidth * (options.paginationInfo ? options.paginationInfo.visibleColumnCount : 1)) - leftOffset;
            }
            pageIndex = Math.floor(leftOffset / columnFullWidth);
        }

        if (pageIndex < 0) {
            pageIndex = 0;
        }
        else if (pageIndex >= (options.paginationInfo ? options.paginationInfo.columnCount : 1)) {
            pageIndex = (options.paginationInfo ? (options.paginationInfo.columnCount - 1) : 0);
        }

        return pageIndex;
    }

    /**
     * Finds a page index (0-based) for a specific client rectangle.
     * Calculations are based on viewport dimensions, offsets, and rectangle coordinates
     *
     * @param {ClientRect} clientRectangle
     * @param {Object} [visibleContentOffsets]
     * @param {Object} [frameDimensions]
     * @returns {number|null}
     */
    function findPageBySingleRectangle(clientRectangle, visibleContentOffsets, frameDimensions) {
        visibleContentOffsets = visibleContentOffsets || getVisibleContentOffsets();
        frameDimensions = frameDimensions || getFrameDimensions();
        
        var normalizedRectangle = normalizeRectangle(
            clientRectangle, visibleContentOffsets.left, visibleContentOffsets.top);

        return calculatePageIndexByRectangles([normalizedRectangle], frameDimensions);
    }

    /**
     * @private
     * Calculates the visibility offset percentage based on ClientRect dimensions
     *
     * @param {Array} clientRectangles (should already be normalized)
     * @param {number} firstVisibleRectIndex
     * @returns {number} - visibility percentage (0 < n <= 100)
     */
    function measureVisibilityPercentageByRectangles(clientRectangles, firstVisibleRectIndex) {

        var heightTotal = 0;
        var heightVisible = 0;

        if (clientRectangles.length > 1) {
            _.each(clientRectangles, function (rect, index) {
                heightTotal += rect.height;
                if (index >= firstVisibleRectIndex) {
                    // in this case, all the rectangles after the first visible
                    // should be counted as visible
                    heightVisible += rect.height;
                }
            });
        }
        else {
            // should already be normalized and adjusted
            heightTotal = clientRectangles[0].height;
            heightVisible = clientRectangles[0].height - Math.max(
                0, -clientRectangles[0].top);
        }
        return heightVisible === heightTotal
            ? 100 // trivial case: element is 100% visible
            : Math.ceil(100 * heightVisible / heightTotal);
    }

    /**
     * @private
     * Retrieves the position of $element in multi-column layout
     *
     * @param {jQuery} $el
     * @param {Object} [visibleContentOffsets]
     * @returns {Object}
     */
    function getNormalizedRectangles($el, visibleContentOffsets) {

        visibleContentOffsets = visibleContentOffsets || {};
        var leftOffset = visibleContentOffsets.left || 0;
        var topOffset = visibleContentOffsets.top || 0;

        var isTextNode = ($el[0].nodeType === Node.TEXT_NODE);
        var clientRectList;

        if (isTextNode) {
            var range = createRange();
            range.selectNode($el[0]);
            clientRectList = range.getClientRects();
        } else {
            clientRectList = $el[0].getClientRects();
        }

        // all the separate rectangles (for detecting position of the element
        // split between several columns)
        var clientRectangles = [];
        for (var i = 0, l = clientRectList.length; i < l; ++i) {
            if (clientRectList[i].height > 0 || clientRectList.length === 1) {
                // Firefox sometimes gets it wrong,
                // adding literally empty (height = 0) client rectangle preceding the real one,
                // that empty client rectanle shouldn't be retrieved
                clientRectangles.push(
                    normalizeRectangle(clientRectList[i], leftOffset, topOffset));
            }
        }

        return clientRectangles;
    }

    function getNormalizedBoundingRect($el, visibleContentOffsets) {
        visibleContentOffsets = visibleContentOffsets || {};
        var leftOffset = visibleContentOffsets.left || 0;
        var topOffset = visibleContentOffsets.top || 0;

        var isTextNode = ($el[0].nodeType === Node.TEXT_NODE);
        var boundingClientRect;

        if (isTextNode) {
            var range = createRange();
            range.selectNode($el[0]);
            boundingClientRect = range.getBoundingClientRect();
        } else {
            boundingClientRect = $el[0].getBoundingClientRect();
        }

        // union of all rectangles wrapping the element
        return normalizeRectangle(boundingClientRect, leftOffset, topOffset);
    }

    /**
     * @private
     * Converts TextRectangle object into a plain object,
     * taking content offsets (=scrolls, position shifts etc.) into account
     *
     * @param {TextRectangle} textRect
     * @param {number} leftOffset
     * @param {number} topOffset
     * @returns {Object}
     */
    function normalizeRectangle(textRect, leftOffset, topOffset) {

        var plainRectObject = {
            left: textRect.left,
            right: textRect.right,
            top: textRect.top,
            bottom: textRect.bottom,
            width: textRect.right - textRect.left,
            height: textRect.bottom - textRect.top
        };
        offsetRectangle(plainRectObject, leftOffset, topOffset);
        return plainRectObject;
    }

    /**
     * @private
     * Offsets plain object (which represents a TextRectangle).
     *
     * @param {Object} rect
     * @param {number} leftOffset
     * @param {number} topOffset
     */
    function offsetRectangle(rect, leftOffset, topOffset) {

        rect.left += leftOffset;
        rect.right += leftOffset;
        rect.top += topOffset;
        rect.bottom += topOffset;
    }

    /**
     * @private
     *
     * When element is spilled over two or more columns,
     * most of the time Webkit-based browsers
     * still assign a single clientRectangle to it, setting its `top` property to negative value
     * (so it looks like it's rendered based on the second column)
     * Alas, sometimes they decide to continue the leftmost column - from _below_ its real height.
     * In this case, `bottom` property is actually greater than element's height and had to be adjusted accordingly.
     *
     * Ugh.
     *
     * @param {Object} rect
     * @param {boolean} [shouldLookForFirstVisibleColumn]
     *      If set, there'll be two-phase adjustment
     *      (to align a rectangle with a viewport)
     * @param {Object} [frameDimensions]
     * @param {number} [columnFullWidth]
     * @param {boolean} [isRtl]
     * @param {boolean} [isVwm]               isVerticalWritingMode
     */
    function adjustRectangle(rect, shouldLookForFirstVisibleColumn, frameDimensions, columnFullWidth, isRtl, isVwm) {

        frameDimensions = frameDimensions || getFrameDimensions();
        columnFullWidth = columnFullWidth || getColumnFullWidth();
        isRtl = isRtl || isPageProgressionRightToLeft();
        isVwm = isVwm || isVerticalWritingMode();

        // Rectangle adjustment is not needed in VWM since it does not deal with columns
        if (isVwm) {
            return;
        }

        if (isRtl) {
            columnFullWidth *= -1; // horizontal shifts are reverted in RTL mode
        }

        // first we go left/right (rebasing onto the very first column available)
        while (rect.top < 0) {
            offsetRectangle(rect, -columnFullWidth, frameDimensions.height);
        }

        // ... then, if necessary (for visibility offset checks),
        // each column is tried again (now in reverse order)
        // the loop will be stopped when the column is aligned with a viewport
        // (i.e., is the first visible one).
        if (shouldLookForFirstVisibleColumn) {
            while (rect.bottom >= frameDimensions.height) {
                if (isRectVisible(rect, false, frameDimensions, isVwm)) {
                    break;
                }
                offsetRectangle(rect, columnFullWidth, -frameDimensions.height);
            }
        }
    }

    /**
     * @private
     * Trims the rectangle(s) representing the given element.
     *
     * @param {Array} rects
     * @param {number} verticalOffset
     * @param {number} frameDimensions
     * @param {number} columnFullWidth
     * @param {boolean} isRtl
     * @param {boolean} isVwm               isVerticalWritingMode
     */
    function trimRectanglesByVertOffset(
            rects, verticalOffset, frameDimensions, columnFullWidth, isRtl, isVwm) {

        frameDimensions = frameDimensions || getFrameDimensions();
        columnFullWidth = columnFullWidth || getColumnFullWidth();
        isRtl = isRtl || isPageProgressionRightToLeft();
        isVwm = isVwm || isVerticalWritingMode();

        //TODO: Support vertical writing mode
        if (isVwm) {
            return;
        }

        var totalHeight = _.reduce(rects, function(prev, cur) {
            return prev + cur.height;
        }, 0);

        var heightToHide = totalHeight * verticalOffset / 100;
        if (rects.length > 1) {
            var heightAccum = 0;
            do {
                heightAccum += rects[0].height;
                if (heightAccum > heightToHide) {
                    break;
                }
                rects.shift();
            } while (rects.length > 1);
        }
        else {
            // rebase to the last possible column
            // (so that adding to top will be properly processed later)
            if (isRtl) {
                columnFullWidth *= -1;
            }
            while (rects[0].bottom >= frameDimensions.height) {
                offsetRectangle(rects[0], columnFullWidth, -frameDimensions.height);
            }

            rects[0].top += heightToHide;
            rects[0].height -= heightToHide;
        }
    }

    this.getCfiForElement = function (element) {
        var cfi = EPUBcfi.Generator.generateElementCFIComponent(element,
            ["cfi-marker"],
            [],
            ["MathJax_Message", "MathJax_SVG_Hidden"]);

        if (cfi[0] == "!") {
            cfi = cfi.substring(1);
        }
        return cfi;
    };

    this.getVisibleCfiFromPoint = function (x, y, precisePoint) {
        var document = self.getRootDocument();
        var firstVisibleCaretRange = getCaretRangeFromPoint(x, y, document);
        var elementFromPoint = document.elementFromPoint(x, y);
        var invalidElementFromPoint = !elementFromPoint || elementFromPoint === document.documentElement;

        if (precisePoint) {
            if (!elementFromPoint || invalidElementFromPoint) {
                return null;
            }
            var testRect = getNodeContentsClientRect(elementFromPoint);
            if (!isRectVisible(testRect, false)) {
                return null;
            }
            if ((x < testRect.left || x > testRect.right) || (y < testRect.top || y > testRect.bottom)) {
                return null;
            }
        }

        if (!firstVisibleCaretRange) {
            if (invalidElementFromPoint) {
                console.error("Could not generate CFI no visible element on page");
                return null;
            }
            firstVisibleCaretRange = createRange();
            firstVisibleCaretRange.selectNode(elementFromPoint);
        }

        var range = firstVisibleCaretRange;
        var cfi;
        //if we get a text node we need to get an approximate range for the first visible character offsets.
        var node = range.startContainer;
        var startOffset, endOffset;
        if (node.nodeType === Node.TEXT_NODE) {
            if (precisePoint && node.parentNode !== elementFromPoint) {
                return null;
            }
            if (node.length === 1 && range.startOffset === 1) {
                startOffset = 0;
                endOffset = 1;
            } else if (range.startOffset === node.length) {
                startOffset = range.startOffset - 1;
                endOffset = range.startOffset;
            } else {
                startOffset = range.startOffset;
                endOffset = range.startOffset + 1;
            }
            var wrappedRange = {
                startContainer: node,
                endContainer: node,
                startOffset: startOffset,
                endOffset: endOffset,
                commonAncestorContainer: range.commonAncestorContainer
            };

            if (debugMode) {
                drawDebugOverlayFromDomRange(wrappedRange);
            }

            cfi = generateCfiFromDomRange(wrappedRange);
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            node =
                range.startContainer.childNodes[range.startOffset] ||
                range.startContainer.childNodes[0] ||
                range.startContainer;
            if (precisePoint && node !== elementFromPoint) {
                return null;
            }

            if (node.nodeType !== Node.ELEMENT_NODE) {
                cfi = generateCfiFromDomRange(range);
            } else {
                cfi = self.getCfiForElement(node);
            }
        } else {
            if (precisePoint && node !== elementFromPoint) {
                return null;
            }

            cfi = self.getCfiForElement(elementFromPoint);
        }

        //This should not happen but if it does print some output, just in case
        if (cfi && cfi.indexOf('NaN') !== -1) {
            console.log('Did not generate a valid CFI:' + cfi);
            return undefined;
        }

        return cfi;
    };

    this.getRangeCfiFromPoints = function(startX, startY, endX, endY) {
        var document = self.getRootDocument();
        var start = getCaretRangeFromPoint(startX, startY, document),
            end = getCaretRangeFromPoint(endX, endY, document),
            range = createRange();
        range.setStart(start.startContainer, start.startOffset);
        range.setEnd(end.startContainer, end.startOffset);
        // if we're looking at a text node create a nice range (n, n+1)
        if (start.startContainer === start.endContainer && start.startContainer.nodeType === Node.TEXT_NODE && end.startContainer.length > end.startOffset+1) {
            range.setEnd(end.startContainer, end.startOffset+1);
        }
        return generateCfiFromDomRange(range);
    };

    function getTextNodeRectCornerPairs(rect) {
        //
        //    top left             top right
        //    ╲                   ╱
        //  ── ▒T▒E▒X▒T▒ ▒R▒E▒C▒T▒ ──
        //
        // top left corner & top right corner
        // but for y coord use the mid point between top and bottom

        if (isVerticalWritingMode()) {
            var x = rect.right - (rect.width / 2);
            return [{x: x, y: rect.top}, {x: x, y: rect.bottom}];
        } else {
            var y = rect.top + (rect.height / 2);
            var result = [{x: rect.left, y: y}, {x: rect.right, y: y}]
            return isPageProgressionRightToLeft() ? result.reverse() : result;
        }
    }

    var DEBUG = false;

    function rectTopHash (rectList) {
        // sort the rectangles by top value
        var sortedList = rectList.sort(function (a, b) {
            return a.top < b.top;
        });
        var lineMap = [];
        _.each(sortedList, function (rect) {
            var key = rect.top;
            if (!lineMap[key]) {
                lineMap[key] = [rect.height];
            } else {
                var currentLine = lineMap[key];
                currentLine.push(rect.height);
                lineMap[key] = currentLine;
            }
        });
    }

    function calculateCumulativeHeight (rectList) {
        var lineMap = rectTopHash(rectList);
        var height = 0;
        _.each(lineMap, function (line) {
            height = height + Math.max.apply(null, line);
        });
        return height;
    }

    function getTextRangeOffset(startingSet, visibleContentOffsets, directionBit, splitRatio, filterFunc) {
        var runCount = 0;
        var currRange = startingSet;
        //begin iterative binary search, each iteration will check Range length and visibility
        while (currRange.length !== 1) {
            runCount++;
            var currTextNodeFragments = getRangeClientRectList(currRange[directionBit], visibleContentOffsets);
            if (hasVisibleFragments(currTextNodeFragments, filterFunc)) {
                currRange = splitRange(currRange[directionBit], splitRatio);
            }
            // No visible fragment Look in other half
            else {
                currRange = splitRange(currRange[directionBit ? 0 : 1], splitRatio);
            }
        }
        if (DEBUG) {
            console.debug('getVisibleTextRangeOffsets:getTextRangeOffset:runCount', runCount);
            window.top._DEBUG_visibleTextRangeOffsetsRuns.push(runCount);
        }
        var resultRange = currRange[0];
        if (resultRange) {
            // resultRange.collapse(!directionBit);
        }
        return resultRange;
    }

    function hasVisibleFragments(fragments, filterFunc) {
        var visibleFragments = _.filter(fragments, filterFunc);
        return !!visibleFragments.length;
    }

    function determineSplit(range, division) {
        var percent = division / 100;
        return Math.round((range.endOffset - range.startOffset ) * percent);
    }

    function splitRange(range, division) {
        if (range.endOffset - range.startOffset === 1) {
            return [range];
        }
        var length = determineSplit(range, division);
        var textNode = range.startContainer;
        var leftNodeRange = range.cloneRange();
        leftNodeRange.setStart(textNode, range.startOffset);
        leftNodeRange.setEnd(textNode, range.startOffset + length);
        var rightNodeRange = range.cloneRange();
        rightNodeRange.setStart(textNode, range.startOffset + length);
        rightNodeRange.setEnd(textNode, range.endOffset);

        return [leftNodeRange, rightNodeRange];

    }

    // create Range from target node and search for visibleOutput Range
    function getVisibleTextRangeOffsets(textNode, pickerFunc, visibleContentOffsets, frameDimensions) {
        visibleContentOffsets = visibleContentOffsets || getVisibleContentOffsets();

        var nodeRange = createRangeFromNode(textNode);
        var nodeClientRects = getRangeClientRectList(nodeRange, visibleContentOffsets);
        var splitRatio = deterministicSplit(nodeClientRects, pickerFunc([0, 1]));
        return getTextRangeOffset(splitRange(nodeRange, splitRatio), visibleContentOffsets,
            pickerFunc([0, 1]), splitRatio,
            function (rect) {
                return (isVerticalWritingMode() ? rect.height : rect.width) && isRectVisible(rect, false, frameDimensions);
            });
    }

    function deterministicSplit(rectList, directionBit) {
        var split = 0;
        // Calculate total cumulative Height for both visible portions and invisible portions and find the split
        var visibleRects = _.filter(rectList, function (rect) {
            return (isVerticalWritingMode() ? rect.height : rect.width) && isRectVisible(rect, false, getFrameDimensions());
        });
        var visibleRectHeight = calculateCumulativeHeight(visibleRects);
        var invisibleRectHeight = totalHeight - visibleRectHeight;
        var totalHeight = calculateCumulativeHeight(rectList);

        if (visibleRectHeight === totalHeight) {
            // either all visible or split
            // heuristic: slight bias to increase likelihood of hits
            return directionBit ? 55 : 45;
        } else {
            split = 100 * (visibleRectHeight / totalHeight);
            return invisibleRectHeight > visibleRectHeight ? split + 5 : split - 5;
        }
    }

    function findVisibleLeafNodeCfi(visibleLeafNode, pickerFunc, visibleContentOffsets, frameDimensions) {
        if (!visibleLeafNode) {
            return null;
        }

        var element = visibleLeafNode.element;
        var textNode = visibleLeafNode.textNode;

        //if a valid text node is found, try to generate a CFI with range offsets
        if (textNode && isValidTextNode(textNode)) {
            var visibleRange = getVisibleTextRangeOffsets(textNode, pickerFunc, visibleContentOffsets, frameDimensions);
            if (!visibleRange) {
                if (DEBUG) console.warn("findVisibleLeafNodeCfi: failed to find text range offset");
                return null;
            }
            return generateCfiFromDomRange(visibleRange);
        } else {
            //if not then generate a CFI for the element
            return self.getCfiForElement(element);
        }
    }

    // get an array of visible text elements and then select one based on the func supplied
    // and generate a CFI for the first visible text subrange.
    function getVisibleTextRangeCfiForTextElementSelectedByFunc(pickerFunc, visibleContentOffsets, frameDimensions) {        
        var visibleLeafNodeList = self.getVisibleLeafNodes(visibleContentOffsets, frameDimensions);
        return findVisibleLeafNodeCfi(visibleLeafNodeList, pickerFunc, null, visibleContentOffsets, frameDimensions);
    }

    function getLastVisibleTextRangeCfi(visibleContentOffsets, frameDimensions) {
        var visibleLeafNode = self.findLastVisibleElement(visibleContentOffsets, frameDimensions);
        return findVisibleLeafNodeCfi(visibleLeafNode, _.last, visibleContentOffsets, frameDimensions);
    }

    function getFirstVisibleTextRangeCfi(visibleContentOffsets, frameDimensions) {
        var visibleLeafNode = self.findFirstVisibleElement(visibleContentOffsets, frameDimensions);
        var a = findVisibleLeafNodeCfi(visibleLeafNode, _.first, visibleContentOffsets, frameDimensions);
        return findVisibleLeafNodeCfi(visibleLeafNode, _.first, visibleContentOffsets, frameDimensions);
    }

    this.getFirstVisibleCfi = function (visibleContentOffsets, frameDimensions) {
        return getFirstVisibleTextRangeCfi(visibleContentOffsets, frameDimensions);
    };

    this.getLastVisibleCfi = function (visibleContentOffsets, frameDimensions) {
        return getLastVisibleTextRangeCfi(visibleContentOffsets, frameDimensions);
    };

    function generateCfiFromDomRange(range) {
        return EPUBcfi.generateRangeComponent(
            range.startContainer, range.startOffset,
            range.endContainer, range.endOffset,
            ['cfi-marker'], [], ["MathJax_Message", "MathJax_SVG_Hidden"]);
    }

    function getRangeTargetNodes(rangeCfi) {
        return EPUBcfi.getRangeTargetElements(
            getWrappedCfiRelativeToContent(rangeCfi),
            self.getRootDocument(),
            ['cfi-marker'], [], ["MathJax_Message", "MathJax_SVG_Hidden"]);
    }

    this.getDomRangeFromRangeCfi = function(rangeCfi, rangeCfi2, inclusive) {
        var range = createRange();

        if (!rangeCfi2) {
            // biblemesh_ : "true ||" was added do avoid bug with annotation click.
            // It seems this function is only called throughout Readium to debug and 
            // for scroll view (which we do not support).
            if (true || self.isRangeCfi(rangeCfi)) {
                var rangeInfo = getRangeTargetNodes(rangeCfi);
                range.setStart(rangeInfo.startElement, rangeInfo.startOffset);
                range.setEnd(rangeInfo.endElement, rangeInfo.endOffset);
            } else {
                var element = self.getElementByCfi(rangeCfi,
                    ['cfi-marker'], [], ["MathJax_Message", "MathJax_SVG_Hidden"])[0];
                range.selectNode(element);
            }
        } else {
            if (self.isRangeCfi(rangeCfi)) {
                var rangeInfo1 = getRangeTargetNodes(rangeCfi);
                range.setStart(rangeInfo1.startElement, rangeInfo1.startOffset);
            } else {
                var startElement = self.getElementByCfi(rangeCfi,
                    ['cfi-marker'], [], ["MathJax_Message", "MathJax_SVG_Hidden"])[0];
                range.setStart(startElement, 0);
            }

            if (self.isRangeCfi(rangeCfi2)) {
                var rangeInfo2 = getRangeTargetNodes(rangeCfi2);
                if (inclusive) {
                    range.setEnd(rangeInfo2.endElement, rangeInfo2.endOffset);
                } else {
                    range.setEnd(rangeInfo2.startElement, rangeInfo2.startOffset);
                }
            } else {
                var endElement = self.getElementByCfi(rangeCfi2,
                    ['cfi-marker'], [], ["MathJax_Message", "MathJax_SVG_Hidden"])[0];
                range.setEnd(endElement, endElement.childNodes.length);
            }
        }
        return range;
    };

    this.getRangeCfiFromDomRange = function(domRange) {
        return generateCfiFromDomRange(domRange);
    };

    function getWrappedCfi(partialCfi) {
        return "epubcfi(" + partialCfi + ")";
    }

    function getWrappedCfiRelativeToContent(partialCfi) {
        return "epubcfi(/99!" + partialCfi + ")";
    }

    this.isRangeCfi = function (partialCfi) {
        return EPUBcfi.Interpreter.isRangeCfi(getWrappedCfi(partialCfi)) || EPUBcfi.Interpreter.isRangeCfi(getWrappedCfiRelativeToContent(partialCfi));
    };

    this.getPageForElementCfi = function (cfi, classBlacklist, elementBlacklist, idBlacklist) {

        var cfiParts = splitCfi(cfi);
        var partialCfi = cfiParts.cfi;

        if (this.isRangeCfi(partialCfi)) {
            //if given a range cfi the exact page index needs to be calculated by getting node info from the range cfi
            var nodeRangeInfoFromCfi = this.getNodeRangeInfoFromCfi(partialCfi);
            //the page index is calculated from the node's client rectangle
            return findPageBySingleRectangle(nodeRangeInfoFromCfi.clientRect);
        }

        var $element = getElementByPartialCfi(cfiParts.cfi, classBlacklist, elementBlacklist, idBlacklist);

        if (!$element) {
            return -1;
        }

        var pageIndex = this.getPageForPointOnElement($element, cfiParts.x, cfiParts.y);

        return pageIndex;

    };

    function getElementByPartialCfi(cfi, classBlacklist, elementBlacklist, idBlacklist) {

        var contentDoc = self.getRootDocument();

        var wrappedCfi = getWrappedCfi(cfi);

        try {
            //noinspection JSUnresolvedVariable
            var $element = EPUBcfi.getTargetElementWithPartialCFI(wrappedCfi, contentDoc, classBlacklist, elementBlacklist, idBlacklist);

        } catch (ex) {
            //EPUBcfi.Interpreter can throw a SyntaxError
        }

        if (!$element || $element.length == 0) {
            console.log("Can't find element for CFI: " + cfi);
            return undefined;
        }

        return $element;
    }

    this.getElementFromPoint = function (x, y) {

        var document = self.getRootDocument();
        return document.elementFromPoint(x, y);
    };

    this.getNodeRangeInfoFromCfi = function (cfi) {
        var contentDoc = self.getRootDocument();
        if (self.isRangeCfi(cfi)) {
            var wrappedCfi = getWrappedCfiRelativeToContent(cfi);

            try {
                //noinspection JSUnresolvedVariable
                var nodeResult = EPUBcfi.Interpreter.getRangeTargetElements(wrappedCfi, contentDoc,
                    ["cfi-marker"],
                    [],
                    ["MathJax_Message", "MathJax_SVG_Hidden"]);

                if (debugMode) {
                    console.log(nodeResult);
                }
            } catch (ex) {
                //EPUBcfi.Interpreter can throw a SyntaxError
            }

            if (!nodeResult) {
                console.log("Can't find nodes for range CFI: " + cfi);
                return undefined;
            }

            var startRangeInfo = {node: nodeResult.startElement, offset: nodeResult.startOffset};
            var endRangeInfo = {node: nodeResult.endElement, offset: nodeResult.endOffset};
            var nodeRangeClientRect =
                startRangeInfo && endRangeInfo ?
                    getNodeRangeClientRect(
                        startRangeInfo.node,
                        startRangeInfo.offset,
                        endRangeInfo.node,
                        endRangeInfo.offset)
                    : null;

            if (debugMode) {
                console.log(nodeRangeClientRect);
                addOverlayRect(nodeRangeClientRect, 'purple', contentDoc);
            }

            return {startInfo: startRangeInfo, endInfo: endRangeInfo, clientRect: nodeRangeClientRect}
        } else {
            var $element = self.getElementByCfi(cfi,
                ["cfi-marker"],
                [],
                ["MathJax_Message", "MathJax_SVG_Hidden"]);

            var visibleContentOffsets = getVisibleContentOffsets();
            return {startInfo: null, endInfo: null, clientRect: getNormalizedBoundingRect($element, visibleContentOffsets)};
        }
    };

    this.isNodeFromRangeCfiVisible = function (cfi) {
        var nodeRangeInfo = this.getNodeRangeInfoFromCfi(cfi);
        if (nodeRangeInfo) {
            return isRectVisible(nodeRangeInfo.clientRect, false);
        } else {
            return undefined;
        }
    };

    this.getNearestCfiFromElement = function (element) {
        var collapseToStart;
        var chosenNode;
        var isTextNode;

        var siblingTextNodesAndSelf = _.filter(element.parentNode.childNodes, function (n) {
            return n === element || isValidTextNode(n);
        });

        var indexOfSelf = siblingTextNodesAndSelf.indexOf(element);
        var nearestNode = siblingTextNodesAndSelf[indexOfSelf - 1];
        if (!nearestNode) {
            nearestNode = siblingTextNodesAndSelf[indexOfSelf + 1];
            collapseToStart = true;
        }
        if (!nearestNode) {
            nearestNode = _.last(this.getLeafNodeElements($(element.previousElementSibling)));
            if (!nearestNode) {
                collapseToStart = true;
                nearestNode = _.first(this.getLeafNodeElements($(element.nextElementSibling)));
            }
        }

        // Prioritize text node use
        if (isValidTextNode(nearestNode)) {
            chosenNode = nearestNode;
            isTextNode = true;
        } else if (isElementNode(nearestNode)) {
            chosenNode = nearestNode;
        } else if (isElementNode(element.previousElementSibling)) {
            chosenNode = element.previousElementSibling;
        } else if (isElementNode(element.nextElementSibling)) {
            chosenNode = element.nextElementSibling;
        } else {
            chosenNode = element.parentNode;
        }

        if (isTextNode) {
            var range = chosenNode.ownerDocument.createRange();
            range.selectNodeContents(chosenNode);
            range.collapse(collapseToStart);
            return this.getRangeCfiFromDomRange(range);
        } else {
            return this.getCfiForElement(chosenNode);
        }
    };

    this.getElementByCfi = function (cfi, classBlacklist, elementBlacklist, idBlacklist) {

        var cfiParts = splitCfi(cfi);
        return getElementByPartialCfi(cfiParts.cfi, classBlacklist, elementBlacklist, idBlacklist);
    };

    this.getPageForElement = function ($element) {

        return this.getPageForPointOnElement($element, 0, 0);
    };

    this.getPageForPointOnElement = function ($element, x, y) {

        var pageIndex = findPageByRectangles($element, y);
        if (pageIndex === null) {
            // get CFI of the nearest (to hidden) element, and then get CFI's element
            var nearestVisibleElement = this.getElementByCfi(this.getNearestCfiFromElement($element[0]));

            // find page index by rectangles again, for the nearest element
            return findPageByRectangles(nearestVisibleElement, y);
        }
        return pageIndex;
    };

    this.getVerticalOffsetForElement = function ($element) {
      return this.getVerticalOffsetForPointOnElement($element, 0, 0);
    };

    this.getVerticalOffsetForPointOnElement = function ($element, x, y) {
      var elementRect = Helpers.Rect.fromElement($element);
      return Math.ceil(elementRect.top + y * elementRect.height / 100);
    };

    this.getElementById = function (id) {

        var contentDoc = this.getRootDocument();

        var $element = $(contentDoc.getElementById(id));
        //$("#" + Helpers.escapeJQuerySelector(id), contentDoc);

        if($element.length == 0) {
            return undefined;
        }

        return $element;
    };

    this.getPageForElementId = function (id) {

        var $element = this.getElementById(id);
        if (!$element) {
            return -1;
        }

        return this.getPageForElement($element);
    };

    function splitCfi(cfi) {

        var ret = {
            cfi: "",
            x: 0,
            y: 0
        };

        var ix = cfi.indexOf("@");

        if (ix != -1) {
            var terminus = cfi.substring(ix + 1);

            var colIx = terminus.indexOf(":");
            if (colIx != -1) {
                ret.x = parseInt(terminus.substr(0, colIx));
                ret.y = parseInt(terminus.substr(colIx + 1));
            }
            else {
                console.log("Unexpected terminating step format");
            }

            ret.cfi = cfi.substring(0, ix);
        }
        else {

            ret.cfi = cfi;
        }

        return ret;
    }

    // returns raw DOM element (not $ jQuery-wrapped)
    this.getFirstVisibleMediaOverlayElement = function(visibleContentOffsets) {
        var $root = $(this.getBodyElement());
        if (!$root || !$root.length || !$root[0]) return undefined;

        var that = this;

        var firstPartial = undefined;

        function traverseArray(arr) {
            if (!arr || !arr.length) return undefined;

            for (var i = 0, count = arr.length; i < count; i++) {
                var item = arr[i];
                if (!item) continue;

                var $item = $(item);

                if ($item.data("mediaOverlayData")) {
                    var visible = that.getElementVisibility($item, visibleContentOffsets);
                    if (visible) {
                        if (!firstPartial) firstPartial = item;

                        if (visible == 100) return item;
                    }
                }
                else {
                    var elem = traverseArray(item.children);
                    if (elem) return elem;
                }
            }

            return undefined;
        }

        var el = traverseArray([$root[0]]);
        if (!el) el = firstPartial;
        return el;

        // var $elements = this.getMediaOverlayElements($root);
        // return this.getVisibleElements($elements, visibleContentOffsets);
    };

    this.getElementVisibility = function ($element, visibleContentOffsets) {
        return checkVisibilityByRectangles($element, true, visibleContentOffsets);
    };


    this.isElementVisible = checkVisibilityByRectangles;

    this.getVisibleElementsWithFilter = function (visibleContentOffsets, filterFunction) {
        var $elements = this.getElementsWithFilter($(this.getBodyElement()), filterFunction);
        return this.getVisibleElements($elements, visibleContentOffsets);
    };

    this.getAllElementsWithFilter = function (filterFunction) {
        var $elements = this.getElementsWithFilter($(this.getBodyElement()), filterFunction);
        return $elements;
    };

    this.getAllVisibleElementsWithSelector = function (selector, visibleContentOffset) {
        var elements = $(selector, this.getRootElement());
        var $newElements = [];
        $.each(elements, function () {
            $newElements.push($(this));
        });
        var visibleElements = this.getVisibleElements($newElements, visibleContentOffset);
        return visibleElements;
    };

    this.getVisibleElements = function ($elements, visibleContentOffsets, frameDimensions) {

        var visibleElements = [];

        _.each($elements, function ($node) {
            var isTextNode = ($node[0].nodeType === Node.TEXT_NODE);
            var $element = isTextNode ? $node.parent() : $node;
            var visibilityPercentage = checkVisibilityByRectangles(
                $node, true, visibleContentOffsets, frameDimensions);

            if (visibilityPercentage) {
                visibleElements.push({
                    element: $element[0], // DOM Element is pushed
                    textNode: isTextNode ? $node[0] : null,
                    percentVisible: visibilityPercentage
                });
            }
        });

        return visibleElements;
    };

    this.getVisibleLeafNodes = function (visibleContentOffsets, frameDimensions) {

        if (_cacheEnabled) {
            var cacheKey = (options.paginationInfo || {}).currentSpreadIndex || 0;
            var fromCache = _cache.visibleLeafNodes.get(cacheKey);
            if (fromCache) {
                return fromCache;
            }
        }

        var $elements = this.getLeafNodeElements($(this.getBodyElement()));

        var visibleElements = this.getVisibleElements($elements, visibleContentOffsets, frameDimensions);

        if (_cacheEnabled) {
            _cache.visibleLeafNodes.set(cacheKey, visibleElements);
        }

        return visibleElements;
    };

    this.getElementsWithFilter = function ($root, filterFunction) {

        var $elements = [];

        function traverseCollection(elements) {

            if (elements == undefined) return;

            for (var i = 0, count = elements.length; i < count; i++) {

                var $element = $(elements[i]);

                if (filterFunction($element)) {
                    $elements.push($element);
                }
                else {
                    traverseCollection($element[0].children);
                }

            }
        }

        traverseCollection([$root[0]]);

        return $elements;
    };

    function isElementBlacklisted($element) {
        //TODO: Ok we really need to have a single point of reference for this blacklist
        var blacklist = {
            classes: ["cfi-marker", "mo-cfi-highlight"],
            elements: [], //not looked at
            ids: ["MathJax_Message", "MathJax_SVG_Hidden"]
        };

        var isBlacklisted = false;

        _.some(blacklist.classes, function (value) {
            if ($element.hasClass(value)) {
                isBlacklisted = true;
            }
            return isBlacklisted;
        });

        _.some(blacklist.ids, function (value) {
            if ($element.attr("id") === value) {
                isBlacklisted = true;
            }
            return isBlacklisted;
        });


        return isBlacklisted;
    }

    this.getLeafNodeElements = function ($root) {

        if (_cacheEnabled) {
            var fromCache = _cache.leafNodeElements.get($root);
            if (fromCache) {
                return fromCache;
            }
        }

        var nodeIterator = document.createNodeIterator(
            $root[0],
            NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
            function() {
                return NodeFilter.FILTER_ACCEPT;
            },
            false
        );

        var $leafNodeElements = [];

        var node;
        while ((node = nodeIterator.nextNode())) {
            var isLeafNode = node.nodeType === Node.ELEMENT_NODE && !node.childElementCount && !isValidTextNodeContent(node.textContent);
            if (isLeafNode || isValidTextNode(node)){
                var $node = $(node);
                var $element = (node.nodeType === Node.TEXT_NODE) ? $node.parent() : $node;
                if (!isElementBlacklisted($element)) {
                    $leafNodeElements.push($node);
                }
            }
        }

        if (_cacheEnabled) {
            _cache.leafNodeElements.set($root, $leafNodeElements);
        }

        return $leafNodeElements;
    };

    function isElementNode(node) {
        if (!node) {
            return false;
        }
        else {
            return node.nodeType === Node.ELEMENT_NODE;
        }
    }

    function isValidTextNode(node) {

        if (node.nodeType === Node.TEXT_NODE) {

            return isValidTextNodeContent(node.nodeValue);
        }

        return false;

    }

    function isValidTextNodeContent(text) {
        // Heuristic to find a text node with actual text
        // If we don't do this, we may get a reference to a node that doesn't get rendered
        // (such as for example a node that has tab character and a bunch of spaces)
        // this is would be bad! ask me why.
        return text.replace(/[\s\n\r\t]/g, "").length > 0;
    }

    this.getElements = function (selector) {
        if (!selector) {
            return $(this.getRootElement()).children();
        }
        return $(selector, this.getRootElement());
    };

    this.getElement = function (selector) {

        var $element = this.getElements(selector);

        if($element.length > 0) {
            return $element;
        }

        return undefined;
    };

    function Cache() {
        var that = this;

        //true = survives invalidation
        var props = {
            leafNodeElements: true,
            visibleLeafNodes: false
        };

        _.each(props, function (val, key) {
            that[key] = new Map();
        });

        this._invalidate = function () {
            _.each(props, function (val, key) {
                if (!val) {
                    that[key] = new Map();
                }
            });
        }
    }

    var _cache = new Cache();

    var _cacheEnabled = false;

    this.invalidateCache = function () {
        _cache._invalidate();
    };


    // dmitry debug
    // dmitry debug
    // dmitry debug
    // dmitry debug
    // dmitry debug
    // dmitry debug

    var parseContentCfi = function(cont) {
        return cont.replace(/\[(.*?)\]/, "").split(/[\/,:]/).map(function(n) { return parseInt(n); }).filter(Boolean);
    };

    var contentCfiComparator = function(cont1, cont2) {
        cont1 = this.parseContentCfi(cont1);
        cont2 = this.parseContentCfi(cont2);

        //compare cont arrays looking for differences
        for (var i=0; i<cont1.length; i++) {
            if (cont1[i] > cont2[i]) {
                return 1;
            }
            else if (cont1[i] < cont2[i]) {
                return -1;
            }
        }

        //no differences found, so confirm that cont2 did not have values we didn't check
        if (cont1.length < cont2.length) {
            return -1;
        }

        //cont arrays are identical
        return 0;
    };


    // end dmitry debug

    //if (debugMode) {

        var $debugOverlays = [];

        //used for visual debug atm
        function getRandomColor() {
            var letters = '0123456789ABCDEF'.split('');
            var color = '#';
            for (var i = 0; i < 6; i++) {
                color += letters[Math.round(Math.random() * 15)];
            }
            return color;
        }

        //used for visual debug atm
        function addOverlayRect(rects, color, doc) {
            var random = getRandomColor();
            if (!(rects instanceof Array)) {
                rects = [rects];
            }
            for (var i = 0; i != rects.length; i++) {
                var rect = rects[i];
                var overlayDiv = doc.createElement('div');
                overlayDiv.style.position = 'absolute';
                $(overlayDiv).css('z-index', '1000');
                $(overlayDiv).css('pointer-events', 'none');
                $(overlayDiv).css('opacity', '0.4');
                overlayDiv.style.border = '1px solid white';
                if (!color && !random) {
                    overlayDiv.style.background = 'purple';
                } else if (random && !color) {
                    overlayDiv.style.background = random;
                } else {
                    if (color === true) {
                        color = 'red';
                    }
                    overlayDiv.style.border = '1px dashed ' + color;
                    overlayDiv.style.background = 'yellow';
                }

                overlayDiv.style.margin = overlayDiv.style.padding = '0';
                overlayDiv.style.top = (rect.top ) + 'px';
                overlayDiv.style.left = (rect.left ) + 'px';
                // we want rect.width to be the border width, so content width is 2px less.
                overlayDiv.style.width = (rect.width - 2) + 'px';
                overlayDiv.style.height = (rect.height - 2) + 'px';
                doc.documentElement.appendChild(overlayDiv);
                $debugOverlays.push($(overlayDiv));
            }
        }

        function drawDebugOverlayFromRect(rect) {
            var leftOffset, topOffset;

            if (isVerticalWritingMode()) {
                leftOffset = 0;
                topOffset = -getPaginationLeftOffset();
            } else {
                leftOffset = -getPaginationLeftOffset();
                topOffset = 0;
            }

            addOverlayRect({
                left: rect.left + leftOffset,
                top: rect.top + topOffset,
                width: rect.width,
                height: rect.height
            }, true, self.getRootDocument());
        }

        function drawDebugOverlayFromDomRange(range) {
            var rect = getNodeRangeClientRect(
                range.startContainer,
                range.startOffset,
                range.endContainer,
                range.endOffset);
            drawDebugOverlayFromRect(rect);
            return rect;
        }

        function drawDebugOverlayFromNode(node) {
            drawDebugOverlayFromRect(getNodeClientRect(node));
        }

        function getPaginationLeftOffset() {

            var $htmlElement = $("html", self.getRootDocument());
            var offsetLeftPixels = $htmlElement.css(isVerticalWritingMode() ? "top" : (isPageProgressionRightToLeft() ? "right" : "left"));
            var offsetLeft = parseInt(offsetLeftPixels.replace("px", ""));
            if (isNaN(offsetLeft)) {
                //for fixed layouts, $htmlElement.css("left") has no numerical value
                offsetLeft = 0;
            }
            if (isPageProgressionRightToLeft() && !isVerticalWritingMode()) return -offsetLeft; 
            return offsetLeft;
        }

        function clearDebugOverlays() {
            _.each($debugOverlays, function($el){
                $el.remove();
            });
            $debugOverlays.clear();
        }

        ReadiumSDK._DEBUG_CfiNavigationLogic = {
            clearDebugOverlays: clearDebugOverlays,
            drawDebugOverlayFromRect: drawDebugOverlayFromRect,
            drawDebugOverlayFromDomRange: drawDebugOverlayFromDomRange,
            drawDebugOverlayFromNode: drawDebugOverlayFromNode,
            debugVisibleCfis: function () {
                console.log(JSON.stringify(ReadiumSDK.reader.getPaginationInfo().openPages));

                var cfi1 = ReadiumSDK.reader.getFirstVisibleCfi();
                var range1 = ReadiumSDK.reader.getDomRangeFromRangeCfi(cfi1);
                console.log(cfi1, range1, drawDebugOverlayFromDomRange(range1));

                var cfi2 = ReadiumSDK.reader.getLastVisibleCfi();
                var range2 = ReadiumSDK.reader.getDomRangeFromRangeCfi(cfi2);
                console.log(cfi2, range2, drawDebugOverlayFromDomRange(range2));
            }
        };

        //
   // }


    this.findFirstVisibleElement = function (visibleContentOffsets, frameDimensions) {

        var firstVisibleElement;
        var percentVisible = 0;
        var textNode;

        var treeWalker = document.createTreeWalker(
            this.getBodyElement(),
            NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
            function(node) {
                if (node.nodeType === Node.ELEMENT_NODE && isElementBlacklisted($(node)))
                    return NodeFilter.FILTER_REJECT;

                if (node.nodeType === Node.TEXT_NODE && !isValidTextNode(node))
                    return NodeFilter.FILTER_REJECT;

                var visibilityResult = checkVisibilityByRectangles($(node), true, visibleContentOffsets, frameDimensions);
                return visibilityResult ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
            },
            false
            );

        while (treeWalker.nextNode()) {
            var node = treeWalker.currentNode;

            if (node.nodeType === Node.TEXT_NODE) {
                firstVisibleElement = node.parentNode;
                textNode = node;
                percentVisible = 100; // not really used, assume this value unless otherwise
                break;
            }

            var hasChildElements = false;
            var hasChildTextNodes = false;

            for (var i = node.childNodes.length - 1; i >= 0; i--) {
                var childNode = node.childNodes[i];
                if (childNode.nodeType === Node.ELEMENT_NODE) {
                    hasChildElements = true;
                    break;
                }
                if (childNode.nodeType === Node.TEXT_NODE)
                    hasChildTextNodes = true;
            }

            // potentially stop tree traversal when first element hit with no child element nodes
            if (!hasChildElements && hasChildTextNodes) {
                for (var i=node.childNodes.length-1; i>=0; i--) {
                    var childNode = node.childNodes[i];
                    if (childNode.nodeType === Node.TEXT_NODE && isValidTextNode(childNode)) {
                        var visibilityResult = checkVisibilityByRectangles($(childNode), true, visibleContentOffsets, frameDimensions);
                        if (visibilityResult) {
                            firstVisibleElement = node;
                            textNode = childNode;
                            percentVisible = visibilityResult;
                            break;
                        }
                    }
                }
            } else if (!hasChildElements) {
                firstVisibleElement = node;
                percentVisible = 100;
                textNode = null;
                break;
            }
        }

        if (!firstVisibleElement) {
            return null;
        }
        return {
            element: firstVisibleElement,
            textNode: textNode,
            percentVisible: percentVisible
        };
    };

    this.findLastVisibleElement = function (visibleContentOffsets, frameDimensions) {

        var firstVisibleElement;
        var percentVisible = 0;
        var textNode;

        var treeWalker = document.createTreeWalker(
            this.getBodyElement(),
            NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
            function(node) {
                if (node.nodeType === Node.ELEMENT_NODE && isElementBlacklisted($(node)))
                    return NodeFilter.FILTER_REJECT;

                if (node.nodeType === Node.TEXT_NODE && !isValidTextNode(node))
                    return NodeFilter.FILTER_REJECT;

                var visibilityResult = checkVisibilityByRectangles($(node), true, visibleContentOffsets, frameDimensions);
                return visibilityResult ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
            },
            false
            );

        while (treeWalker.lastChild()) { }

        do {
            var node = treeWalker.currentNode;

            if (node.nodeType === Node.TEXT_NODE) {
                firstVisibleElement = node.parentNode;
                textNode = node;
                percentVisible = 100; // not really used, assume this value unless otherwise
                break;
            }

            var hasChildElements = false;
            var hasChildTextNodes = false;

            for (var i = node.childNodes.length - 1; i >= 0; i--) {
                var childNode = node.childNodes[i];
                if (childNode.nodeType === Node.ELEMENT_NODE) {
                    hasChildElements = true;
                    break;
                }
                if (childNode.nodeType === Node.TEXT_NODE)
                    hasChildTextNodes = true;
            }

            // potentially stop tree traversal when first element hit with no child element nodes
            if (!hasChildElements && hasChildTextNodes) {
                for (var i=node.childNodes.length-1; i>=0; i--) {
                    var childNode = node.childNodes[i];
                    if (childNode.nodeType === Node.TEXT_NODE && isValidTextNode(childNode)) {
                        var visibilityResult = checkVisibilityByRectangles($(childNode), true, visibleContentOffsets, frameDimensions);
                        if (visibilityResult) {
                            firstVisibleElement = node;
                            textNode = childNode;
                            percentVisible = visibilityResult;
                            break;
                        }
                    }
                }
            } else if (!hasChildElements) {
                firstVisibleElement = node;
                percentVisible = 100;
                textNode = null;
                break;
            }
        } while (treeWalker.previousNode());

        if (!firstVisibleElement) {
            return null;
        }
        return {
            element: firstVisibleElement,
            textNode: textNode,
            percentVisible: percentVisible
        };
    };




};
return CfiNavigationLogic;
});
