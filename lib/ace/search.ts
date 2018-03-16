/* ***** BEGIN LICENSE BLOCK *****
 * Distributed under the BSD license:
 *
 * Copyright (c) 2010, Ajax.org B.V.
 * All rights reserved.
 * 
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *     * Redistributions of source code must retain the above copyright
 *       notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above copyright
 *       notice, this list of conditions and the following disclaimer in the
 *       documentation and/or other materials provided with the distribution.
 *     * Neither the name of Ajax.org B.V. nor the
 *       names of its contributors may be used to endorse or promote products
 *       derived from this software without specific prior written permission.
 * 
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL AJAX.ORG B.V. BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 * ***** END LICENSE BLOCK ***** */

import lang = require("./lib/lang");
import oop = require("./lib/oop");
import { Range } from "./range";
import { EditSession } from "./edit_session";

/**
 * @class Search
 *
 * A class designed to handle all sorts of text searches within a [[Document `Document`]].
 *
 **/

/**
 * 
 *
 * Creates a new `Search` object. The following search options are available:
 *
 * - `needle`: The string or regular expression you're looking for
 * - `backwards`: Whether to search backwards from where cursor currently is. Defaults to `false`.
 * - `wrap`: Whether to wrap the search back to the beginning when it hits the end. Defaults to `false`.
 * - `caseSensitive`: Whether the search ought to be case-sensitive. Defaults to `false`.
 * - `wholeWord`: Whether the search matches only on whole words. Defaults to `false`.
 * - `range`: The [[Range]] to search within. Set this to `null` for the whole document
 * - `regExp`: Whether the search is a regular expression or not. Defaults to `false`.
 * - `start`: The starting [[Range]] or cursor position to begin the search
 * - `skipCurrent`: Whether or not to include the current line in the search. Default to `false`.
 * 
 * @constructor
 **/

type IteratorCallback = (sr: number, sc: number, er: number, ec: number) => void;

export class Search {
    
    $options: any;
    
    constructor() {
        this.$options = {};
    }

    /**
     * Sets the search options via the `options` parameter.
     * @param {Object} options An object containing all the new search properties
     *
     * 
     * @returns {Search}
     * @chainable
    **/
    set(options: any) {
        oop.mixin(this.$options, options);
        return this;
    };

    /**
     * [Returns an object containing all the search options.]{: #Search.getOptions}
     * @returns {Object}
    **/
    getOptions() {
        return lang.copyObject(this.$options);
    };
    
    /**
     * Sets the search options via the `options` parameter.
     * @param {Object} An object containing all the search propertie
     * @related Search.set
    **/
    setOptions(options: any) {
        this.$options = options;
    };
    /**
     * Searches for `options.needle`. If found, this method returns the [[Range `Range`]] where the text first occurs. If `options.backwards` is `true`, the search goes backwards in the session.
     * @param {EditSession} session The session to search with
     *
     * 
     * @returns {Range}
    **/
    find(session: EditSession): Range | null {
        var options = this.$options;
        var iterator = this.$matchIterator(session, options);
        if (!iterator)
            return null;

        var firstRange = null;
        iterator.forEach(function(sr, sc, er, ec) {
            firstRange = new Range(sr, sc, er, ec);
            if (sc == ec && options.start && options.start.start
                && options.skipCurrent != false && firstRange.isEqual(options.start)
            ) {
                firstRange = null;
                return false;
            }
            
            return true;
        });

        return firstRange;
    };

