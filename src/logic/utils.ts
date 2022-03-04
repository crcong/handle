import seedrandom from 'seedrandom'
import Pinyin from 'pinyin'
import IDIOMS from '../data/idioms.json'
import type { MatchResult, ParsedChar } from './types'
import { pinyin2zhuyin, pinyinInitials, toSimplified } from './lang'
import { toShuangpin } from './lang/shuangpin'
import type { InputMode } from '.'
import { fullMatch } from '~/state'

export function parsePinyin(pinyin: string, mode: InputMode = 'py') {
  let parts: string[] = []
  if (pinyin) {
    if (mode === 'zy') {
      parts = Array.from(pinyin2zhuyin[pinyin] || '')
    }
    else if (mode === 'sp') {
      parts = Array.from(toShuangpin(pinyin))
    }
    else {
      let rest = pinyin
      const one = pinyinInitials.find(i => rest.startsWith(i))
      if (one)
        rest = rest.slice(one.length)
      parts = [one, rest].filter(Boolean) as string[]
    }
  }
  return parts
}

export function parseChar(char: string, pinyin?: string, mode?: InputMode): ParsedChar {
  if (!pinyin)
    pinyin = getPinyin(char)[0]
  const tone = pinyin.match(/[\d]$/)?.[0] || ''
  if (tone)
    pinyin = pinyin.slice(0, -tone.length).trim()

  const parts = parsePinyin(pinyin, mode)
  const [one, two, three] = parts
  return {
    char,
    _1: one,
    _2: two,
    _3: three,
    parts,
    yin: pinyin,
    tone: +tone || 0,
  }
}

export function parseWord(word: string, answer?: string, mode?: InputMode) {
  const pinyins = getPinyin(word)
  const chars = Array.from(word)
  const answerPinyin = answer ? getPinyin(answer) : undefined

  return chars.map((char, i): ParsedChar => {
    let pinyin = pinyins[i] || ''
    // try match the pinyin from the answer word
    if (answerPinyin && answer && answer.includes(char))
      pinyin = answerPinyin[answer.indexOf(char)] || pinyin
    return parseChar(char, pinyin, mode)
  })
}

export function testAnswer(input: ParsedChar[], answer: ParsedChar[]) {
  if (fullMatch.value)
    return _testAnswerByFullMatch(input, answer)

  return _testAnswer(input, answer)
}

function includesAndRemove<T>(arr: T[], v: T) {
  if (arr.includes(v)) {
    arr.splice(arr.indexOf(v), 1)
    return true
  }
  return false
}

export function _testAnswerByFullMatch(input: ParsedChar[], answer: ParsedChar[]) {
  const matchMap = {
    char: answer.map(a => a.char),
    tone: answer.map(a => a.tone),
    parts: answer.map(a => a.parts).flat(),
  }
  const result = [
    { char: 'none', tone: 'none', _1: 'none', _2: 'none', _3: 'none' },
    { char: 'none', tone: 'none', _1: 'none', _2: 'none', _3: 'none' },
    { char: 'none', tone: 'none', _1: 'none', _2: 'none', _3: 'none' },
    { char: 'none', tone: 'none', _1: 'none', _2: 'none', _3: 'none' },
  ]
  answer.forEach((a, i) => {
    if (toSimplified(a.char) === toSimplified(input[i].char)) {
      result[i].char = 'exact'
      includesAndRemove(matchMap.char, a.char)
    }
    if (a.tone === input[i].tone) {
      result[i].tone = 'exact'
      includesAndRemove(matchMap.tone, a.tone)
    }
    if (a._1 === input[i]._1) {
      result[i]._1 = 'exact'
      includesAndRemove(matchMap.parts, a._1)
    }
    if (a._2 === input[i]._2) {
      result[i]._2 = 'exact'
      includesAndRemove(matchMap.parts, a._2)
    }
    if (a._3 === input[i]._3) {
      result[i]._3 = 'exact'
      includesAndRemove(matchMap.parts, a._3)
    }
  })
  const matchWeight = input.map((i, index) => {
    let w = 0
    matchMap.char.includes(i.char) && w++
    matchMap.tone.includes(i.tone) && w++
    matchMap.parts.includes(i._1) && w++
    matchMap.parts.includes(i._2 || '') && w++
    matchMap.parts.includes(i._3 || '') && w++
    return { ...i, _w: w, _i: index }
  }).sort((a, b) => b._w - a._w)

  function includesAndRemoveNotExact<T>(arr: T[], v: T, type: string) {
    if (type === 'exact')
      return false

    if (arr.includes(v)) {
      arr.splice(arr.indexOf(v), 1)
      return true
    }
    return false
  }

  matchWeight.forEach((m) => {
    if (includesAndRemoveNotExact(matchMap.char, m.char, result[m._i].char))
      result[m._i].char = 'misplaced'

    if (includesAndRemoveNotExact(matchMap.tone, m.tone, result[m._i].tone))
      result[m._i].tone = 'misplaced'

    if (includesAndRemoveNotExact(matchMap.parts, m._1, result[m._i]._1))
      result[m._i]._1 = 'misplaced'

    if (includesAndRemoveNotExact(matchMap.parts, m._2, result[m._i]._2))
      result[m._i]._2 = 'misplaced'

    if (includesAndRemoveNotExact(matchMap.parts, m._3, result[m._i]._3))
      result[m._i]._3 = 'misplaced'
  })
  return result
}

