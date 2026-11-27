// Project:         French grammar processor for Daggerfall Unity
// Copyright:       Copyright (C) 2025 Daneel53
// License:         MIT License (http://www.opensource.org/licenses/mit-license.php)
// Author:          Daneel53
//
// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
// documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
// permit persons to whom the Software is furnished to do so, subject to the following conditions: The above copyright
// notice and this permission notice shall be included in all copies or substantial portions of the Software.
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
// WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
// COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
//
// Ported from FrenchGrammarRules.cs, quirks included, so an installed French pack reads as its authors wrote it.
// Where the C# throws on an unclosed token, this stops there and leaves the rest of the text as written.

import { GrammarRules, GrammarManager, registerGrammarRules } from '../../ui/textManager.js';

const GENDER_NUMS = ['MS', 'MP', 'FS', 'FP'];
const isUpper = (c) => !!c && c !== c.toLowerCase() && c === c.toUpperCase();
const upperFirst = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const isMaleGender = (g) => g === 'male' || g === 'Male' || g === 0;

// Module state, like the C# statics: `curGenderNum` carries over from one text to the next.
let curGenderNum = 'MS';
let isMale = true;
let isSingular = true;
let genderDefined = false;
let hAspire = false;
let adjectiveBeforeWord = false;
let genderNumFound = false;
let checkAArticle = false;
let checkDeArticle = false;

function getNextToken(text, start) {
  let from = start;
  for (;;) {
    const bPos = text.indexOf('{', from);
    if (bPos === -1) return { type: 'NotFound' };
    const close = text.indexOf('}', bPos);
    if (close === -1) return { type: 'NotFound' };
    const cursorPos = close + 1;
    let content = text.slice(bPos + 1, close);
    if (!content) return { type: 'Unknown', bPos, cursorPos, content };
    const ch = content[0];
    if (!/[0-9]/.test(ch)) {
      if (content.includes('/')) return { type: 'HeroGender', bPos, cursorPos, content };
      if (content.includes('?')) {
        const head = content.split('?')[0];
        return { type: head === 'IsPlural' ? 'IsPlural' : head === 'NPCGender' ? 'NPCGender' : 'Number', bPos, cursorPos, content };
      }
      if (ch === '#') return { type: 'Adjective', bPos, cursorPos, content };
      if (ch === '.') {
        content = content.slice(1);
        if (GENDER_NUMS.includes(content)) {
          let wordAfter = '';
          for (let i = cursorPos; i < text.length; i++) {
            if (' .,{'.includes(text[i])) break;
            wordAfter += text[i];
          }
          return { type: 'GenderNum', bPos, cursorPos, content, wordAfter };
        }
        return { type: 'Article', bPos, cursorPos, content };
      }
      return { type: 'Unknown', bPos, cursorPos, content };
    }
    from = cursorPos;
  }
}

function handleGenderPrefix() {
  isMale = curGenderNum === 'MS' || curGenderNum === 'MP';
  isSingular = curGenderNum === 'MS' || curGenderNum === 'FS';
  genderDefined = true;
}

function getNextGenderNum(text, start) {
  const dotPos = text.indexOf('. ', start);
  const sentence = dotPos !== -1 ? text.slice(0, dotPos + 1) : text;
  let cp = sentence.indexOf('{.', start);
  while (cp !== -1) {
    const token = sentence.substr(cp + 2, 2);
    if (GENDER_NUMS.includes(token)) {
      curGenderNum = token;
      handleGenderPrefix();
      genderNumFound = true;
      if (cp === start) {
        adjectiveBeforeWord = false;
        if (text.length >= cp + 9 && text.substr(cp + 5, 4) === '{.h}') { hAspire = true; cp += 4; }
      } else adjectiveBeforeWord = true;
      let wordAfter = '';
      for (let i = cp + 5; i < sentence.length; i++) {
        if (' .,{'.includes(text[i])) break;
        wordAfter += text[i];
      }
      return wordAfter.toLowerCase();
    }
    cp = sentence.indexOf('{.', cp + 1);
  }
  return null;
}

function nextCharIsVowel(word) {
  if (!word) return false;
  const ch = word[0];
  if ('aeiouyàâéèêîAEIOUYÀÂÉÈÊÎ'.includes(ch)) return true;
  if ('hH'.includes(ch)) return !hAspire;
  return false;
}