    /**
     * Searches for all occurrances `options.needle`. If found, this method returns an array of [[Range `Range`s]] where the text first occurs. If `options.backwards` is `true`, the search goes backwards in the session.
     * @param {EditSession} session The session to search with
     *
     * 
     * @returns {[Range]}
    **/
    findAll(session: EditSession): Range[] {
        var options = this.$options;
        if (!options.needle)
            return [];
        this.$assembleRegExp(options);

        var range = options.range;
        var lines = range
            ? session.getLines(range.start.row, range.end.row)
            : session.doc.getAllLines();

        var ranges = [];
        var re = options.re;
        if (options.$isMultiLine) {
            var len = re.length;
            var maxRow = lines.length - len;
            var prevRange;
            outer: for (var row = re.offset || 0; row <= maxRow; row++) {
                for (var j = 0; j < len; j++)
                    if (lines[row + j].search(re[j]) == -1)
                        continue outer;
                
                var startLine = lines[row];
                var line = lines[row + len - 1];
                var startIndex = startLine.length - startLine.match(re[0])[0].length;
                var endIndex = line.match(re[len - 1])[0].length;
                
                if (prevRange && prevRange.end.row === row &&
                    prevRange.end.column > startIndex
                ) {
                    continue;
                }
                ranges.push(prevRange = new Range(
                    row, startIndex, row + len - 1, endIndex
                ));
                if (len > 2)
                    row = row + len - 2;
            }
        } else {
            for (var i = 0; i < lines.length; i++) {
                var matches = lang.getMatchOffsets(lines[i], re);
                for (var j = 0; j < matches.length; j++) {
                    var match = matches[j];
                    ranges.push(new Range(i, match.offset, i, match.offset + match.length));
                }
            }
        }

        if (range) {
            var startColumn = range.start.column;
            var endColumn = range.start.column;
            var i = 0, j = ranges.length - 1;
            while (i < j && ranges[i].start.column < startColumn && ranges[i].start.row == range.start.row)
                i++;

            while (i < j && ranges[j].end.column > endColumn && ranges[j].end.row == range.end.row)
                j--;
            
            ranges = ranges.slice(i, j + 1);
            for (i = 0, j = ranges.length; i < j; i++) {
                ranges[i].start.row += range.start.row;
                ranges[i].end.row += range.start.row;
            }
        }

        return ranges;
    };

    /**
     * Searches for `options.needle` in `input`, and, if found, replaces it with `replacement`.
     * @param {String} input The text to search in
     * @param {String} replacement The replacing text
     * + (String): If `options.regExp` is `true`, this function returns `input` with the replacement already made. Otherwise, this function just returns `replacement`.<br/>
     * If `options.needle` was not found, this function returns `null`.
     *
     * 
     * @returns {String}
    **/
    replace(input: string, replacement: string): string | null {
        var options = this.$options;

        var re = this.$assembleRegExp(options);
        if (options.$isMultiLine)
            return replacement;

        if (!re)
            return null;

        var match = re.exec(input);
        if (!match || match[0].length != input.length)
            return null;
        
        replacement = input.replace(re, replacement);
        if (options.preserveCase) {
            var replacements = replacement.split("");
            for (var i = Math.min(input.length, input.length); i--; ) {
                var ch = input[i];
                if (ch && ch.toLowerCase() != ch)
                    replacements[i] = replacements[i].toUpperCase();
                else
                    replacements[i] = replacements[i].toLowerCase();
            }
            replacement = replacements.join("");
        }
        
        return replacement;
    };

    $assembleRegExp(options: any, $disableFakeMultiline=false) {
        if (options.needle instanceof RegExp)
            return options.re = options.needle;

        var needle = options.needle;

        if (!options.needle)
            return options.re = false;

        if (!options.regExp)
            needle = lang.escapeRegExp(needle);

        if (options.wholeWord)
            needle = addWordBoundary(needle, options);

        var modifier = options.caseSensitive ? "gm" : "gmi";

        options.$isMultiLine = !$disableFakeMultiline && /[\n\r]/.test(needle);
        if (options.$isMultiLine)
            return options.re = this.$assembleMultilineRegExp(needle, modifier);

        try {
            options.re = new RegExp(needle, modifier);
        } catch(e) {
            options.re = null;
        }
        return options.re;
    };

    $assembleMultilineRegExp(needle: string, modifier: string) {
        var parts = needle.replace(/\r\n|\r|\n/g, "$\n^").split("\n");
        var re = [];
        for (var i = 0; i < parts.length; i++) try {
            re.push(new RegExp(parts[i], modifier));
        } catch(e) {
            return false;
        }
        return re;
    };

