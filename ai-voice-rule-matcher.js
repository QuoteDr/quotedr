(function(root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.QdAiVoiceRuleMatcher = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
    'use strict';

    var NUMBER_WORDS = {
        zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5',
        six: '6', seven: '7', eight: '8', nine: '9', ten: '10',
        eleven: '11', twelve: '12', thirteen: '13', fourteen: '14', fifteen: '15',
        sixteen: '16', seventeen: '17', eighteen: '18', nineteen: '19', twenty: '20'
    };
    var IGNORED_WORDS = { a: true, an: true, the: true };
    var CRITICAL_DETAIL_WORDS = {
        exterior: true, interior: true, inside: true, outside: true,
        painted: true, stained: true, cedar: true, oak: true, vinyl: true,
        aluminum: true, aluminium: true, steel: true, wood: true, wooden: true,
        composite: true, foot: true, feet: true, ft: true, inch: true, inches: true
    };
    var MEASUREMENT_UNITS = {
        foot: true, feet: true, ft: true, inch: true, inches: true, cm: true, mm: true,
        meter: true, metre: true, lf: true, sf: true, sqft: true
    };
    var DIMENSION_MARKERS = { x: true, by: true };

    function canonicalToken(value) {
        var token = String(value || '').toLowerCase();
        if (!token || IGNORED_WORDS[token]) return '';
        if (NUMBER_WORDS[token] !== undefined) return NUMBER_WORDS[token];
        if (token.length > 3 && /s$/.test(token) && !/(ss|us|is)$/.test(token)) {
            token = token.slice(0, -1);
        }
        return token;
    }

    function tokenize(value) {
        var source = String(value || '');
        var tokens = [];
        var matcher = /[a-z0-9]+/gi;
        var match;
        while ((match = matcher.exec(source))) {
            var canonical = canonicalToken(match[0]);
            if (!canonical) continue;
            tokens.push({
                value: canonical,
                raw: match[0],
                start: match.index,
                end: match.index + match[0].length
            });
        }
        return tokens;
    }

    function canonicalText(value) {
        return tokenize(value).map(function(token) { return token.value; }).join(' ');
    }

    function matchRule(rule, transcript) {
        var triggerTokens = tokenize(rule && rule.trigger_phrase);
        var transcriptTokens = tokenize(transcript);
        if (!triggerTokens.length || !transcriptTokens.length) return null;

        var best = null;
        for (var start = 0; start < transcriptTokens.length; start++) {
            if (transcriptTokens[start].value !== triggerTokens[0].value) continue;
            var positions = [start];
            var cursor = start + 1;
            var complete = true;
            for (var triggerIndex = 1; triggerIndex < triggerTokens.length; triggerIndex++) {
                var found = -1;
                for (var transcriptIndex = cursor; transcriptIndex < transcriptTokens.length; transcriptIndex++) {
                    if (transcriptTokens[transcriptIndex].value === triggerTokens[triggerIndex].value) {
                        found = transcriptIndex;
                        break;
                    }
                }
                if (found < 0) {
                    complete = false;
                    break;
                }
                positions.push(found);
                cursor = found + 1;
            }
            if (!complete) continue;

            var end = positions[positions.length - 1];
            var extraTokens = (end - start + 1) - triggerTokens.length;
            var maxExtraTokens = Math.max(6, triggerTokens.length);
            if (extraTokens > maxExtraTokens) continue;
            var matchedPositions = {};
            positions.forEach(function(position) { matchedPositions[position] = true; });
            var unmatchedTokens = transcriptTokens.slice(start, end + 1).filter(function(token, offset) {
                return !matchedPositions[start + offset];
            }).map(function(token) { return token.value; });
            var criticalExtras = unmatchedTokens.filter(function(token) {
                return /^\d+(?:\.\d+)?$/.test(token) || CRITICAL_DETAIL_WORDS[token];
            });
            var requiresConfirmation = criticalExtras.length > 0;
            var confirmationReason = requiresConfirmation
                ? 'The spoken wording includes a number, dimension, material, or qualifier that is not part of this trade rule.'
                : '';

            var candidate = {
                rule: rule,
                startIndex: start,
                endIndex: end,
                startChar: transcriptTokens[start].start,
                endChar: transcriptTokens[end].end,
                tokenCount: triggerTokens.length,
                extraTokens: extraTokens,
                exactSequence: extraTokens === 0,
                score: (triggerTokens.length * 20) - (extraTokens * 4) + (extraTokens === 0 ? 10 : 0),
                spokenPhrase: String(transcript || '').slice(transcriptTokens[start].start, transcriptTokens[end].end).trim(),
                unmatchedTokens: unmatchedTokens,
                requiresConfirmation: requiresConfirmation,
                confirmationReason: confirmationReason
            };
            if (!best
                || candidate.extraTokens < best.extraTokens
                || (candidate.extraTokens === best.extraTokens && candidate.startIndex < best.startIndex)) {
                best = candidate;
            }
        }
        return best;
    }

    function usageCount(match) {
        return parseInt(match && match.rule && match.rule.usage_count, 10) || 0;
    }

    function compareMatches(left, right) {
        return right.tokenCount - left.tokenCount
            || left.extraTokens - right.extraTokens
            || right.score - left.score
            || usageCount(right) - usageCount(left)
            || String(left.rule && left.rule.trigger_phrase || '').localeCompare(String(right.rule && right.rule.trigger_phrase || ''));
    }

    function areCloseMatches(first, second) {
        if (!first || !second) return false;
        var sameSpokenSpan = first.startIndex === second.startIndex && first.endIndex === second.endIndex;
        var closeSpecificity = Math.abs(first.tokenCount - second.tokenCount) <= 1;
        var closeExpansion = Math.abs(first.extraTokens - second.extraTokens) <= 1;
        return sameSpokenSpan && closeSpecificity && closeExpansion;
    }

    function groupOverlappingMatches(matches) {
        var sorted = matches.slice().sort(function(left, right) {
            return left.startIndex - right.startIndex || left.endIndex - right.endIndex || compareMatches(left, right);
        });
        var groups = [];
        sorted.forEach(function(match) {
            var group = groups[groups.length - 1];
            if (!group || match.startIndex > group.endIndex) {
                groups.push({ startIndex: match.startIndex, endIndex: match.endIndex, matches: [match] });
                return;
            }
            group.matches.push(match);
            group.startIndex = Math.min(group.startIndex, match.startIndex);
            group.endIndex = Math.max(group.endIndex, match.endIndex);
        });
        return groups;
    }

    function numericValue(token) {
        var parsed = parseFloat(token && token.value);
        return isFinite(parsed) ? parsed : null;
    }

    function extractCount(value, countLabel) {
        var tokens = tokenize(value);
        var labelTokens = tokenize(countLabel);
        if (!tokens.length || !labelTokens.length) return null;
        for (var labelStart = 0; labelStart <= tokens.length - labelTokens.length; labelStart++) {
            var labelMatches = labelTokens.every(function(labelToken, offset) {
                return tokens[labelStart + offset].value === labelToken.value;
            });
            if (!labelMatches) continue;
            for (var numberIndex = labelStart - 1; numberIndex >= Math.max(0, labelStart - 4); numberIndex--) {
                var count = numericValue(tokens[numberIndex]);
                if (count === null) continue;
                var between = tokens.slice(numberIndex + 1, labelStart).map(function(token) { return token.value; });
                var previous = tokens[numberIndex - 1] && tokens[numberIndex - 1].value;
                var next = tokens[numberIndex + 1] && tokens[numberIndex + 1].value;
                if (DIMENSION_MARKERS[previous] || DIMENSION_MARKERS[next]) continue;
                if (between.some(function(token) { return MEASUREMENT_UNITS[token] || DIMENSION_MARKERS[token]; })) continue;
                return count;
            }
        }
        return null;
    }

    function selectRuleMatches(rules, transcript) {
        var matches = (rules || []).map(function(rule) {
            if (!rule || rule.active === false) return null;
            return matchRule(rule, transcript);
        }).filter(Boolean);

        return groupOverlappingMatches(matches).map(function(group) {
            var candidates = group.matches.slice().sort(compareMatches);
            var selected = candidates[0];
            var closeMatch = areCloseMatches(selected, candidates[1]);
            var requiresConfirmation = !!selected.requiresConfirmation;
            return {
                rule: selected.rule,
                match: selected,
                candidates: candidates,
                ambiguous: closeMatch || requiresConfirmation,
                requiresConfirmation: requiresConfirmation,
                confirmationReason: requiresConfirmation
                    ? selected.confirmationReason
                    : (closeMatch ? 'Several close trade rules match these words.' : ''),
                spokenPhrase: selected.spokenPhrase
            };
        });
    }

    return {
        canonicalText: canonicalText,
        tokenize: tokenize,
        matchRule: matchRule,
        selectRuleMatches: selectRuleMatches,
        areCloseMatches: areCloseMatches,
        extractCount: extractCount
    };
});