const withCase = (token, prefix) => (isUpper(token[0]) ? upperFirst(prefix) : prefix);

function lePrefix(word, token) {
  let prefix;
  if (word === 'le' || word === 'la' || word === 'les' || word.startsWith("l'")) prefix = '';
  else if (!genderDefined) prefix = '';
  else if (!isSingular) prefix = 'les ';
  else if (!adjectiveBeforeWord && nextCharIsVowel(word)) prefix = "l'";
  else if (!isMale) prefix = 'la ';
  else prefix = 'le ';
  if (word === '' && prefix.endsWith(' ')) prefix = prefix.trimEnd();
  return withCase(token, prefix);
}

function unPrefix(token) {
  return withCase(token, !isSingular ? 'des ' : !isMale ? 'une ' : 'un ');
}

function cePrefix(word, token) {
  return withCase(token, !isSingular ? 'ces ' : !isMale ? 'cette ' : nextCharIsVowel(word) ? 'cet ' : 'ce ');
}

function dePrefix(word, token) {
  let prefix;
  if (word === 'la' || word.startsWith("l'")) prefix = 'de ';
  else if (word === 'le' || word === 'les') { prefix = 'de '; checkDeArticle = true; }
  else if (!isSingular) prefix = 'des ';
  else if (!genderDefined) {
    prefix = nextCharIsVowel(word) ? "d'" : 'de ';
    // Set for both vowel and consonant words, matching an unbraced else in the C# original.
    checkDeArticle = true;
  } else if (nextCharIsVowel(word)) prefix = "de l'";
  else if (isMale) prefix = 'du ';
  else prefix = 'de la ';
  return withCase(token, prefix);
}

function deItPrefix(word, token) {
  return withCase(token, nextCharIsVowel(word) ? "d'" : 'de ');
}

function duPrefix(word, token) {
  return withCase(token, !isSingular ? 'des ' : nextCharIsVowel(word) ? "de l'" : !isMale ? 'de la ' : `${token} `);
}

function aPrefix(word, token) {
  let prefix;
  if (word === 'la' || word.startsWith("l'")) prefix = 'à ';
  else if (word === 'le' || word === 'les') { prefix = 'à '; checkAArticle = true; }
  else if (!genderDefined) { prefix = 'à '; checkAArticle = true; }
  else if (!isSingular) prefix = 'aux ';
  else if (nextCharIsVowel(word)) prefix = "à l'";
  else if (isMale) prefix = 'au ';
  else prefix = 'à la ';
  return withCase(token, prefix);
}

const possessive = (plural, masc, fem) => (word, token) =>
  withCase(token, !isSingular ? plural : nextCharIsVowel(word) ? masc : isMale ? masc : fem);
const tonPrefix = possessive('tes ', 'ton ', 'ta ');
const sonPrefix = possessive('ses ', 'son ', 'sa ');
const monPrefix = possessive('mes ', 'mon ', 'ma ');

function adjective(word, beforeWord, expression) {
  const v = expression.split('#');
  if (curGenderNum === 'MS') return (v.length === 6 && beforeWord && nextCharIsVowel(word)) ? v[5] : v[1];
  if (curGenderNum === 'MP') return v[2];
  if (curGenderNum === 'FS') return v[3];
  return v[4];
}

function numberWord(content, processed) {
  const v = content.slice(7).split('#');
  const words = processed.split(' ');
  const number = words[words.length - 2];
  return number !== undefined && /^\s*[+-]?\d+\s*$/.test(number) && Number.parseInt(number, 10) >= 2 ? v[1] : v[0];
}

