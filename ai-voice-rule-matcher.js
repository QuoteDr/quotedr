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
                spokenPhrase: String(transcript || '').slice(transcriptTokens[start].start, transcriptTokens[end].end).trim()
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

    function selectRuleMatches(rules, transcript) {
        var matches = (rules || []).map(function(rule) {
            if (!rule || rule.active === false) return null;
            return matchRule(rule, transcript);
        }).filter(Boolean);

        return groupOverlappingMatches(matches).map(function(group) {
            var candidates = group.matches.slice().sort(compareMatches);
            var selected = candidates[0];
            return {
                rule: selected.rule,
                match: selected,
                candidates: candidates,
                ambiguous: areCloseMatches(selected, candidates[1]),
                spokenPhrase: selected.spokenPhrase
            };
        });
    }

    return {
        canonicalText: canonicalText,
        tokenize: tokenize,
        matchRule: matchRule,
        selectRuleMatches: selectRuleMatches,
        areCloseMatches: areCloseMatches
    };
});
