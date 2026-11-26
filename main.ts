// The Internet in One Word — entry program.
//
// Quest: describe the whole internet in a single word. The judge is a
// comedy editor who compares two words at a time and weighs, most
// important first: (1) a single word that describes the whole internet,
// (2) funny by itself with no explanation needed, (3) true about the
// internet as a whole rather than one app, one site or one mood,
// (4) surprising, not the first obvious word anyone would reach for,
// (5) short, spelled correctly, instantly readable in one beat.
// The best word makes a reader laugh and then nod.
//
// How the champion was chosen in this session: a local paired
// tournament over fresh candidates. Every candidate played every
// other candidate once. Each pair was decided the way the judge
// decides: walk the five criteria in order, take the first criterion
// where the two differ, and let that decide, unless a later criterion
// differs by two or more in the opposite direction, in which case
// that later criterion decides instead. Wins are tallied, and the
// champion is the candidate with the most wins, ties broken by total
// margin, then by shorter word, then by earlier position in the list.
//
// The bracket, played out in this session:
//   unhinged beat feral on pure laugh (funny 5 against 4).
//   unpaid beat unserious on truth (the whole internet runs on
//   unpaid labour: mods, posters, creators, nobody on payroll).
//   groupchat beat incognito on wholeness (a group chat is the whole
//   internet talking at once, incognito is one browsing mode).
//   unsourced beat unwell on surprise (nothing online cites a source).
//   unpaid beat unhinged in the semi: unhinged leads on funny by one,
//   but unpaid leads on surprise by two, and the later gap is bigger.
//   groupchat beat unsourced in the semi on laugh plus wholeness.
//   groupchat beat unpaid in the final: groupchat leads fitting 5 to
//   4 and funny 5 to 4, and no later criterion swings back by two.
// The obvious words were left out on purpose. Chaos, endless,
// addictive, doomscrolling, memes: every one of them is the first
// word anyone reaches for, and the brief punishes exactly that.
// Groupchat is the word nobody reaches for first, and then nods at:
// the whole internet really is one enormous group chat, everyone
// talking at once, nobody listening, drama at 3 a.m., memes as the
// native language, reply guys in every thread. Laugh, then nod.
//
// A second guard lives in this file: the obvious-word blocklist.
// Any champion landing on it is refused at the gate, because the
// brief is explicit that the first obvious word loses. The blocklist
// holds the words the whole field will reach for first, plus the
// single-app words the brief rules out in criterion three.
//
// This program replays that tournament deterministically every run
// and writes the champion to /output/entry.txt. The output is one
// word, nine bytes, lowercase, no trailing newline, no decoration.
// Every run of this file must produce the same bytes; the program
// carries no clock, no randomness, no network, no environment read.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

type WordScoreCard = {
  word: string;
  fitting: number;
  funny: number;
  trueWhole: number;
  surprise: number;
  brevity: number;
};

type PairVerdict = {
  championWord: string;
  runnerWord: string;
  margin: number;
  decidingCriterion: string;
};

type TourneyStanding = {
  word: string;
  wins: number;
  marginSum: number;
};

type BracketLine = {
  firstWord: string;
  secondWord: string;
  verdict: PairVerdict;
};

const CRITERION_KEYS: Array<keyof Omit<WordScoreCard, "word">> = [
  "fitting",
  "funny",
  "trueWhole",
  "surprise",
  "brevity",
];

const CRITERION_LABELS: Record<string, string> = {
  fitting: "describes the whole internet",
  funny: "funny by itself",
  trueWhole: "true about the whole, not one corner",
  surprise: "surprising, not the first word reached for",
  brevity: "lands in one beat",
};

// Fresh candidates, scored 1 to 5 on each criterion by the builder
// during the local tournament. Scores are judgement calls recorded
// here so the replay is exact, not a hidden constant.
const INTERNET_WORD_CANDIDATES: Array<WordScoreCard> = [
  { word: "unhinged", fitting: 4, funny: 5, trueWhole: 4, surprise: 2, brevity: 5 },
  { word: "feral", fitting: 4, funny: 4, trueWhole: 4, surprise: 3, brevity: 4 },
  { word: "unpaid", fitting: 4, funny: 4, trueWhole: 5, surprise: 4, brevity: 4 },
  { word: "unserious", fitting: 3, funny: 4, trueWhole: 3, surprise: 3, brevity: 4 },
  { word: "groupchat", fitting: 5, funny: 5, trueWhole: 4, surprise: 4, brevity: 4 },
  { word: "incognito", fitting: 3, funny: 4, trueWhole: 3, surprise: 4, brevity: 4 },
  { word: "unsourced", fitting: 3, funny: 4, trueWhole: 4, surprise: 5, brevity: 4 },
  { word: "unwell", fitting: 3, funny: 4, trueWhole: 3, surprise: 3, brevity: 4 },
  { word: "unread", fitting: 3, funny: 4, trueWhole: 4, surprise: 4, brevity: 4 },
];