function minSuffix(processed, token) {
  const words = processed.split(/[ .']/);
  let n = words.length - 1;
  if (words[n] === '') { if (n !== 0) n -= 1; else return processed; }
  if (token === 'min') {
    let finished = false;
    for (let i = 1; !finished && i < 4; i++) {
      const word = words[n];
      if (word && isUpper(word[0])) {
        if (n !== 0 && words[n - 1] !== '') processed = processed.split(word).join(word.toLowerCase());
        finished = true;
      }
      n -= 1;
      if (n < 0 || words[n] === '') finished = true;
    }
    return processed;
  }
  let finished = false;
  while (!finished) {
    const word = words[n];
    if (word && isUpper(word[0])) {
      if (n !== 0 && words[n - 1] !== '') {
        const at = processed.lastIndexOf(word);
        processed = processed.slice(0, at) + word.toLowerCase() + processed.slice(at + word.length);
      } else finished = true;
    }
    n -= 1;
    if (n < 0 || words[n] === '') finished = true;
  }
  return processed;
}

function majSuffix(processed) {
  const punc = processed.endsWith('.') ? '.' : processed.endsWith('?') ? '?' : processed.endsWith('!') ? '!' : '';
  if (punc) processed = processed.replace(/[.?!]+$/, '');
  const last = Math.max(processed.lastIndexOf('.'), processed.lastIndexOf('?'), processed.lastIndexOf('!'));
  if (last === -1) processed = upperFirst(processed);
  else if (processed.length > last + 2) processed = processed.slice(0, last + 2) + processed[last + 2].toUpperCase() + processed.slice(last + 3);
  return processed + punc;
}

export class FrenchGrammarRules extends GrammarRules {
  processGrammar(sourceText) {
    const text = String(sourceText ?? '');
    if (!text.includes('{')) return text;
    hAspire = false; genderDefined = false; genderNumFound = false; isMale = true; isSingular = true;
    let processed = '';
    let start = 0;
    let wordAfterGender = '';
    let t = getNextToken(text, start);
    while (t.type !== 'NotFound') {
      processed += text.slice(start, t.bPos);
      let cursorPos = t.cursorPos;
      switch (t.type) {
        case 'HeroGender': {
          const v = t.content.split('/');
          processed += isMaleGender(GrammarManager.heroGender?.()) || !GrammarManager.heroGender ? v[0] : v[1];
          break;
        }
        case 'NPCGender': {
          const v = t.content.slice(10).split('#');
          processed += isMaleGender(GrammarManager.npcGender?.() ?? 'male') ? v[0] : v[1];
          break;
        }
        case 'IsPlural': {
          const v = t.content.slice(9).split('#');
          processed += isSingular ? v[0] : v[1];
          break;
        }
        case 'Number':
          processed += numberWord(t.content, processed);
          break;
        case 'Unknown':
          processed += ` -UT: ${text} - `;
          break;
        case 'Adjective': {
          if (!genderNumFound) wordAfterGender = getNextGenderNum(text, cursorPos) ?? wordAfterGender;
          processed += adjective(wordAfterGender, adjectiveBeforeWord, t.content);
          break;
        }
        case 'GenderNum':
          wordAfterGender = t.wordAfter;
          curGenderNum = t.content;
          handleGenderPrefix();
          processed += wordAfterGender;
          cursorPos += wordAfterGender.length;
          break;
        case 'Article': {
          wordAfterGender = getNextGenderNum(text, cursorPos) ?? '';
          const word = wordAfterGender;
          const token = t.content;
          checkAArticle = false; checkDeArticle = false;
          switch (token.toLowerCase()) {
            case 'le': processed += lePrefix(word, token); break;
            case 'un': processed += unPrefix(token); break;
            case 'ce': processed += cePrefix(word, token); break;
            case 'de': processed += dePrefix(word, token); break;
            case 'deit': processed += deItPrefix(word, token); break;
            case 'du': processed += duPrefix(word, token); break;
            case 'à': processed += aPrefix(word, token); break;
            case 'mon': processed += monPrefix(word, token); break;
            case 'ton': processed += tonPrefix(word, token); break;
            case 'son': processed += sonPrefix(word, token); break;
            case 'min': processed = minSuffix(processed, token); break;
            case 'maj': processed = majSuffix(processed); break;
            default: break;
          }
          break;
        }
        default: break;
      }
      start = cursorPos;
      t = getNextToken(text, start);
    }
    processed += text.slice(start);
    if (checkAArticle) {
      processed = processed.split('à le ').join('au ').split('à Le ').join('au ').split('à les ').join('aux ').split('à Les ').join('aux ');
      checkAArticle = false;
    }
    if (checkDeArticle) {
      processed = processed.split('de le ').join('du ').split('de Le ').join('du ').split('de les ').join('des ').split('de Les ').join('des ');
      checkDeArticle = false;
    }
    return processed;
  }
}

export function _resetFrenchGrammarForTests() {
  curGenderNum = 'MS'; isMale = true; isSingular = true; genderDefined = false; hAspire = false;
  adjectiveBeforeWord = false; genderNumFound = false; checkAArticle = false; checkDeArticle = false;
}

registerGrammarRules('fr', new FrenchGrammarRules());