export function _testAnswer(input: ParsedChar[], answer: ParsedChar[]) {
  const unmatched = {
    char: answer
      .map((a, i) => toSimplified(input[i].char) === toSimplified(a.char) ? undefined : toSimplified(a.char))
      .filter(i => i != null),
    tone: answer
      .map((a, i) => input[i].tone === a.tone ? undefined : a.tone)
      .filter(i => i != null),
    parts: answer
      .flatMap((a, i) => a.parts.filter(p => !input[i].parts.includes(p)))
      .filter(i => i != null) as string[],
  }

  return input.map((a, i): MatchResult => {
    const char = toSimplified(a.char)
    return {
      char: answer[i].char === char || answer[i].char === a.char
        ? 'exact'
        : includesAndRemove(unmatched.char, char)
          ? 'misplaced'
          : 'none',
      tone: answer[i].tone === a.tone
        ? 'exact'
        : includesAndRemove(unmatched.tone, a.tone)
          ? 'misplaced'
          : 'none',
      _1: !a._1 || answer[i].parts.includes(a._1)
        ? 'exact'
        : includesAndRemove(unmatched.parts, a._1)
          ? 'misplaced'
          : 'none',
      _2: !a._2 || answer[i].parts.includes(a._2)
        ? 'exact'
        : includesAndRemove(unmatched.parts, a._2)
          ? 'misplaced'
          : 'none',
      _3: !a._3 || answer[i].parts.includes(a._3)
        ? 'exact'
        : includesAndRemove(unmatched.parts, a._3)
          ? 'misplaced'
          : 'none',
    }
  })
}

export function checkPass(result: MatchResult[]) {
  return result.every(r => r.char === 'exact')
}

export function getHint(word: string) {
  return word[Math.floor(seedrandom(word)() * word.length)]
}

export function getPinyin(word: string) {
  const simplifiedWord = toSimplified(word)
  const data = IDIOMS.find(d => d[0] === simplifiedWord || d[0] === word)
  if (data && data[1])
    return data[1].split(/\s+/g)
  return Pinyin(simplifiedWord, { style: Pinyin.STYLE_TONE2 }).map(i => i[0])
}

const numberChar = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九']
const tens = ['', '十', '百', '千']

export function numberToHanzi(number: number) {
  const digits = Array.from(number.toString()).map(i => +i)
  const chars = digits.map((i, idx) => {
    const unit = i !== 0 ? tens[digits.length - 1 - idx] : ''
    return numberChar[i] + unit
  })
  const str = chars.join('')
  return str
    .replace('一十', '十')
    .replace('一百', '百')
    .replace('二十', '廿')
    .replace(/零+/, '零')
    .replace(/(.)零$/, '$1')
}