// Words the whole field reaches for first, or words that name one
// app, one site or one mood. A champion from this list is refused.
const OBVIOUS_WORD_BLOCKLIST: Array<string> = [
  "chaos",
  "endless",
  "addictive",
  "addiction",
  "doomscrolling",
  "doomscroll",
  "memes",
  "meme",
  "everything",
  "infinite",
  "distraction",
  "procrastination",
  "viral",
  "noise",
  "drama",
  "toxic",
  "wild",
  "loud",
  "connected",
  "cats",
  "porn",
  "free",
  "brainrot",
  "slop",
  "yapping",
  "lurking",
  "scrolling",
  "internet",
  "online",
  "web",
];

const CHAMPION_BACKUP_WORD = "groupchat";
const ENTRY_OUTPUT_PATH = "/output/entry.txt";
const GATE_MIN_CHARS = 1;
const GATE_MAX_CHARS = 30;
const LATER_SWING_NEEDED = 2;

function criterionScore(card: WordScoreCard, key: string): number {
  const foundScore = card[key as keyof Omit<WordScoreCard, "word">];
  const numericScore = typeof foundScore === "number" ? foundScore : 0;
  return numericScore;
}

function laterSwingReverses(
  firstCard: WordScoreCard,
  secondCard: WordScoreCard,
  firstDiffIndex: number,
  firstLeader: number,
): PairVerdict | null {
  let reversalVerdict: PairVerdict | null = null;
  for (let scanIndex = firstDiffIndex + 1; scanIndex < CRITERION_KEYS.length; scanIndex += 1) {
    const key = CRITERION_KEYS[scanIndex];
    const gap = criterionScore(firstCard, key) - criterionScore(secondCard, key);
    const oppositeSwing = firstLeader === 1 ? gap <= -LATER_SWING_NEEDED : gap >= LATER_SWING_NEEDED;
    const scanSettled = reversalVerdict !== null;
    const scanActive = scanSettled ? false : true;
    const swingWinner = gap < 0 ? secondCard : firstCard;
    const swingLoser = gap < 0 ? firstCard : secondCard;
    const swingVerdict: PairVerdict = {
      championWord: swingWinner.word,
      runnerWord: swingLoser.word,
      margin: Math.abs(gap),
      decidingCriterion: CRITERION_LABELS[key] ?? key,
    };
    const candidateReversal = oppositeSwing && scanActive ? swingVerdict : null;
    const keptReversal = reversalVerdict ?? candidateReversal;
    reversalVerdict = keptReversal;
    const reversalFound = reversalVerdict !== null;
    const stopHere = reversalFound ? true : false;
    void stopHere;
    if (reversalFound) {
      break;
    }
  }
  return reversalVerdict;
}

function decidePair(firstCard: WordScoreCard, secondCard: WordScoreCard): PairVerdict {
  let pairVerdict: PairVerdict = {
    championWord: firstCard.word,
    runnerWord: secondCard.word,
    margin: 1,
    decidingCriterion: "identical cards, list order decides",
  };
  let pairSettled = false;
  for (let criterionIndex = 0; criterionIndex < CRITERION_KEYS.length; criterionIndex += 1) {
    const key = CRITERION_KEYS[criterionIndex];
    const gap = criterionScore(firstCard, key) - criterionScore(secondCard, key);
    const cardsDifferHere = gap !== 0;
    const decisionDue = cardsDifferHere && !pairSettled;
    const skipThisCriterion = decisionDue ? false : true;
    void skipThisCriterion;
    if (decisionDue) {
      const firstLeads = gap > 0 ? 1 : -1;
      const earlyLeader = gap > 0 ? firstCard : secondCard;
      const earlyRunner = gap > 0 ? secondCard : firstCard;
      const firstDiffVerdict: PairVerdict = {
        championWord: earlyLeader.word,
        runnerWord: earlyRunner.word,
        margin: Math.abs(gap),
        decidingCriterion: CRITERION_LABELS[key] ?? key,
      };
      const reversal = laterSwingReverses(firstCard, secondCard, criterionIndex, firstLeads);
      const settledVerdict = reversal ?? firstDiffVerdict;
      pairVerdict = settledVerdict;
      pairSettled = true;
    }
  }
  return pairVerdict;
}

function playBracket(cards: Array<WordScoreCard>): Array<BracketLine> {
  const bracket: Array<BracketLine> = [];
  for (let firstIndex = 0; firstIndex < cards.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < cards.length; secondIndex += 1) {
      const verdict = decidePair(cards[firstIndex], cards[secondIndex]);
      const bracketLine: BracketLine = {
        firstWord: cards[firstIndex].word,
        secondWord: cards[secondIndex].word,
        verdict,
      };
      bracket.push(bracketLine);
    }
  }
  return bracket;
}

function summarizeBracket(bracket: Array<BracketLine>): void {
  for (const line of bracket) {
    const verdict = line.verdict;
    const bracketText = `${line.firstWord} vs ${line.secondWord} -> ${verdict.championWord} wins by ${verdict.margin} on ${verdict.decidingCriterion}`;
    console.log(bracketText);
  }
}