    $matchIterator(session: EditSession, options: any) {
        var re = this.$assembleRegExp(options);
        if (!re)
            return false;
        var backwards = options.backwards == true;
        var skipCurrent = options.skipCurrent != false;

        var range = options.range;
        var start = options.start;
        if (!start)
            start = range ? range[backwards ? "end" : "start"] : session.selection.getRange();
         
        if (start.start)
            start = start[skipCurrent != backwards ? "end" : "start"];

        var firstRow = range ? range.start.row : 0;
        var lastRow = range ? range.end.row : session.getLength() - 1;
        
        if (backwards) {
            var forEach = function(callback: IteratorCallback) {
                var row = start.row;
                if (forEachInLine(row, start.column, callback))
                    return;
                for (row--; row >= firstRow; row--)
                    if (forEachInLine(row, Number.MAX_VALUE, callback))
                        return;
                if (options.wrap == false)
                    return;
                for (row = lastRow, firstRow = start.row; row >= firstRow; row--)
                    if (forEachInLine(row, Number.MAX_VALUE, callback))
                        return;
            };
        }
        else {
            var forEach = function(callback: IteratorCallback) {
                var row = start.row;
                if (forEachInLine(row, start.column, callback))
                    return;
                for (row = row + 1; row <= lastRow; row++)
                    if (forEachInLine(row, 0, callback))
                        return;
                if (options.wrap == false)
                    return;
                for (row = firstRow, lastRow = start.row; row <= lastRow; row++)
                    if (forEachInLine(row, 0, callback))
                        return;
            };
        }
        
        if (options.$isMultiLine) {
            var len = re.length;
            var forEachInLine = function(row: number, offset: number, callback: IteratorCallback): boolean {
                var startRow = backwards ? row - len + 1 : row;
                if (startRow < 0) return false;
                var line = session.getLine(startRow);
                var startIndex = line.search(re[0]);
                if (!backwards && startIndex < offset || startIndex === -1) return false;
                for (var i = 1; i < len; i++) {
                    line = session.getLine(startRow + i);
                    if (line.search(re[i]) == -1)
                        return false;
                }
                var endIndex = line.match(re[len - 1])[0].length;
                if (backwards && endIndex > offset) return false;
                if (callback(startRow, startIndex, startRow + len - 1, endIndex))
                    return true;
                    
                return false;
            };
        }
        else if (backwards) {
            var forEachInLine = function(row: number, endIndex: number, callback: IteratorCallback): boolean {
                var line = session.getLine(row);
                var matches = [];
                var m, last = 0;
                re.lastIndex = 0;
                while((m = re.exec(line))) {
                    var length = m[0].length;
                    last = m.index;
                    if (!length) {
                        if (last >= line.length) break;
                        re.lastIndex = last += 1;
                    }
                    if (m.index + length > endIndex)
                        break;
                    matches.push(m.index, length);
                }
                for (var i = matches.length - 1; i >= 0; i -= 2) {
                    var column = matches[i - 1];
                    var length = matches[i];
                    if (callback(row, column, row, column + length))
                        return true;
                }
                return false;
            };
        }
        else {
            var forEachInLine = function(row: number, startIndex: number, callback: IteratorCallback): boolean {
                var line = session.getLine(row);
                var last;
                var m;
                re.lastIndex = startIndex;
                while((m = re.exec(line))) {
                    var length = m[0].length;
                    last = m.index;
                    if (callback(row, last, row,last + length))
                        return true;
                    if (!length) {
                        re.lastIndex = last += 1;
                        if (last >= line.length) return false;
                    }
                }
                return false;
            };
        }
        return {forEach: forEach};
    };
};

function addWordBoundary(needle: string, options: any) {
    function wordBoundary(c: string) {
        if (/\w/.test(c) || options.regExp) return "\\b";
        return "";
    }
    return wordBoundary(needle[0]) + needle
        + wordBoundary(needle[needle.length - 1]);
}