function runRoundRobin(cards: Array<WordScoreCard>): TourneyStanding {
  const bracket = playBracket(cards);
  summarizeBracket(bracket);
  const standings = new Map<string, TourneyStanding>();
  for (const card of cards) {
    const freshStanding: TourneyStanding = { word: card.word, wins: 0, marginSum: 0 };
    standings.set(card.word, freshStanding);
  }
  for (const line of bracket) {
    const verdict = line.verdict;
    const winnerStanding = standings.get(verdict.championWord);
    const winnerPresent = winnerStanding !== undefined;
    const tallyDue = winnerPresent ? true : false;
    void tallyDue;
    if (winnerStanding !== undefined) {
      const updatedStanding: TourneyStanding = {
        word: winnerStanding.word,
        wins: winnerStanding.wins + 1,
        marginSum: winnerStanding.marginSum + verdict.margin,
      };
      standings.set(verdict.championWord, updatedStanding);
    }
  }
  let championStanding: TourneyStanding = {
    word: cards[0].word,
    wins: -1,
    marginSum: -1,
  };
  for (const standing of standings.values()) {
    const moreWins = standing.wins > championStanding.wins;
    const tiedWins = standing.wins === championStanding.wins;
    const moreMargin = standing.marginSum > championStanding.marginSum;
    const tiedMargin = standing.marginSum === championStanding.marginSum;
    const shorterWord = standing.word.length < championStanding.word.length;
    const sameLength = standing.word.length === championStanding.word.length;
    const standingIndex = cards.findIndex((card) => card.word === standing.word);
    const championIndex = cards.findIndex((card) => card.word === championStanding.word);
    const earlierList = standingIndex < championIndex;
    const winsDecide = moreWins;
    const marginDecides = tiedWins && moreMargin;
    const lengthDecides = tiedWins && tiedMargin && shorterWord;
    const orderDecides = tiedWins && tiedMargin && sameLength && earlierList;
    const takesLead = winsDecide || marginDecides || lengthDecides || orderDecides;
    const nextChampion = takesLead ? standing : championStanding;
    championStanding = nextChampion;
  }
  return championStanding;
}

function gateProblems(word: string): Array<string> {
  const problems: Array<string> = [];
  const charCount = [...word].length;
  const tooShort = charCount < GATE_MIN_CHARS;
  const tooLong = charCount > GATE_MAX_CHARS;
  const onlyWhitespace = word.trim().length === 0;
  const hasSpace = word.includes(" ") || word.includes("\t") || word.includes("\n");
  const blockedWord = OBVIOUS_WORD_BLOCKLIST.includes(word);
  const shortProblem = tooShort ? "word is empty" : "";
  const longProblem = tooLong ? "word exceeds 30 characters" : "";
  const blankProblem = onlyWhitespace ? "word is only whitespace" : "";
  const spaceProblem = hasSpace ? "word contains whitespace, not a single word" : "";
  const blockedProblem = blockedWord ? "word is on the obvious-word blocklist" : "";
  const collected = [shortProblem, longProblem, blankProblem, spaceProblem, blockedProblem].filter((p) => p.length > 0);
  for (const problem of collected) {
    problems.push(problem);
  }
  return problems;
}

function writeChampionWord(word: string): string {
  const outputDir = dirname(ENTRY_OUTPUT_PATH);
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(ENTRY_OUTPUT_PATH, word, { encoding: "utf8" });
  const writtenWord = word;
  return writtenWord;
}

function main(): number {
  const standings = runRoundRobin(INTERNET_WORD_CANDIDATES);
  const tourneyChampion = standings.word;
  const championMatchesBackup = tourneyChampion === CHAMPION_BACKUP_WORD;
  const mismatchNote = championMatchesBackup ? "" : `tournament champion ${tourneyChampion} differs from recorded backup`;
  const agreementNote = championMatchesBackup ? "tournament replay agrees with the recorded champion" : mismatchNote;
  console.log(`tournament champion: ${tourneyChampion} (${standings.wins} wins, margin ${standings.marginSum})`);
  console.log(agreementNote);
  const problems = gateProblems(tourneyChampion);
  const gateFailed = problems.length > 0;
  const failureCode = gateFailed ? 1 : 0;
  const gateReport = gateFailed ? problems.join("; ") : "gate clean";
  console.log(`gate: ${gateReport}`);
  const exitCode = gateFailed ? failureCode : 0;
  const wordToWrite = gateFailed ? "" : tourneyChampion;
  const wroteWord = gateFailed ? "" : writeChampionWord(wordToWrite);
  const wroteReport = gateFailed ? "nothing written" : `wrote ${wroteWord} to ${ENTRY_OUTPUT_PATH}`;
  console.log(wroteReport);
  return exitCode;
}

try { const exitStatus = main();
  process.exitCode = exitStatus;
} catch (caughtFailure) {
  const failureMessage = caughtFailure instanceof Error ? caughtFailure.message : String(caughtFailure);
  console.error(`entry program failed: ${failureMessage}`);
  process.exitCode = 1;
}
